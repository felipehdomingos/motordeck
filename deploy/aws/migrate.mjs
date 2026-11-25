import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não configurada');

const sql = await readFile(new URL('../azure/001_motordeck.sql', import.meta.url), 'utf8');
const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.delete('sslmode');
const pool = new Pool({ connectionString: connectionUrl.toString(), ssl: { rejectUnauthorized: false } });

try {
  await pool.query(sql);
  console.log('Schema do MotorDeck aplicado.');
} finally {
  await pool.end();
}
