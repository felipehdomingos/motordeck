import { getTenant } from '@/lib/tenant';
import { listPublished } from '@/lib/vehicle-storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const tenant = await getTenant(request.headers);
    if (!tenant) return Response.json({ message: 'Site não encontrado.' }, { headers, status: 404 });
    return Response.json(await listPublished(tenant.id), { headers });
  } catch {
    return Response.json({ message: 'Catálogo temporariamente indisponível.' }, { headers, status: 503 });
  }
}
