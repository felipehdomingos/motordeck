import { NextResponse } from 'next/server';
import { authenticatePlatform, createAdminSession, isPlatformHost, platformSessionCookie, sessionCookieOptions } from '@/lib/admin-access';
import { isSameOrigin } from '@/lib/origin';
import { platformError, readJson, text } from '@/lib/platform-api';

export async function POST(request: Request) {
  if (!isPlatformHost(request.headers)) return platformError('Não encontrado.', 404);
  if (!isSameOrigin(request)) return platformError('Origem inválida.', 403);
  const body = await readJson(request);
  const user = await authenticatePlatform(text(body?.username), typeof body?.password === 'string' ? body.password : '');
  if (!user) return platformError('Usuário ou senha incorretos.', 401);
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  response.cookies.set(sessionCookieOptions(await createAdminSession(user.id), undefined, platformSessionCookie));
  return response;
}
