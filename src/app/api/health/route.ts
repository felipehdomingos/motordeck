import { checkDatabase } from '@/lib/vehicle-storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await checkDatabase();
    return Response.json({ status: 'ok' }, { headers });
  } catch {
    return Response.json({ status: 'unavailable' }, { headers, status: 503 });
  }
}
