import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './postgres';

export const adminSessionCookie = 'motordeck_admin_session';
export const adminSessionMaxAge = 8 * 60 * 60;
export const adminPermissions = ['vehicles:read', 'vehicles:write', 'vehicles:delete', 'plate:lookup', 'users:manage'] as const;
export type AdminPermission = typeof adminPermissions[number];
export type AdminSession = { id: string; username: string; email: string; name: string; role: string; permissions: AdminPermission[] };
type AdminRow = { id: string; username: string; email: string; name: string; role: string; permissions: unknown; password_hash: string };
const scrypt = promisify(nodeScrypt) as unknown as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

function equalBytes(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(headers: Headers) {
  const cookie = headers.get('cookie') || '';
  const entry = cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${adminSessionCookie}=`));
  return entry?.slice(adminSessionCookie.length + 1) || '';
}

function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AdminPermission => typeof item === 'string' && adminPermissions.includes(item as AdminPermission));
}

function publicUser(row: Pick<AdminRow, 'id' | 'username' | 'email' | 'name' | 'role' | 'permissions'>): AdminSession {
  return { id: row.id, username: row.username, email: row.email, name: row.name, role: row.role, permissions: normalizePermissions(row.permissions) };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }) as Buffer;
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, n, r, p, saltText, hashText] = stored.split('$');
  if (n !== '16384' || r !== '8' || p !== '1' || !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) }) as Buffer;
  return equalBytes(actual, expected);
}

export async function hasAdminUsers() {
  const [row] = await query<{ count: number }>('SELECT count(*)::int AS count FROM admin_users');
  return Number(row?.count || 0) > 0;
}

export async function findAdminByUsername(username: string) {
  const identity = username.toLowerCase();
  const [row] = await query<AdminRow>('SELECT id, username, email, name, role, permissions, password_hash FROM admin_users WHERE (username = $1 OR email = $1) AND active = true', [identity]);
  return row;
}

export async function authenticateAdmin(username: string, password: string) {
  const row = await findAdminByUsername(username);
  if (!row || !(await verifyPassword(password, row.password_hash))) return;
  return publicUser(row);
}

export async function createAdminUser(input: { username: string; email: string; name: string; password: string; role: string; permissions: AdminPermission[] }) {
  const id = randomBytes(16).toString('hex');
  const passwordHash = await hashPassword(input.password);
  const [row] = await query<AdminRow>(
    `INSERT INTO admin_users (id, username, email, name, password_hash, role, permissions)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, username, email, name, role, permissions, password_hash`,
    [id, input.username.toLowerCase(), input.email.toLowerCase(), input.name.trim(), passwordHash, input.role, JSON.stringify(input.permissions)],
  );
  return publicUser(row);
}

export async function createAdminSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO admin_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 second'))`,
    [tokenHash(token), userId, adminSessionMaxAge],
  );
  return token;
}

export async function revokeAdminSession(headers: Headers) {
  const token = cookieValue(headers);
  if (token) await query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash(token)]);
}

export async function createPasswordReset(email: string) {
  const [user] = await query<{ id: string; email: string; name: string }>('SELECT id, email, name FROM admin_users WHERE email = $1 AND active = true', [email.toLowerCase()]);
  if (!user) return;
  const token = randomBytes(32).toString('base64url');
  await query('DELETE FROM admin_password_resets WHERE user_id = $1 OR expires_at <= now()', [user.id]);
  await query(
    `INSERT INTO admin_password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
    [tokenHash(token), user.id],
  );
  return { token, user };
}

export async function resetAdminPassword(token: string, password: string) {
  const [reset] = await query<{ user_id: string }>(
    `SELECT user_id FROM admin_password_resets WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL`,
    [tokenHash(token)],
  );
  if (!reset) return false;
  const passwordHash = await hashPassword(password);
  await query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
  await query('UPDATE admin_password_resets SET used_at = now() WHERE token_hash = $1', [tokenHash(token)]);
  await query('DELETE FROM admin_sessions WHERE user_id = $1', [reset.user_id]);
  return true;
}

export async function getAdminSession(headers: Headers): Promise<AdminSession | undefined> {
  const token = cookieValue(headers);
  if (!token) return;
  const [row] = await query<AdminRow>(
    `SELECT u.id, u.username, u.email, u.name, u.role, u.permissions, u.password_hash
     FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
    [tokenHash(token)],
  );
  return row && publicUser(row);
}

export async function hasAdminAccess(headers: Headers) {
  return Boolean(await getAdminSession(headers));
}

export function hasPermission(session: AdminSession | undefined, permission: AdminPermission) {
  return Boolean(session && (session.role === 'owner' || session.permissions.includes(permission)));
}

export function sessionCookieOptions(value: string, maxAge = adminSessionMaxAge) {
  return {
    name: adminSessionCookie,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function setupTokenIsValid(value: string) {
  const configured = process.env.ADMIN_SETUP_TOKEN || '';
  return Boolean(configured && equalBytes(createHash('sha256').update(value).digest(), createHash('sha256').update(configured).digest()));
}
