// Separa o site público do painel pelo endereço: admin.<dominio> só serve o painel; <dominio> e www.<dominio> só servem o site.
// Só vale para os domínios listados em ADMIN_SPLIT_DOMAINS (ex.: brunomesquiatti.com.br), porque o subdomínio admin precisa
// existir no DNS, no certificado e no balanceador. Os demais domínios continuam servindo tudo no mesmo endereço.

const adminPaths = ['/admin', '/api/admin', '/api/auth', '/login', '/esqueci-senha', '/redefinir-senha', '/api/health', '/api/vehicle-photos'];
const sitePathsMovedToAdmin = ['/admin', '/login', '/esqueci-senha', '/redefinir-senha'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function splitDomains() {
  return (process.env.ADMIN_SPLIT_DOMAINS || '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
}

export function hostRedirect(rawHost: string | null | undefined, pathname: string, search: string, domains: string[]): string | undefined {
  const host = (rawHost ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  const isAdminHost = host.startsWith('admin.');
  const base = host.replace(/^(www|admin)\./, '');
  if (!domains.includes(base)) return;

  if (isAdminHost) {
    if (pathname === '/') return `https://${host}/admin`;
    // Arquivos estáticos (logo, ícones) e as rotas do painel ficam; qualquer página do site vai para o site.
    if (/\.[a-z0-9]+$/i.test(pathname) || adminPaths.some(prefix => under(pathname, prefix))) return;
    return `https://${base}${pathname}${search}`;
  }
  if (sitePathsMovedToAdmin.some(prefix => under(pathname, prefix))) return `https://admin.${base}${pathname}${search}`;
}
