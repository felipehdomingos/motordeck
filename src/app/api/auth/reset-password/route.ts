import { NextResponse } from 'next/server';
import { resetAdminPassword } from '@/lib/admin-access';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!token || password.length < 12) return NextResponse.json({ message: 'Use uma senha com pelo menos 12 caracteres.' }, { status: 400 });
  const changed = await resetAdminPassword(token, password);
  if (!changed) return NextResponse.json({ message: 'Link inválido ou expirado.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
