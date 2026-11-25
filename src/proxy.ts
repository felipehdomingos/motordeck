import { NextResponse, type NextRequest } from 'next/server';
import { adminSessionCookie, platformSessionCookie } from '@/lib/admin-access';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
  // Plataforma (dono): a checagem real de sessão e domínio fica na página e nas rotas; aqui só evita cache e corta o óbvio.
  const platformPublic = path === '/plataforma/login' || ['session', 'setup', 'login', 'logout'].some(name => path === `/api/platform/${name}`);
  const platform = !platformPublic && (path === '/plataforma' || path.startsWith('/plataforma/') || path.startsWith('/api/platform/'));
  if (platform && !request.cookies.get(platformSessionCookie)?.value) {
    if (path.startsWith('/api/platform/')) {
      return NextResponse.json({ message: 'Sessão da plataforma necessária.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.redirect(new URL('/plataforma/login', request.url));
  }
  if (admin && !request.cookies.get(adminSessionCookie)?.value) {
    if (path.startsWith('/api/admin/')) {
      return NextResponse.json({ message: 'Sessão administrativa necessária.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
  const response = NextResponse.next();
  if (admin || platform || platformPublic) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
