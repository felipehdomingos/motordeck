import type { Vehicle } from './data';
import type { LocalVehicle } from './local-vehicles';

export type PublishedVehicle = Vehicle & { manufactureYear: number };
type Details = Omit<LocalVehicle, 'slug' | 'images' | 'draft' | 'createdAt' | 'local'>;
type Row = { slug: string; details: Details; draft: boolean; images: string[]; photo_count: number; created_at: string };
export const validSlug = (slug: string) => /^local-[a-z0-9-]{1,60}$/.test(slug);
const table = 'mesquiatti_vehicles';

async function database<T>(resource: string, query: Record<string, string>, init?: RequestInit): Promise<T> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error('PostgreSQL não configurado');
  const url = new URL(`/rest/v1/${resource}`, base);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { apikey: key, ...(!key.startsWith('sb_secret_') && { Authorization: `Bearer ${key}` }), ...init?.headers },
  });
  if (!response.ok) throw new Error(`PostgreSQL retornou HTTP ${response.status}`);
  if (init?.method === 'POST' || init?.method === 'DELETE') return undefined as T;
  return response.json();
}

const publicFilter = { draft: 'eq.false', 'details->>status': 'neq.Vendido' };
const publicColumns = 'slug,details,photo_count';

export async function checkDatabase() {
  await database(table, { select: 'slug', limit: '1' });
  await database('mesquiatti_vehicle_photos', { select: 'slug', limit: '1' });
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
  const rows = await database<Row[]>(table, { ...publicFilter, select: publicColumns, order: 'created_at.desc,slug.asc' });
  return rows.map(published);
}

export async function findPublished(slug: string) {
  if (!validSlug(slug)) return;
  const [row] = await database<Row[]>(table, { ...publicFilter, slug: `eq.${slug}`, select: publicColumns });
  return row && published(row);
}

export async function findPhoto(slug: string, position: string) {
  const [row] = await database<{ image: string }[]>('mesquiatti_vehicle_photos', {
    slug: `eq.${slug}`, position: `eq.${position}`, select: 'image',
  });
  return row?.image;
}

export async function listAdmin() {
  const rows = await database<Row[]>(table, { select: 'slug,details,draft,images,created_at', order: 'created_at.desc,slug.asc' });
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
  await database(table, { on_conflict: 'slug' }, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: imported ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates' },
    body: JSON.stringify({ slug, images, draft, details, ...(imported && { created_at: record.createdAt }) }),
  });
}

export async function deleteVehicle(slug: string) {
  await database(table, { slug: `eq.${slug}` }, { method: 'DELETE' });
}
