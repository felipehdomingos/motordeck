import { passwordLink, sendInviteEmail } from './email';
import { findTenantInfo, inviteHours, inviteTenantOwner } from './platform';

// Cria o convite do administrador do cliente e tenta enviar por e-mail.
// Sem e-mail configurado, devolve o link para o dono da plataforma repassar (WhatsApp, por exemplo).
export async function deliverInvite(tenantId: string) {
  const [invite, info] = await Promise.all([inviteTenantOwner(tenantId), findTenantInfo(tenantId)]);
  if (!invite || !info?.host) return;
  const origin = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${info.host}`;
  const sent = await sendInviteEmail({ to: invite.owner.email, name: invite.owner.name, token: invite.token, origin, siteName: info.name, hours: inviteHours });
  return { sent, email: invite.owner.email, url: sent ? undefined : passwordLink(origin, invite.token) };
}
