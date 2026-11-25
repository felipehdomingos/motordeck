import { NextResponse, type NextRequest } from 'next/server';
import { adminSessionCookie } from '@/lib/admin-access';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
  if (admin && !request.cookies.get(adminSessionCookie)?.value) {
    if (path.startsWith('/api/admin/')) {
      return NextResponse.json({ message: 'Sessão administrativa necessária.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
  const response = NextResponse.next();
  if (admin) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
