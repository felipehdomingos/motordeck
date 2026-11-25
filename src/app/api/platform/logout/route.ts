import { NextResponse } from 'next/server';
import { isPlatformHost, platformSessionCookie, revokeAdminSession, sessionCookieOptions } from '@/lib/admin-access';
import { isSameOrigin } from '@/lib/origin';
import { platformError } from '@/lib/platform-api';

export async function POST(request: Request) {
  if (!isPlatformHost(request.headers)) return platformError('Não encontrado.', 404);
  if (!isSameOrigin(request)) return platformError('Origem inválida.', 403);
  await revokeAdminSession(request.headers, platformSessionCookie);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions('', 0, platformSessionCookie));
  return response;
}
