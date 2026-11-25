import { setTenantStatus } from '@/lib/platform';
import { platformError, readJson, requirePlatform, text } from '@/lib/platform-api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatform(request, true);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const status = text((await readJson(request))?.status);
  if (status !== 'active' && status !== 'suspended') return platformError('Status inválido.');
  if (!(await setTenantStatus(id, status))) return platformError('Cliente não encontrado.', 404);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}
