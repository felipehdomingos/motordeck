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

await import('./server.js');
