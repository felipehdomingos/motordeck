import { getPlatformSession, isPlatformHost, type AdminSession } from './admin-access';
import { isSameOrigin } from './origin';

const headers = { 'Cache-Control': 'private, no-store' };
export const platformJson = (body: unknown, status = 200) => Response.json(body, { status, headers });
export const platformError = (message: string, status = 400) => platformJson({ message }, status);

// Rotas /api/platform: só nos domínios da plataforma, com sessão de superadmin e, nas escritas, mesma origem.
export async function requirePlatform(request: Request, write = false): Promise<{ session: AdminSession } | { response: Response }> {
  if (!isPlatformHost(request.headers)) return { response: platformError('Não encontrado.', 404) };
  if (write && !isSameOrigin(request)) return { response: platformError('Origem inválida.', 403) };
  const session = await getPlatformSession(request.headers);
  if (!session) return { response: platformError('Sessão da plataforma necessária.', 401) };
  return { session };
}

export async function readJson(request: Request) {
  return await request.json().catch(() => null) as Record<string, unknown> | null;
}

export const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
