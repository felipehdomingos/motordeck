import { getTenant } from '@/lib/tenant';
import { findPhoto, validSlug } from '@/lib/vehicle-storage';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; position: string }> }) {
  const { slug, position } = await params;
  if (!validSlug(slug) || !/^(?:[1-9]|1[0-2])$/.test(position)) return new Response(null, { status: 404 });
  try {
    const tenant = await getTenant(request.headers);
    if (!tenant) return new Response(null, { status: 404 });
    const image = await findPhoto(tenant.id, slug, position);
    if (!image) return new Response(null, { status: 404 });
    return new Response(Buffer.from(image.slice('data:image/jpeg;base64,'.length), 'base64'), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
