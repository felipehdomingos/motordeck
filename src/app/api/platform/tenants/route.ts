import { createTenantWithAdmin, listTenants, normalizeDomain, validDomain, validTenantSlug } from '@/lib/platform';
import { platformError, platformJson, readJson, requirePlatform, text } from '@/lib/platform-api';
import { deliverInvite } from '@/lib/platform-invite';

export async function GET(request: Request) {
  const auth = await requirePlatform(request);
  if ('response' in auth) return auth.response;
  return platformJson(await listTenants());
}

export async function POST(request: Request) {
  const auth = await requirePlatform(request, true);
  if ('response' in auth) return auth.response;
  const body = await readJson(request);
  const name = text(body?.name);
  const slug = text(body?.slug).toLowerCase();
  const host = normalizeDomain(text(body?.host));
  const adminName = text(body?.adminName);
  const adminEmail = text(body?.adminEmail).toLowerCase();
  if (name.length < 2 || name.length > 120) return platformError('Informe o nome do cliente.');
  if (!validTenantSlug(slug)) return platformError('Identificador inválido: use de 3 a 40 letras minúsculas, números e hífen.');
  if (!validDomain(host)) return platformError('Domínio inválido. Exemplo: loja.seudominio.com.br');
  if (adminName.length < 2 || !/^\S+@\S+\.\S+$/.test(adminEmail)) return platformError('Informe o nome e o e-mail do administrador do cliente.');
  try {
    const { tenantId } = await createTenantWithAdmin({ slug, name, host, adminName, adminEmail });
    return platformJson({ id: tenantId, invite: await deliverInvite(tenantId) }, 201);
  } catch {
    return platformError('Não foi possível criar o cliente. O identificador ou o domínio já existe.', 409);
  }
}
