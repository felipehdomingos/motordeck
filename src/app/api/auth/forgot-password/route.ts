import { NextResponse } from 'next/server';
import { createPasswordReset } from '@/lib/admin-access';
import { sendPasswordResetEmail } from '@/lib/email';
import { requestOrigin } from '@/lib/origin';
import { getTenant } from '@/lib/tenant';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const tenant = await getTenant(request.headers);
  if (email && tenant) {
    const reset = await createPasswordReset(tenant.id, email);
    if (reset) await sendPasswordResetEmail({ to: reset.user.email, name: reset.user.name, token: reset.token, origin: requestOrigin(request.headers) });
  }
  return NextResponse.json({ message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.' });
}
