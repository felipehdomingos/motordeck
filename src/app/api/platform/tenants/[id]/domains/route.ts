import { addTenantDomain, normalizeDomain, validDomain } from '@/lib/platform';
import { platformError, readJson, requirePlatform, text } from '@/lib/platform-api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatform(request, true);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const host = normalizeDomain(text((await readJson(request))?.host));
  if (!validDomain(host)) return platformError('Domínio inválido. Exemplo: loja.seudominio.com.br');
  try {
    await addTenantDomain(id, host);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return platformError('Não foi possível adicionar. O domínio já está em uso ou o cliente não existe.', 409);
  }
}
