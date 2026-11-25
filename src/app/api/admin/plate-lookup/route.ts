import { getAdminSession, hasPermission } from '@/lib/admin-access';
import { lookupPlate, PlateLookupError, providerErrors } from '@/lib/placaefipe-server';
import { normalizePlate } from '@/lib/plate-lookup';

const headers = { 'Cache-Control': 'private, no-store' };
const error = (message: string, status: number) => Response.json({ message }, { status, headers });

export async function POST(request: Request) {
  const session = await getAdminSession(request.headers);
  if (!session) return error('Sessão administrativa necessária.', 401);
  if (!hasPermission(session, 'plate:lookup')) return error('Seu usuário não tem permissão para consultar placas.', 403);
  const origin = process.env.APP_ORIGIN;
  if (!origin || request.headers.get('origin') !== origin) return error('Origem inválida.', 403);

  const body = await request.json().catch(() => null);
  const plate = typeof body?.plate === 'string' ? normalizePlate(body.plate) : '';
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return error('Digite uma placa válida.', 400);

  try {
    return Response.json(await lookupPlate(plate), { headers });
  } catch (cause) {
    if (cause instanceof PlateLookupError && Object.hasOwn(providerErrors, cause.code)) {
      const failure = providerErrors[cause.code];
      return error(failure.message, failure.status);
    }
    return error('Placa & FIPE indisponível no momento.', 502);
  }
}
