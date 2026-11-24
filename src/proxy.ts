import { NextResponse, type NextRequest } from 'next/server';
import { adminChallenge, hasAdminAccess } from '@/lib/admin-access';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const admin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
  const stagePrivate = process.env.APP_ENV === 'stage' && path !== '/api/health';
  if ((admin || stagePrivate) && !hasAdminAccess(request.headers)) return adminChallenge();
  const response = NextResponse.next();
  if (admin || process.env.APP_ENV === 'stage') response.headers.set('Cache-Control', 'private, no-store');
  if (process.env.APP_ENV === 'stage') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
