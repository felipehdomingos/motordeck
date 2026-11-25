import { NextResponse } from 'next/server';
import { resetAdminPassword } from '@/lib/admin-access';
import { getTenant } from '@/lib/tenant';

export async function POST(request: Request) {
  const tenant = await getTenant(request.headers);
  if (!tenant) return NextResponse.json({ message: 'Link inválido ou expirado.' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!token || password.length < 12) return NextResponse.json({ message: 'Use uma senha com pelo menos 12 caracteres.' }, { status: 400 });
  const changed = await resetAdminPassword(tenant.id, token, password);
  if (!changed) return NextResponse.json({ message: 'Link inválido ou expirado.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
