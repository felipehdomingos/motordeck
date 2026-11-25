// Link de senha sempre no domínio do cliente: o token só vale lá.
export function passwordLink(origin: string, token: string) {
  return `${origin}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

async function sendEmail(input: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;
  if (!apiKey || !from) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sendPasswordResetEmail(input: { to: string; name: string; token: string; origin: string }) {
  return sendEmail({
    to: input.to,
    subject: 'Redefinição de senha do MotorDeck',
    text: `Olá, ${input.name}. Acesse este link para criar uma nova senha: ${passwordLink(input.origin, input.token)}\n\nO link expira em 1 hora.`,
  });
}

export function sendInviteEmail(input: { to: string; name: string; token: string; origin: string; siteName: string; hours: number }) {
  return sendEmail({
    to: input.to,
    subject: `Seu acesso ao painel de ${input.siteName}`,
    text: `Olá, ${input.name}. Seu acesso ao painel de ${input.siteName} foi criado. Acesse este link para definir sua senha: ${passwordLink(input.origin, input.token)}\n\nO link vale por ${Math.round(input.hours)} horas e só pode ser usado uma vez.`,
  });
}
