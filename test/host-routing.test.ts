import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hostRedirect } from '../src/lib/host-routing';

const domains = ['brunomesquiatti.com.br'];
const go = (host: string, path: string, search = '') => hostRedirect(host, path, search, domains);

describe('separação site x painel por endereço', () => {
  it('o site não serve o painel nem o login: manda para admin.', () => {
    assert.equal(go('brunomesquiatti.com.br', '/admin'), 'https://admin.brunomesquiatti.com.br/admin');
    assert.equal(go('www.brunomesquiatti.com.br', '/login', '?next=%2Fadmin'), 'https://admin.brunomesquiatti.com.br/login?next=%2Fadmin');
    assert.equal(go('brunomesquiatti.com.br', '/redefinir-senha', '?token=abc'), 'https://admin.brunomesquiatti.com.br/redefinir-senha?token=abc');
  });

  it('o site público segue servindo suas páginas', () => {
    assert.equal(go('brunomesquiatti.com.br', '/'), undefined);
    assert.equal(go('www.brunomesquiatti.com.br', '/veiculos'), undefined);
    assert.equal(go('brunomesquiatti.com.br', '/administracao'), undefined);
  });

  it('admin. só serve o painel: páginas do site vão para o domínio principal', () => {
    assert.equal(go('admin.brunomesquiatti.com.br', '/'), 'https://admin.brunomesquiatti.com.br/admin');
    assert.equal(go('admin.brunomesquiatti.com.br', '/veiculos', '?q=1'), 'https://brunomesquiatti.com.br/veiculos?q=1');
    assert.equal(go('admin.brunomesquiatti.com.br', '/contato'), 'https://brunomesquiatti.com.br/contato');
  });

  it('admin. mantém rotas do painel, APIs, fotos e arquivos estáticos', () => {
    for (const path of ['/admin', '/admin/x', '/login', '/esqueci-senha', '/api/admin/vehicles', '/api/auth/login', '/api/health', '/api/vehicle-photos/abc', '/logo.png', '/favicon.ico']) {
      assert.equal(go('admin.brunomesquiatti.com.br', path), undefined, path);
    }
  });

  it('não mexe em outros domínios, no painel da plataforma nem no endereço on.aws', () => {
    assert.equal(go('painel.motordeck.com.br', '/login'), undefined);
    assert.equal(go('motordeck.com.br', '/admin'), undefined);
    assert.equal(go('mo-1.ecs.us-east-2.on.aws', '/admin'), undefined);
    assert.equal(hostRedirect('brunomesquiatti.com.br', '/admin', '', []), undefined);
  });
});
