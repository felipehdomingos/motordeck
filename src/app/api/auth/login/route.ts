import { NextResponse } from 'next/server';
import { authenticateAdmin, createAdminSession, sessionCookieOptions } from '@/lib/admin-access';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Dados de acesso inválidos.' }, { status: 400 });
  }

  const credentials = body as { username?: unknown; password?: unknown };
  const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
  const password = typeof credentials.password === 'string' ? credentials.password : '';
  const user = await authenticateAdmin(username, password);
  if (!user) {
    return NextResponse.json({ message: 'Usuário ou senha incorretos.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions(await createAdminSession(user.id)));
  return response;
}
