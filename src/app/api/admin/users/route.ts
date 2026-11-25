import { createAdminUser, createInvite, getAdminSession, hasPermission, inviteTtlHours, pendingPasswordHash, type AdminPermission } from '@/lib/admin-access';
import { passwordLink, sendInviteEmail } from '@/lib/email';
import { isSameOrigin, requestOrigin } from '@/lib/origin';
import { usernameFromEmail } from '@/lib/platform';
import { query } from '@/lib/postgres';
import { getTenant } from '@/lib/tenant';

const allowedRoles = ['admin', 'editor', 'viewer'];
const allowedPermissions = new Set<AdminPermission>(['vehicles:read', 'vehicles:write', 'vehicles:delete', 'plate:lookup', 'users:manage']);
const error = (message: string, status = 400) => Response.json({ message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function manager(request: Request, write = false) {
  if (write && !isSameOrigin(request)) return { response: error('Origem inválida.', 403) };
  const session = await getAdminSession(request.headers);
  if (!session) return { response: error('Sessão administrativa necessária.', 401) };
  if (!hasPermission(session, 'users:manage')) return { response: error('Seu usuário não pode gerenciar acessos.', 403) };
  if (!session.tenantId) return { response: error('Seu usuário não pertence a este site.', 403) };
  return { session, tenantId: session.tenantId };
}

export async function GET(request: Request) {
  const auth = await manager(request);
  if ('response' in auth) return auth.response;
  const users = await query<{ id: string; username: string; email: string; name: string; role: string; permissions: unknown; active: boolean; created_at: string; pending: boolean }>(
    'SELECT id, username, email, name, role, permissions, active, created_at, (password_hash = $2) AS pending FROM admin_users WHERE tenant_id = $1 ORDER BY created_at ASC',
    [auth.tenantId, pendingPasswordHash],
  );
  return Response.json(users, { headers: { 'Cache-Control': 'private, no-store' } });
}

// Link de definição de senha, enviado por e-mail; sem e-mail configurado, volta para o administrador repassar.
async function deliverInvite(request: Request, user: { id: string; email: string; name: string }) {
  const tenant = await getTenant(request.headers);
  const origin = requestOrigin(request.headers);
  const token = await createInvite(user.id);
  const sent = await sendInviteEmail({ to: user.email, name: user.name, token, origin, siteName: tenant?.name ?? 'MotorDeck', hours: inviteTtlHours });
  return { sent, url: sent ? undefined : passwordLink(origin, token) };
}

export async function POST(request: Request) {
  const auth = await manager(request, true);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username = typeof body?.username === 'string' && body.username.trim() ? body.username.trim().toLowerCase() : usernameFromEmail(email);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const role = typeof body?.role === 'string' ? body.role : 'editor';
  const permissions = Array.isArray(body?.permissions) ? body.permissions.filter((value: unknown): value is AdminPermission => typeof value === 'string' && allowedPermissions.has(value as AdminPermission)) : [];
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || !allowedRoles.includes(role)) {
    return error('Confira nome, e-mail e perfil.');
  }
  try {
    const user = await createAdminUser({ tenantId: auth.tenantId, username, email, name, password: null, role, permissions });
    const invite = await deliverInvite(request, user);
    return Response.json({ id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, permissions: user.permissions, invite }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return error('Não foi possível criar este acesso. Usuário ou e-mail pode já existir.', 409);
  }
}

// Reenvia o convite de quem ainda não definiu a senha.
export async function PATCH(request: Request) {
  const auth = await manager(request, true);
  if ('response' in auth) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  const [user] = id ? await query<{ id: string; email: string; name: string }>(
    'SELECT id, email, name FROM admin_users WHERE id = $1 AND tenant_id = $2 AND active AND password_hash = $3', [id, auth.tenantId, pendingPasswordHash]) : [];
  if (!user) return error('Este usuário já definiu a senha ou não existe.', 404);
  return Response.json({ invite: await deliverInvite(request, user) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: Request) {
  const auth = await manager(request, true);
  if ('response' in auth) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === auth.session?.id) return error('Não é possível desativar este usuário.', 400);
  const changed = await query<{ id: string }>('UPDATE admin_users SET active = false WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, auth.tenantId]);
  if (!changed.length) return error('Usuário não encontrado.', 404);
  await query('DELETE FROM admin_sessions WHERE user_id = $1', [id]);
  return new Response(null, { status: 204 });
}
