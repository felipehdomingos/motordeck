import { query } from './postgres';

export type Tenant = { id: string; slug: string; name: string; status: 'active' | 'suspended'; settings: Record<string, unknown> };

const ttlMs = 60_000;
const cache = new Map<string, { at: number; tenant: Tenant | null }>();

export function normalizeHost(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

export function clearTenantCache() {
  cache.clear();
}

// O cliente é sempre decidido pelo domínio da requisição (cabeçalho Host), nunca por dado enviado pelo navegador.
export async function findTenantByHost(rawHost: string | null | undefined): Promise<Tenant | undefined> {
  const host = normalizeHost(rawHost);
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return;
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < ttlMs) return hit.tenant ?? undefined;
  const [row] = await query<Tenant>(
    `SELECT t.id, t.slug, t.name, t.status, t.settings
     FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id
     WHERE d.host = $1 AND t.status = 'active'`,
    [host],
  );
  cache.set(host, { at: Date.now(), tenant: row ?? null });
  return row;
}

export async function getTenant(headers: Headers) {
  const tenant = await findTenantByHost(headers.get('host'));
  if (tenant || process.env.NODE_ENV !== 'development') return tenant;
  // Só em desenvolvimento local (127.0.0.1): usa o tenant inicial para não exigir um domínio cadastrado.
  const [fallback] = await query<Tenant>(`SELECT id, slug, name, status, settings FROM tenants WHERE slug = $1 AND status = 'active'`, [process.env.DEV_TENANT_SLUG || 'mesquiatti']);
  return fallback;
}
