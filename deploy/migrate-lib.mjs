import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const lockKey = 7_315_001;

// `db` precisa de `query(sql, params?)`. Com um pool do `pg`, passe um client dedicado
// (o advisory lock vale por conexão). Cada migração roda em uma transação própria.
export async function runMigrations(db, directory, log = console.log) {
  await db.query(`SELECT pg_advisory_lock(${lockKey})`);
  try {
    await db.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await db.query('SELECT name FROM public.schema_migrations')).rows.map(row => row.name));
    const files = (await readdir(directory)).filter(file => /^\d+_.+\.sql$/.test(file)).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(directory, file), 'utf8');
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [file]);
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw new Error(`Migração ${file} falhou: ${error instanceof Error ? error.message : error}`);
      }
      applied.push(file);
      log(`Migração aplicada: ${file}`);
    }
    return applied;
  } finally {
    await db.query(`SELECT pg_advisory_unlock(${lockKey})`);
  }
}

// Mapeia o domínio público do serviço para o tenant inicial, sem sobrescrever nada existente.
export async function ensureBootstrapDomain(db, appOrigin, tenantSlug = 'mesquiatti') {
  const host = new URL(appOrigin).host.toLowerCase();
  await db.query(
    'INSERT INTO public.tenant_domains (host, tenant_id) SELECT $1, id FROM public.tenants WHERE slug = $2 ON CONFLICT (host) DO NOTHING',
    [host, tenantSlug],
  );
  return host;
}
