import { NextResponse, type NextRequest } from 'next/server';
import { adminChallenge, hasAdminAccess } from '@/lib/admin-access';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
  if (admin && !hasAdminAccess(request.headers)) return adminChallenge();
  const response = NextResponse.next();
  if (admin) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
