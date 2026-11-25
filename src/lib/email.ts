export async function sendPasswordResetEmail(input: { to: string; name: string; token: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;
  const origin = process.env.APP_ORIGIN;
  if (!apiKey || !from || !origin) return false;
  const resetUrl = `${origin}/redefinir-senha?token=${encodeURIComponent(input.token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: 'Redefinição de senha do MotorDeck',
      text: `Olá, ${input.name}. Acesse este link para criar uma nova senha: ${resetUrl}\n\nO link expira em 1 hora.`,
    }),
  });
  return response.ok;
}
