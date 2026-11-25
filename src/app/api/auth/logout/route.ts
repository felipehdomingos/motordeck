import { NextResponse } from 'next/server';
import { revokeAdminSession, sessionCookieOptions } from '@/lib/admin-access';

export async function POST(request: Request) {
  await revokeAdminSession(request.headers);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions('', 0));
  return response;
}
