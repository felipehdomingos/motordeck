import { listPublished } from '@/lib/vehicle-storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return Response.json(await listPublished(), { headers });
  } catch {
    return Response.json({ message: 'Catálogo temporariamente indisponível.' }, { headers, status: 503 });
  }
}
