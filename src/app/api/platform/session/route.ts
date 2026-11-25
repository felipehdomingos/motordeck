import { getPlatformSession, hasPlatformAdmin, isPlatformHost } from '@/lib/admin-access';
import { platformError, platformJson } from '@/lib/platform-api';

export async function GET(request: Request) {
  if (!isPlatformHost(request.headers)) return platformError('Não encontrado.', 404);
  const session = await getPlatformSession(request.headers);
  return platformJson({
    authenticated: Boolean(session),
    setupRequired: !(await hasPlatformAdmin()),
    user: session ? { name: session.name, email: session.email } : null,
  });
}
