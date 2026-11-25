import { randomBytes } from 'node:crypto';
import { adminPermissions, createAdminUser, createInvite, inviteTtlHours, pendingPasswordHash } from './admin-access';
import { query } from './postgres';
import { clearTenantCache } from './tenant';

export type TenantSummary = {
  id: string; slug: string; name: string; status: 'active' | 'suspended'; created_at: string;
  domains: string[]; admins: number; pending_admins: number; vehicles: number;
};

export const validTenantSlug = (value: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value);
export const validDomain = (value: string) => value.length <= 253 && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value);
const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

// "joao.silva+x@loja.com" -> "joao.silva-x"; só letras, números, ponto, hífen e sublinhado.
export function usernameFromEmail(email: string) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '');
  return (base.length >= 3 ? base : `${base}-user`).slice(0, 40);
}

export async function listTenants() {
  return query<TenantSummary>(
    `SELECT t.id, t.slug, t.name, t.status, t.created_at,
       COALESCE((SELECT array_agg(d.host ORDER BY d.host) FROM tenant_domains d WHERE d.tenant_id = t.id), '{}') AS domains,
       (SELECT count(*)::int FROM admin_users u WHERE u.tenant_id = t.id AND u.active) AS admins,
       (SELECT count(*)::int FROM admin_users u WHERE u.tenant_id = t.id AND u.active AND u.password_hash = $1) AS pending_admins,
       (SELECT count(*)::int FROM vehicles v WHERE v.tenant_id = t.id) AS vehicles
     FROM tenants t ORDER BY t.created_at ASC`,
    [pendingPasswordHash],
  );
}

export type NewTenant = { slug: string; name: string; host: string; adminName: string; adminEmail: string };

// Tudo em uma única instrução: o cliente, o domínio e o administrador são criados juntos ou nenhum deles.
export async function createTenantWithAdmin(input: NewTenant) {
  const tenantId = randomBytes(8).toString('hex');
  const userId = randomBytes(16).toString('hex');
  const email = input.adminEmail.toLowerCase();
  await query(
    `WITH t AS (INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3) RETURNING id),
          d AS (INSERT INTO tenant_domains (host, tenant_id) SELECT $4, id FROM t RETURNING host)
     INSERT INTO admin_users (id, tenant_id, username, email, name, password_hash, role, permissions)
     SELECT $5, id, $6, $7, $8, $9, 'owner', $10::jsonb FROM t`,
    [tenantId, input.slug, input.name.trim(), input.host, userId, usernameFromEmail(email), email, input.adminName.trim(), pendingPasswordHash, JSON.stringify(adminPermissions)],
  );
  return { tenantId, userId };
}

export async function setTenantStatus(tenantId: string, status: 'active' | 'suspended') {
  const rows = await query<{ id: string }>('UPDATE tenants SET status = $2 WHERE id = $1 RETURNING id', [tenantId, status]);
  clearTenantCache();
  return rows.length > 0;
}

export async function addTenantDomain(tenantId: string, host: string) {
  await query('INSERT INTO tenant_domains (host, tenant_id) VALUES ($1, $2)', [host, tenantId]);
  clearTenantCache();
}

export async function findTenantOwner(tenantId: string) {
  const [row] = await query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM admin_users WHERE tenant_id = $1 AND role = 'owner' AND active ORDER BY created_at ASC LIMIT 1`,
    [tenantId],
  );
  return row;
}

export async function findTenantInfo(tenantId: string) {
  const [row] = await query<{ id: string; name: string; host: string | null }>(
    `SELECT t.id, t.name, (SELECT d.host FROM tenant_domains d WHERE d.tenant_id = t.id ORDER BY d.created_at ASC LIMIT 1) AS host
     FROM tenants t WHERE t.id = $1`,
    [tenantId],
  );
  return row;
}

export async function inviteTenantOwner(tenantId: string) {
  const owner = await findTenantOwner(tenantId);
  if (!owner) return;
  return { owner, token: await createInvite(owner.id) };
}

export async function createPlatformAdmin(input: { username: string; email: string; name: string; password: string }) {
  return createAdminUser({ tenantId: null, username: input.username, email: input.email, name: input.name, password: input.password, role: 'superadmin', permissions: [] });
}

export const inviteHours = inviteTtlHours;
export const emailLooksValid = validEmail;
