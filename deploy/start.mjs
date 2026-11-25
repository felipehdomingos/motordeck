import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureBootstrapDomain, runMigrations } from './migrate-lib.mjs';

const { APP_ENV, APP_ORIGIN, DATABASE_URL, ADMIN_SETUP_TOKEN } = process.env;

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}

if (APP_ENV !== 'production' ||
    !isHttpsOrigin(APP_ORIGIN) ||
    !DATABASE_URL?.startsWith('postgres') ||
    !ADMIN_SETUP_TOKEN || ADMIN_SETUP_TOKEN.length < 24) {
  console.error('Configure APP_ENV, APP_ORIGIN, DATABASE_URL e ADMIN_SETUP_TOKEN. Consulte a seção Produção do README.md.');
  process.exit(1);
}

// Aplica as migrações pendentes antes de aceitar tráfego (o RDS só é acessível pelas tasks).
// A conexão usa a mesma regra de TLS da aplicação: valida o certificado com o bundle do RDS.
const url = new URL(DATABASE_URL);
url.searchParams.delete('sslmode');
const caPath = process.env.DATABASE_SSL_CA;
const { readFileSync } = await import('node:fs');
const ssl = process.env.DATABASE_SSL === 'disable' ? false
  : caPath ? { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: url.toString(), ssl, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  await runMigrations(client, fileURLToPath(new URL('./migrations', import.meta.url)));
  const host = await ensureBootstrapDomain(client, APP_ORIGIN, process.env.BOOTSTRAP_TENANT_SLUG || 'mesquiatti');
  console.log(`Domínio ${host} associado ao tenant inicial.`);
} catch (error) {
  console.error(`Falha ao preparar o banco: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}

await import('./server.js');
