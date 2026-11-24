const { APP_ENV, APP_ORIGIN, SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}

if (APP_ENV !== 'production' ||
    !isHttpsOrigin(APP_ORIGIN) || !isHttpsOrigin(SUPABASE_URL) ||
    !SUPABASE_SECRET_KEY?.startsWith('sb_secret_') ||
    !ADMIN_USERNAME || ADMIN_USERNAME.includes(':') ||
    !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 24) {
  console.error('Configure APP_ENV, APP_ORIGIN, SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_USERNAME e ADMIN_PASSWORD. Consulte a seção Produção do README.md.');
  process.exit(1);
}

await import('./server.js');
