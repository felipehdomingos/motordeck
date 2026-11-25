import type { Vehicle } from './data';
import type { LocalVehicle } from './local-vehicles';
import { query } from './postgres';

export type PublishedVehicle = Vehicle & { manufactureYear: number };
type Details = Omit<LocalVehicle, 'slug' | 'images' | 'draft' | 'createdAt' | 'local'>;
type Row = { slug: string; details: Details; draft: boolean; images: string[]; photo_count: number; created_at: string };

export const validSlug = (slug: string) => /^local-[a-z0-9-]{1,60}$/.test(slug);
const table = 'vehicles';
const publicWhere = `draft = false AND details->>'status' <> 'Vendido'`;
const publicColumns = 'slug, details, cardinality(images)::int AS photo_count';
export async function checkDatabase() {
  await query<{ slug: string }>(`SELECT slug FROM ${table} LIMIT 1`);
}

function published(row: Row): PublishedVehicle {
  const { slug, details: d, photo_count } = row;
  return {
    slug, brand: d.brand, model: d.model, version: d.version, year: d.year,
    manufactureYear: d.manufactureYear, price: d.price, mileage: d.mileage,
    transmission: d.transmission, fuel: d.fuel, color: d.color, type: d.type,
    notes: d.notes, status: d.status, featured: d.featured,
    images: Array.from({ length: photo_count }, (_, i) => `/api/vehicle-photos/${slug}/${i + 1}`),
  };
}

export async function listPublished(tenantId: string) {
  const rows = await query<Row>(`SELECT ${publicColumns} FROM ${table} WHERE tenant_id = $1 AND ${publicWhere} ORDER BY created_at DESC, slug ASC`, [tenantId]);
  return rows.map(published);
}

export async function findPublished(tenantId: string, slug: string) {
  if (!validSlug(slug)) return;
  const [row] = await query<Row>(`SELECT ${publicColumns} FROM ${table} WHERE tenant_id = $1 AND ${publicWhere} AND slug = $2`, [tenantId, slug]);
  return row && published(row);
}

export async function findPhoto(tenantId: string, slug: string, position: string) {
  const [row] = await query<{ image: string }>(
    `SELECT images[$3::int] AS image FROM ${table} WHERE tenant_id = $1 AND slug = $2 AND ${publicWhere}`,
    [tenantId, slug, Number(position)],
  );
  return row?.image;
}

export async function listAdmin(tenantId: string) {
  const rows = await query<Row>(`SELECT slug, details, draft, images, created_at FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC, slug ASC`, [tenantId]);
  return rows.map(({ slug, details, draft, images, created_at }): LocalVehicle =>
    ({ ...details, slug, draft, images, createdAt: created_at, local: true }));
}

export async function storeVehicle(tenantId: string, record: LocalVehicle, imported: boolean) {
  const { slug, images, draft } = record;
  const details: Partial<LocalVehicle> = { ...record };
  delete details.slug;
  delete details.images;
  delete details.draft;
  delete details.local;
  delete details.createdAt;

  if (imported) {
    await query(
      `INSERT INTO ${table} (tenant_id, slug, details, draft, images, created_at) VALUES ($6, $1, $2::jsonb, $3, $4::text[], $5) ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [slug, JSON.stringify(details), draft, images, record.createdAt, tenantId],
    );
    return;
  }

  await query(
    `INSERT INTO ${table} (tenant_id, slug, details, draft, images) VALUES ($5, $1, $2::jsonb, $3, $4::text[])
     ON CONFLICT (tenant_id, slug) DO UPDATE SET details = EXCLUDED.details, draft = EXCLUDED.draft, images = EXCLUDED.images`,
    [slug, JSON.stringify(details), draft, images, tenantId],
  );
}

export async function deleteVehicle(tenantId: string, slug: string) {
  await query(`DELETE FROM ${table} WHERE tenant_id = $1 AND slug = $2`, [tenantId, slug]);
}
