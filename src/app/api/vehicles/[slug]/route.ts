import { getTenant } from '@/lib/tenant';
import { findPublished } from '@/lib/vehicle-storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const tenant = await getTenant(request.headers);
    if (!tenant) return Response.json({ message: 'Site não encontrado.' }, { headers, status: 404 });
    const vehicle = await findPublished(tenant.id, slug);
    if (!vehicle) {
      return Response.json({ message: 'Veículo não encontrado.' }, { headers, status: 404 });
    }
    return Response.json(vehicle, { headers });
  } catch {
    return Response.json({ message: 'Catálogo temporariamente indisponível.' }, { headers, status: 503 });
  }
}
