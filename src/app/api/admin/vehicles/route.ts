import { adminChallenge, hasAdminAccess } from '@/lib/admin-access';
import type { LocalVehicle } from '@/lib/local-vehicles';
import { deleteVehicle, listAdmin, storeVehicle, validSlug } from '@/lib/vehicle-storage';

const maxBody = 7 * 1024 * 1024;
const textFields = ['brand', 'model', 'version', 'plate', 'transmission', 'fuel', 'color', 'type', 'notes'] as const;
const numbers = ['year', 'manufactureYear', 'mileage', 'price'] as const;
const bad = (message: string, status = 400) => Response.json({ message }, { status });

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return;
  const parts: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBody) {
      await reader.cancel();
      return;
    }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

function validVehicle(v: Partial<LocalVehicle> | undefined): v is LocalVehicle {
  if (!v || typeof v.slug !== 'string' || !validSlug(v.slug) || typeof v.draft !== 'boolean') return false;
  if (!textFields.every(k => typeof v[k] === 'string' && v[k].length <= (k === 'notes' ? 5000 : 200))) return false;
  if (!v.brand?.trim() || !v.model?.trim() || !['Disponível', 'Reservado', 'Vendido'].includes(v.status ?? '')) return false;
  if (!numbers.every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 1e9)) return false;
  if (!Number.isInteger(v.year) || !Number.isInteger(v.manufactureYear) || v.year! > 2200 || v.manufactureYear! > 2200) return false;
  if (v.fipe !== undefined && (typeof v.fipe !== 'number' || !Number.isFinite(v.fipe) || v.fipe < 0)) return false;
  if (![v.fipeCode, v.fipeReference].every(value => value === undefined || (typeof value === 'string' && value.length <= 200))) return false;
  if (!Array.isArray(v.images) || v.images.length > 12 || !v.images.every(image =>
    typeof image === 'string' && image.length <= 550_000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image))) return false;
  return v.draft || (v.year! >= 1900 && v.price! > 0 && v.images.length > 0);
}

export async function GET(request: Request) {
  if (!hasAdminAccess(request.headers)) return adminChallenge();
  try {
    return Response.json(await listAdmin(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return bad('Não foi possível carregar os veículos do banco.', 503);
  }
}

export async function POST(request: Request) {
  if (!hasAdminAccess(request.headers)) return adminChallenge();
  if (request.headers.get('origin') !== process.env.APP_ORIGIN) return bad('Origem inválida.', 403);
  if (request.headers.get('content-type') !== 'application/json') return bad('Formato inválido.', 415);
  let body;
  try {
    body = await readBody(request);
  } catch {
    return bad('Dados inválidos.');
  }
  const { record, imported } = body ?? {};
  if (!validVehicle(record)) return bad('Confira os dados e as fotos do veículo.');
  if (imported && (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)))) {
    return bad('Data de cadastro inválida.');
  }
  try {
    await storeVehicle(record, imported === true);
    return new Response(null, { status: 204 });
  } catch {
    return bad('Não foi possível salvar o veículo no banco.', 503);
  }
}

export async function DELETE(request: Request) {
  if (!hasAdminAccess(request.headers)) return adminChallenge();
  if (request.headers.get('origin') !== process.env.APP_ORIGIN) return bad('Origem inválida.', 403);
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug || !validSlug(slug)) return bad('Veículo inválido.');
  try {
    await deleteVehicle(slug);
    return new Response(null, { status: 204 });
  } catch {
    return bad('Não foi possível excluir o veículo do banco.', 503);
  }
}
