import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminUsers } from '@/lib/admin-access';

export async function GET(request: Request) {
  const user = await getAdminSession(request.headers);
  return NextResponse.json(
    { authenticated: Boolean(user), setupRequired: !(await hasAdminUsers()), user: user ? { ...user, permissions: user.permissions } : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
