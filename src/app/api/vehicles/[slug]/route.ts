import { findPublished } from '@/lib/vehicle-storage';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const vehicle = await findPublished(slug);
    if (!vehicle) {
      return Response.json({ message: 'Veículo não encontrado.' }, { headers, status: 404 });
    }
    return Response.json(vehicle, { headers });
  } catch {
    return Response.json({ message: 'Catálogo temporariamente indisponível.' }, { headers, status: 503 });
  }
}
