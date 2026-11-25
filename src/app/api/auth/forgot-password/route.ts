import { NextResponse } from 'next/server';
import { createPasswordReset } from '@/lib/admin-access';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email) {
    const reset = await createPasswordReset(email);
    if (reset) await sendPasswordResetEmail({ to: reset.user.email, name: reset.user.name, token: reset.token });
  }
  return NextResponse.json({ message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.' });
}
