import { NextResponse } from 'next/server';
import { createAdminUser, hasAdminUsers, setupTokenIsValid } from '@/lib/admin-access';

export async function POST(request: Request) {
  if (await hasAdminUsers()) return NextResponse.json({ message: 'O administrador inicial já foi criado.' }, { status: 409 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: 'Dados inválidos.' }, { status: 400 }); }
  const data = body as { setupToken?: unknown; username?: unknown; email?: unknown; name?: unknown; password?: unknown };
  const setupToken = typeof data.setupToken === 'string' ? data.setupToken : '';
  const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  if (!setupTokenIsValid(setupToken)) return NextResponse.json({ message: 'Código inicial inválido.' }, { status: 401 });
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || password.length < 12) {
    return NextResponse.json({ message: 'Informe nome, e-mail, usuário válido e senha com pelo menos 12 caracteres.' }, { status: 400 });
  }
  try {
    const user = await createAdminUser({ username, email, name, password, role: 'owner', permissions: ['vehicles:read', 'vehicles:write', 'vehicles:delete', 'plate:lookup', 'users:manage'] });
    return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, name: user.name } }, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Não foi possível criar o administrador.' }, { status: 409 });
  }
}
