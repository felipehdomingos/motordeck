import { adminPermissions, createAdminUser } from '@/lib/admin-access';
import { findTenantOwner, usernameFromEmail } from '@/lib/platform';
import { platformError, platformJson, readJson, requirePlatform, text } from '@/lib/platform-api';
import { deliverInvite } from '@/lib/platform-invite';

// Reenvia o convite do administrador do cliente. Se o cliente ainda não tem administrador
// (caso do primeiro cliente, criado antes do painel), cria um a partir de adminName e adminEmail.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatform(request, true);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!(await findTenantOwner(id))) {
    const body = await readJson(request);
    const name = text(body?.adminName);
    const email = text(body?.adminEmail).toLowerCase();
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return platformError('Este cliente ainda não tem administrador. Informe o nome e o e-mail dele.');
    try {
      await createAdminUser({ tenantId: id, username: usernameFromEmail(email), email, name, password: null, role: 'owner', permissions: [...adminPermissions] });
    } catch {
      return platformError('Não foi possível criar o administrador. Cliente inexistente ou e-mail já em uso.', 409);
    }
  }
  const invite = await deliverInvite(id);
  if (!invite) return platformError('Cliente sem administrador ou sem domínio.', 404);
  return platformJson({ invite });
}
