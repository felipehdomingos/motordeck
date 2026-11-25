import { getAdminSession, hasPermission, type AdminPermission, createAdminUser } from '@/lib/admin-access';
import { query } from '@/lib/postgres';

const allowedRoles = ['admin', 'editor', 'viewer'];
const allowedPermissions = new Set<AdminPermission>(['vehicles:read', 'vehicles:write', 'vehicles:delete', 'plate:lookup', 'users:manage']);
const error = (message: string, status = 400) => Response.json({ message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function manager(request: Request) {
  const session = await getAdminSession(request.headers);
  if (!session) return { response: error('Sessão administrativa necessária.', 401) };
  if (!hasPermission(session, 'users:manage')) return { response: error('Seu usuário não pode gerenciar acessos.', 403) };
  return { session };
}

export async function GET(request: Request) {
  const auth = await manager(request);
  if ('response' in auth) return auth.response;
  const users = await query<{ id: string; username: string; email: string; name: string; role: string; permissions: unknown; active: boolean; created_at: string }>(
    'SELECT id, username, email, name, role, permissions, active, created_at FROM admin_users ORDER BY created_at ASC',
  );
  return Response.json(users, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const auth = await manager(request);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const role = typeof body?.role === 'string' ? body.role : 'editor';
  const permissions = Array.isArray(body?.permissions) ? body.permissions.filter((value: unknown): value is AdminPermission => typeof value === 'string' && allowedPermissions.has(value as AdminPermission)) : [];
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || password.length < 12 || !allowedRoles.includes(role)) {
    return error('Confira nome, e-mail, usuário, perfil e uma senha com pelo menos 12 caracteres.');
  }
  try {
    const user = await createAdminUser({ username, email, name, password, role, permissions });
    return Response.json({ id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, permissions: user.permissions }, { status: 201 });
  } catch {
    return error('Não foi possível criar este acesso. Usuário ou e-mail pode já existir.', 409);
  }
}

export async function DELETE(request: Request) {
  const auth = await manager(request);
  if ('response' in auth) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === auth.session?.id) return error('Não é possível desativar este usuário.', 400);
  await query('UPDATE admin_users SET active = false WHERE id = $1', [id]);
  await query('DELETE FROM admin_sessions WHERE user_id = $1', [id]);
  return new Response(null, { status: 204 });
}
