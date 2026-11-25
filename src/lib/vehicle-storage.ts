import type { Vehicle } from './data';
import type { LocalVehicle } from './local-vehicles';
import { query } from './postgres';

export type PublishedVehicle = Vehicle & { manufactureYear: number };
type Details = Omit<LocalVehicle, 'slug' | 'images' | 'draft' | 'createdAt' | 'local'>;
type Row = { slug: string; details: Details; draft: boolean; images: string[]; photo_count: number; created_at: string };

export const validSlug = (slug: string) => /^local-[a-z0-9-]{1,60}$/.test(slug);
const table = 'mesquiatti_vehicles';
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

export async function listPublished() {
  const rows = await query<Row>(`SELECT ${publicColumns} FROM ${table} WHERE ${publicWhere} ORDER BY created_at DESC, slug ASC`);
  return rows.map(published);
}

export async function findPublished(slug: string) {
  if (!validSlug(slug)) return;
  const [row] = await query<Row>(`SELECT ${publicColumns} FROM ${table} WHERE ${publicWhere} AND slug = $1`, [slug]);
  return row && published(row);
}

export async function findPhoto(slug: string, position: string) {
  const [row] = await query<{ image: string }>(
    `SELECT images[$2::int] AS image FROM ${table} WHERE slug = $1 AND ${publicWhere}`,
    [slug, Number(position)],
  );
  return row?.image;
}

export async function listAdmin() {
  const rows = await query<Row>(`SELECT slug, details, draft, images, created_at FROM ${table} ORDER BY created_at DESC, slug ASC`);
  return rows.map(({ slug, details, draft, images, created_at }): LocalVehicle =>
    ({ ...details, slug, draft, images, createdAt: created_at, local: true }));
}

export async function storeVehicle(record: LocalVehicle, imported: boolean) {
  const { slug, images, draft } = record;
  const details: Partial<LocalVehicle> = { ...record };
  delete details.slug;
  delete details.images;
  delete details.draft;
  delete details.local;
  delete details.createdAt;

  if (imported) {
    await query(
      `INSERT INTO ${table} (slug, details, draft, images, created_at) VALUES ($1, $2::jsonb, $3, $4::text[], $5) ON CONFLICT (slug) DO NOTHING`,
      [slug, JSON.stringify(details), draft, images, record.createdAt],
    );
    return;
  }

  await query(
    `INSERT INTO ${table} (slug, details, draft, images) VALUES ($1, $2::jsonb, $3, $4::text[])
     ON CONFLICT (slug) DO UPDATE SET details = EXCLUDED.details, draft = EXCLUDED.draft, images = EXCLUDED.images`,
    [slug, JSON.stringify(details), draft, images],
  );
}

export async function deleteVehicle(slug: string) {
  await query(`DELETE FROM ${table} WHERE slug = $1`, [slug]);
}
