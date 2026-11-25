import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../migrate-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não configurada');

// Uso manual (a aplicação já aplica as migrações ao iniciar). Valida o certificado só se DATABASE_SSL_CA existir.
const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.delete('sslmode');
const { readFileSync } = await import('node:fs');
const ssl = process.env.DATABASE_SSL_CA
  ? { ca: readFileSync(process.env.DATABASE_SSL_CA, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: connectionUrl.toString(), ssl });
try {
  await client.connect();
  await runMigrations(client, fileURLToPath(new URL('../migrations', import.meta.url)));
  console.log('Schema do MotorDeck atualizado.');
} finally {
  await client.end();
}
