import { NextResponse } from 'next/server';
import { authenticateAdmin, createAdminSession, sessionCookieOptions } from '@/lib/admin-access';
import { isSameOrigin } from '@/lib/origin';
import { getTenant } from '@/lib/tenant';

export async function POST(request: Request) {
  const tenant = await getTenant(request.headers);
  if (!tenant) return NextResponse.json({ message: 'Site não encontrado.' }, { status: 404 });
  if (!isSameOrigin(request)) return NextResponse.json({ message: 'Origem inválida.' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Dados de acesso inválidos.' }, { status: 400 });
  }

  const credentials = body as { username?: unknown; password?: unknown };
  const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
  const password = typeof credentials.password === 'string' ? credentials.password : '';
  const user = await authenticateAdmin(tenant.id, username, password);
  if (!user) {
    return NextResponse.json({ message: 'Usuário ou senha incorretos.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions(await createAdminSession(user.id)));
  return response;
}
