import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
export const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  max: 8,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
}) : undefined;

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  if (!pool) throw new Error('PostgreSQL não configurado');
  const result = await pool.query<T>(sql, values);
  return result.rows;
}
