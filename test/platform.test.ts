import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../deploy/migrate-lib.mjs';
import {
  adminSessionCookie, authenticateAdmin, authenticatePlatform, createAdminSession, createAdminUser, createInvite, getAdminSession,
  getPlatformSession, hasPlatformAdmin, pendingPasswordHash, platformSessionCookie, resetAdminPassword,
} from '../src/lib/admin-access';
import { isSameOrigin, requestOrigin } from '../src/lib/origin';
import {
  addTenantDomain, createPlatformAdmin, createTenantWithAdmin, findTenantOwner, inviteTenantOwner, listTenants, normalizeDomain,
  setTenantStatus, usernameFromEmail, validDomain, validTenantSlug,
} from '../src/lib/platform';
import { useQueryRunner } from '../src/lib/postgres';
import { clearTenantCache, findTenantByHost } from '../src/lib/tenant';

const migrationsDir = fileURLToPath(new URL('../deploy/migrations', import.meta.url));
const db = new PGlite();
const migrationDb = {
  async query(sql: string, params?: unknown[]) {
    if (params?.length) return db.query(sql, params);
    const results = await db.exec(sql);
    return { rows: results.at(-1)?.rows ?? [] } as { rows: Record<string, unknown>[] };
  },
};
const password = 'uma-senha-bem-longa-123';
const req = (host: string, cookieName: string, token: string) => new Headers({ host, cookie: `${cookieName}=${token}` });

describe('plataforma, convites e cadastro fechado', () => {
  before(async () => {
    process.env.PLATFORM_HOSTS = 'painel.example.com';
    useQueryRunner(async (sql, values) => (await db.query(sql, values as unknown[])).rows);
    await runMigrations(migrationDb, migrationsDir, () => undefined);
  });
  after(async () => { useQueryRunner(undefined); await db.close(); });

  it('valida e normaliza domínios, identificadores e usuários derivados do e-mail', () => {
    assert.equal(normalizeDomain(' HTTPS://Loja.Example.com:8443/painel '), 'loja.example.com');
    assert.equal(validDomain('loja.example.com'), true);
    for (const bad of ['localhost', 'a b.com', 'loja..com', '-x.com', 'loja.example.com/x', '']) assert.equal(validDomain(bad), false, bad);
    assert.equal(validTenantSlug('auto-silva'), true);
    for (const bad of ['a', '-ab', 'ab-', 'Auto', 'a_b']) assert.equal(validTenantSlug(bad), false, bad);
    assert.equal(usernameFromEmail('Joao.Silva+loja@x.com'), 'joao.silva-loja');
    assert.match(usernameFromEmail('ab@x.com'), /^[a-z0-9._-]{3,40}$/);
  });

  it('cria cliente, domínio e administrador juntos, e o administrador nasce sem senha', async () => {
    const { tenantId, userId } = await createTenantWithAdmin({ slug: 'silva', name: 'Auto Silva', host: 'silva.example.com', adminName: 'Maria Silva', adminEmail: 'Maria@Silva.com' });
    clearTenantCache();
    assert.equal((await findTenantByHost('silva.example.com'))?.id, tenantId);
    const owner = await findTenantOwner(tenantId);
    assert.equal(owner?.id, userId);
    assert.equal(owner?.email, 'maria@silva.com');
    const [row] = (await db.query<{ password_hash: string; role: string }>('SELECT password_hash, role FROM admin_users WHERE id = $1', [userId])).rows;
    assert.equal(row.password_hash, pendingPasswordHash);
    assert.equal(row.role, 'owner');
    assert.equal(await authenticateAdmin(tenantId, 'maria@silva.com', pendingPasswordHash), undefined);
    assert.equal(await authenticateAdmin(tenantId, 'maria@silva.com', password), undefined);
  });

  it('não deixa cliente pela metade quando o domínio ou o identificador já existe', async () => {
    const before = (await listTenants()).length;
    await assert.rejects(createTenantWithAdmin({ slug: 'outro', name: 'Outro', host: 'silva.example.com', adminName: 'X Y', adminEmail: 'x@y.com' }));
    await assert.rejects(createTenantWithAdmin({ slug: 'silva', name: 'Outro', host: 'outro.example.com', adminName: 'X Y', adminEmail: 'x@y.com' }));
    assert.equal((await listTenants()).length, before);
    assert.equal((await db.query(`SELECT 1 FROM admin_users WHERE email = 'x@y.com'`)).rows.length, 0);
    assert.equal((await db.query(`SELECT 1 FROM tenant_domains WHERE host = 'outro.example.com'`)).rows.length, 0);
  });

  it('o convite define a senha uma única vez e depois o administrador consegue entrar', async () => {
    const [tenant] = (await listTenants()).filter(item => item.slug === 'silva');
    assert.equal(tenant.pending_admins, 1);
    const invite = await inviteTenantOwner(tenant.id);
    assert.ok(invite);
    assert.equal(await resetAdminPassword(tenant.id, invite.token, 'curta'.repeat(1)), true); // o tamanho mínimo é validado na rota
    assert.equal(await resetAdminPassword(tenant.id, invite.token, 'outra-senha-longa-1'), false); // uso único
    assert.equal((await authenticateAdmin(tenant.id, 'maria@silva.com', 'curta'))?.role, 'owner');
    assert.equal((await listTenants()).find(item => item.slug === 'silva')?.pending_admins, 0);
  });

  it('o convite só vale no cliente certo e novo convite invalida o anterior', async () => {
    const other = await createTenantWithAdmin({ slug: 'costa', name: 'Auto Costa', host: 'costa.example.com', adminName: 'Ana Costa', adminEmail: 'ana@costa.com' });
    const first = await createInvite(other.userId);
    const [silva] = (await listTenants()).filter(item => item.slug === 'silva');
    assert.equal(await resetAdminPassword(silva.id, first, 'senha-longa-nova-1'), false);
    const second = await createInvite(other.userId);
    assert.equal(await resetAdminPassword(other.tenantId, first, 'senha-longa-nova-1'), false);
    assert.equal(await resetAdminPassword(other.tenantId, second, 'senha-longa-nova-1'), true);
  });

  it('convite expirado não funciona', async () => {
    const { tenantId, userId } = await createTenantWithAdmin({ slug: 'lima', name: 'Auto Lima', host: 'lima.example.com', adminName: 'Rui Lima', adminEmail: 'rui@lima.com' });
    const token = await createInvite(userId, -1);
    assert.equal(await resetAdminPassword(tenantId, token, 'senha-longa-nova-1'), false);
  });

  it('suspender um cliente tira o site do ar e reativar o traz de volta; domínio extra funciona', async () => {
    const [silva] = (await listTenants()).filter(item => item.slug === 'silva');
    await addTenantDomain(silva.id, 'www.silva.example.com');
    assert.equal((await findTenantByHost('www.silva.example.com'))?.id, silva.id);
    await assert.rejects(addTenantDomain(silva.id, 'www.silva.example.com'));
    assert.equal(await setTenantStatus(silva.id, 'suspended'), true);
    assert.equal(await findTenantByHost('silva.example.com'), undefined);
    assert.equal(await setTenantStatus(silva.id, 'active'), true);
    assert.equal((await findTenantByHost('silva.example.com'))?.id, silva.id);
    assert.equal(await setTenantStatus('nao-existe', 'active'), false);
  });

  it('administrador da plataforma: login próprio, só nos domínios da plataforma, sem misturar com clientes', async () => {
    assert.equal(await hasPlatformAdmin(), false);
    await createPlatformAdmin({ username: 'dono', email: 'dono@motordeck.com.br', name: 'Dono', password });
    assert.equal(await hasPlatformAdmin(), true);
    assert.equal((await authenticatePlatform('DONO', password))?.role, 'superadmin');
    assert.equal(await authenticatePlatform('dono', 'senha-errada-qualquer'), undefined);

    const user = await authenticatePlatform('dono@motordeck.com.br', password);
    assert.ok(user);
    const token = await createAdminSession(user.id);
    assert.equal((await getPlatformSession(req('painel.example.com', platformSessionCookie, token)))?.id, user.id);
    assert.equal(await getPlatformSession(req('silva.example.com', platformSessionCookie, token)), undefined);
    // O cookie de plataforma não abre painel de cliente, nem o contrário.
    assert.equal(await getAdminSession(req('silva.example.com', adminSessionCookie, token)), undefined);
    const [silva] = (await listTenants()).filter(item => item.slug === 'silva');
    const owner = await authenticateAdmin(silva.id, 'maria@silva.com', 'curta');
    assert.ok(owner);
    const tenantToken = await createAdminSession(owner.id);
    assert.equal(await getPlatformSession(req('painel.example.com', platformSessionCookie, tenantToken)), undefined);
    // Superadmin não entra pelo login de nenhum cliente.
    assert.equal(await authenticateAdmin(silva.id, 'dono', password), undefined);
  });

  it('um cliente sem administrador (o primeiro, migrado) pode receber um convite depois', async () => {
    assert.equal(await findTenantOwner('mesquiatti'), undefined);
    assert.equal(await inviteTenantOwner('mesquiatti'), undefined);
    await createAdminUser({ tenantId: 'mesquiatti', username: 'bruno', email: 'bruno@example.com', name: 'Bruno', password: null, role: 'owner', permissions: [] });
    const invite = await inviteTenantOwner('mesquiatti');
    assert.ok(invite);
    assert.equal(await resetAdminPassword('mesquiatti', invite.token, 'senha-do-bruno-123'), true);
    assert.equal((await authenticateAdmin('mesquiatti', 'bruno', 'senha-do-bruno-123'))?.role, 'owner');
  });

  it('só existe um tipo de superadmin: sem cliente, e não é possível criar um dentro de um cliente', async () => {
    const [silva] = (await listTenants()).filter(item => item.slug === 'silva');
    await assert.rejects(createAdminUser({ tenantId: silva.id, username: 'falso', email: 'falso@x.com', name: 'Falso', password, role: 'superadmin', permissions: [] }));
  });

  it('confere a origem da requisição pelo domínio, não por um valor fixo', () => {
    const make = (origin: string | null, host = 'silva.example.com') => new Request('http://interno/api', { method: 'POST', headers: { ...(origin ? { origin } : {}), host } });
    assert.equal(isSameOrigin(make('http://silva.example.com')), true);
    assert.equal(isSameOrigin(make('http://SILVA.example.com')), true);
    assert.equal(isSameOrigin(make('http://outro.example.com')), false);
    assert.equal(isSameOrigin(make('http://silva.example.com.atacante.com')), false);
    assert.equal(isSameOrigin(make(null)), false);
    assert.equal(requestOrigin(new Headers({ host: 'Silva.Example.com' })), 'http://silva.example.com');
  });
});
