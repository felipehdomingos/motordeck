import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminUsers } from '@/lib/admin-access';
import { getTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const tenant = await getTenant(request.headers);
  if (!tenant) return NextResponse.json({ message: 'Site não encontrado.' }, { status: 404 });
  const user = await getAdminSession(request.headers);
  return NextResponse.json(
    { authenticated: Boolean(user), setupRequired: !(await hasAdminUsers(tenant.id)), user: user ? { ...user, permissions: user.permissions } : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
