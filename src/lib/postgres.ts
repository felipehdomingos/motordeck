import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

// pg-connection-string treats sslmode=require as verify-full and lets it override
// the `ssl` option, so strip it and configure TLS explicitly. When
// DATABASE_SSL_CA points at a CA bundle (the RDS bundle ships in the image) the
// server certificate is fully verified; otherwise fall back to the previous
// encrypted-but-unverified behaviour.
function sslConfig(): PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL === 'disable') return false;
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function connectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return url;
  }
}

export const pool = databaseUrl ? new Pool({
  connectionString: connectionString(databaseUrl),
  ssl: sslConfig(),
  max: 8,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
}) : undefined;

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  if (!pool) throw new Error('PostgreSQL não configurado');
  const result = await pool.query<T>(sql, values);
  return result.rows;
}
