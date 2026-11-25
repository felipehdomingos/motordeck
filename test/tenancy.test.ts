import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { ensureBootstrapDomain, runMigrations } from '../deploy/migrate-lib.mjs';
import { adminSessionCookie, authenticateAdmin, createAdminSession, createAdminUser, createPasswordReset, getAdminSession, hasAdminUsers, resetAdminPassword } from '../src/lib/admin-access';
import { useQueryRunner } from '../src/lib/postgres';
import { clearTenantCache, findTenantByHost } from '../src/lib/tenant';
import { deleteVehicle, findPhoto, findPublished, listAdmin, listPublished, storeVehicle } from '../src/lib/vehicle-storage';
import type { LocalVehicle } from '../src/lib/local-vehicles';

const migrationsDir = fileURLToPath(new URL('../deploy/migrations', import.meta.url));
const password = 'uma-senha-bem-longa-123';
const permissions = ['vehicles:read', 'vehicles:write'] as const;
const jpeg = 'data:image/jpeg;base64,/9j/AAAA';

const db = new PGlite();
const migrationDb = {
  async query(sql: string, params?: unknown[]) {
    if (params?.length) return db.query(sql, params);
    const results = await db.exec(sql);
    return { rows: results.at(-1)?.rows ?? [] } as { rows: Record<string, unknown>[] };
  },
};

function vehicle(slug: string, brand: string, overrides: Partial<LocalVehicle> = {}): LocalVehicle {
  return {
    slug, brand, model: 'Modelo', version: 'V', plate: 'ABC1D23', year: 2020, manufactureYear: 2020, mileage: 1000, price: 50000,
    transmission: 'Manual', fuel: 'Flex', color: 'Preto', type: 'Hatch', notes: '', status: 'Disponível', featured: false,
    images: [jpeg], draft: false, createdAt: new Date().toISOString(), local: true, ...overrides,
  } as LocalVehicle;
}

const cookie = (token: string) => new Headers({ cookie: `${adminSessionCookie}=${token}` });
const requestFor = (host: string, token: string) => { const h = cookie(token); h.set('host', host); return h; };

describe('multi-cliente', () => {
  before(async () => {
    useQueryRunner(async (sql, values) => (await db.query(sql, values as unknown[])).rows);
    // Estado "antes do multi-cliente": só a migração 001, com dados reais de um cliente único.
    const legacy = await mkdtemp(join(tmpdir(), 'motordeck-mig-'));
    await cp(join(migrationsDir, '001_baseline.sql'), join(legacy, '001_baseline.sql'));
    await runMigrations(migrationDb, legacy, () => undefined);
    await rm(legacy, { recursive: true, force: true });
    await db.query(`INSERT INTO mesquiatti_vehicles (slug, details, draft, images) VALUES ('local-legado', '{"brand":"Legado","status":"Disponível"}', false, ARRAY['${jpeg}'])`);
    await db.query(`INSERT INTO admin_users (id, username, email, name, password_hash, role) VALUES ('u-legado', 'bruno', 'bruno@example.com', 'Bruno', 'x', 'owner')`);
  });

  after(async () => {
    useQueryRunner(undefined);
    await db.close();
  });

  it('migra os dados existentes para o primeiro cliente e é idempotente', async () => {
    const applied = await runMigrations(migrationDb, migrationsDir, () => undefined);
    assert.deepEqual(applied, ['002_multitenant.sql']);
    assert.deepEqual(await runMigrations(migrationDb, migrationsDir, () => undefined), []);
    assert.equal((await readdir(migrationsDir)).length, 2);

    const vehicles = (await db.query<{ tenant_id: string; slug: string }>('SELECT tenant_id, slug FROM vehicles')).rows;
    assert.deepEqual(vehicles, [{ tenant_id: 'mesquiatti', slug: 'local-legado' }]);
    const users = (await db.query<{ tenant_id: string }>('SELECT tenant_id FROM admin_users')).rows;
    assert.deepEqual(users, [{ tenant_id: 'mesquiatti' }]);
  });

  it('associa o domínio do serviço ao primeiro cliente sem sobrescrever domínios existentes', async () => {
    assert.equal(await ensureBootstrapDomain(migrationDb, 'https://App.Example.com'), 'app.example.com');
    await ensureBootstrapDomain(migrationDb, 'https://app.example.com');
    const rows = (await db.query<{ host: string; tenant_id: string }>('SELECT host, tenant_id FROM tenant_domains')).rows;
    assert.deepEqual(rows, [{ host: 'app.example.com', tenant_id: 'mesquiatti' }]);
  });

  it('resolve o cliente pelo domínio, ignora porta e caixa, e rejeita domínio desconhecido ou suspenso', async () => {
    await db.query(`INSERT INTO tenants (id, slug, name) VALUES ('t-a', 'loja-a', 'Loja A'), ('t-b', 'loja-b', 'Loja B'), ('t-s', 'loja-s', 'Suspensa')`);
    await db.query(`UPDATE tenants SET status = 'suspended' WHERE id = 't-s'`);
    await db.query(`INSERT INTO tenant_domains (host, tenant_id) VALUES ('a.example.com', 't-a'), ('b.example.com', 't-b'), ('s.example.com', 't-s')`);
    clearTenantCache();
    assert.equal((await findTenantByHost('A.Example.com:443'))?.id, 't-a');
    assert.equal((await findTenantByHost('b.example.com'))?.id, 't-b');
    assert.equal(await findTenantByHost('outro.example.com'), undefined);
    assert.equal(await findTenantByHost('s.example.com'), undefined);
    assert.equal(await findTenantByHost(''), undefined);
    assert.equal(await findTenantByHost("a.example.com' OR '1'='1"), undefined);
  });

  it('mantém veículos isolados, mesmo com o mesmo slug em dois clientes', async () => {
    await storeVehicle('t-a', vehicle('local-civic', 'Honda A'), false);
    await storeVehicle('t-b', vehicle('local-civic', 'Honda B'), false);
    await storeVehicle('t-b', vehicle('local-so-b', 'Fiat B'), false);
    await storeVehicle('t-a', vehicle('local-rascunho', 'Rascunho A', { draft: true }), false);

    assert.deepEqual((await listPublished('t-a')).map(v => v.brand), ['Honda A']);
    assert.deepEqual((await listPublished('t-b')).map(v => v.brand).sort(), ['Fiat B', 'Honda B']);
    assert.equal((await findPublished('t-a', 'local-civic'))?.brand, 'Honda A');
    assert.equal((await findPublished('t-b', 'local-civic'))?.brand, 'Honda B');
    assert.equal(await findPublished('t-a', 'local-so-b'), undefined);
    assert.equal(await findPhoto('t-a', 'local-so-b', '1'), undefined);
    assert.equal(await findPhoto('t-b', 'local-so-b', '1'), jpeg);
    assert.deepEqual((await listAdmin('t-a')).map(v => v.slug).sort(), ['local-civic', 'local-rascunho']);
    assert.deepEqual((await listAdmin('mesquiatti')).map(v => v.slug), ['local-legado']);
  });

  it('não permite que um cliente altere ou apague veículos de outro', async () => {
    await storeVehicle('t-a', vehicle('local-civic', 'Honda A editado'), false);
    assert.equal((await findPublished('t-b', 'local-civic'))?.brand, 'Honda B');
    await deleteVehicle('t-a', 'local-so-b');
    assert.equal((await findPublished('t-b', 'local-so-b'))?.brand, 'Fiat B');
    await deleteVehicle('t-a', 'local-civic');
    assert.equal((await findPublished('t-b', 'local-civic'))?.brand, 'Honda B');
    assert.equal(await findPublished('t-a', 'local-civic'), undefined);
  });

  it('permite o mesmo usuário e e-mail em clientes diferentes, sem misturar credenciais', async () => {
    assert.equal(await hasAdminUsers('t-a'), false);
    await createAdminUser({ tenantId: 't-a', username: 'admin', email: 'admin@loja.com', name: 'Admin A', password, role: 'owner', permissions: [...permissions] });
    await createAdminUser({ tenantId: 't-b', username: 'admin', email: 'admin@loja.com', name: 'Admin B', password: `${password}-b`, role: 'owner', permissions: [...permissions] });
    assert.equal(await hasAdminUsers('t-a'), true);
    assert.equal(await hasAdminUsers('t-s'), false);
    await assert.rejects(createAdminUser({ tenantId: 't-a', username: 'admin', email: 'outro@loja.com', name: 'Dup', password, role: 'editor', permissions: [] }));

    assert.equal((await authenticateAdmin('t-a', 'admin', password))?.name, 'Admin A');
    assert.equal((await authenticateAdmin('t-b', 'admin@loja.com', `${password}-b`))?.name, 'Admin B');
    assert.equal(await authenticateAdmin('t-a', 'admin', `${password}-b`), undefined);
    assert.equal(await authenticateAdmin('t-b', 'admin', password), undefined);
    assert.equal(await authenticateAdmin('t-s', 'admin', password), undefined);
  });

  it('só aceita a sessão no domínio do cliente do usuário', async () => {
    const userA = await authenticateAdmin('t-a', 'admin', password);
    assert.ok(userA);
    const token = await createAdminSession(userA.id);
    assert.equal((await getAdminSession(requestFor('a.example.com', token)))?.tenantId, 't-a');
    assert.equal(await getAdminSession(requestFor('b.example.com', token)), undefined);
    assert.equal(await getAdminSession(requestFor('desconhecido.example.com', token)), undefined);
    assert.equal(await getAdminSession(requestFor('s.example.com', token)), undefined);
  });

  it('não deixa um link de redefinição de um cliente valer em outro', async () => {
    const reset = await createPasswordReset('t-a', 'admin@loja.com');
    assert.ok(reset);
    assert.equal(await resetAdminPassword('t-b', reset.token, 'senha-nova-muito-longa-1'), false);
    assert.equal(await authenticateAdmin('t-a', 'admin', password) !== undefined, true);
    assert.equal(await resetAdminPassword('t-a', reset.token, 'senha-nova-muito-longa-1'), true);
    assert.equal(await authenticateAdmin('t-a', 'admin', password), undefined);
    assert.equal(await createPasswordReset('t-s', 'admin@loja.com'), undefined);
  });

  it('só admite administrador da plataforma sem cliente, e cliente sem esse papel', async () => {
    const insert = (role: string, tenant: string | null, id: string) => db.query(
      `INSERT INTO admin_users (id, tenant_id, username, email, name, password_hash, role) VALUES ($1, $2, $1, $1 || '@x.com', 'Nome', 'x', $3)`, [id, tenant, role]);
    await insert('superadmin', null, 'plataforma');
    await assert.rejects(insert('superadmin', 't-a', 'super-com-cliente'));
    await assert.rejects(insert('owner', null, 'dono-sem-cliente'));
    assert.equal(await authenticateAdmin('t-a', 'plataforma', 'x'), undefined);
    assert.equal(await hasAdminUsers('t-a'), true);
  });
});
