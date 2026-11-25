'use client';

import { useEffect, useState } from 'react';
import { Building2, Globe, LogOut, Mail, Pause, Play, Plus } from 'lucide-react';

type Tenant = { id: string; slug: string; name: string; status: 'active' | 'suspended'; domains: string[]; admins: number; pending_admins: number; vehicles: number };
type Invite = { sent: boolean; email: string; url?: string };
const emptyForm = { name: '', slug: '', host: '', adminName: '', adminEmail: '' };

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir.');
  return data;
}

export default function PlatformDashboard({ userName }: { userName: string }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  async function load() { setTenants(await call('/api/platform/tenants', 'GET')); }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage(''); setLink('');
    try { await action(); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    setBusy(false);
  }
  function report(invite: Invite | undefined) {
    if (!invite) { setMessage('Não há administrador convidável neste cliente.'); return; }
    if (invite.sent) setMessage(`Convite enviado para ${invite.email}.`);
    else { setMessage(`E-mail não configurado. Envie este link para ${invite.email}:`); setLink(invite.url || ''); }
  }
  const create = () => run(async () => { report((await call('/api/platform/tenants', 'POST', form)).invite); setForm(emptyForm); });
  const resend = (tenant: Tenant) => {
    let body: { adminName: string; adminEmail: string } | undefined;
    if (tenant.admins === 0) {
      const adminName = prompt(`${tenant.name} ainda não tem administrador. Nome dele:`);
      const adminEmail = adminName ? prompt('E-mail dele:') : null;
      if (!adminName || !adminEmail) return;
      body = { adminName, adminEmail };
    }
    run(async () => report((await call(`/api/platform/tenants/${tenant.id}/invite`, 'POST', body)).invite));
  };
  const toggle = (tenant: Tenant) => run(async () => { await call(`/api/platform/tenants/${tenant.id}`, 'PATCH', { status: tenant.status === 'active' ? 'suspended' : 'active' }); });
  const addDomain = (tenant: Tenant) => { const host = prompt('Novo domínio para este cliente (ex.: loja.motordeck.com.br):'); if (host) run(async () => { await call(`/api/platform/tenants/${tenant.id}/domains`, 'POST', { host }); }); };
  async function logout() { await call('/api/platform/logout', 'POST').catch(() => undefined); window.location.assign('/plataforma/login'); }

  return <main className="platform-page"><div className="container">
    <header className="platform-head"><div><span className="eyebrow">MOTORDECK / PLATAFORMA</span><h1>Clientes</h1><p>Olá, {userName}. Cada cliente tem o próprio site, domínio, veículos e usuários.</p></div><button className="text-link" type="button" onClick={logout}><LogOut size={16}/> Sair</button></header>
    <section className="admin-users-panel"><div className="admin-step"><span><Plus size={18}/></span><div><h2>Novo cliente</h2><p>Cria o site no domínio informado e convida o administrador por e-mail para ele definir a própria senha.</p></div></div>
      <div className="admin-users-form">
        <label>Nome do cliente<input value={form.name} onChange={set('name')} placeholder="Auto Center Silva"/></label>
        <label>Identificador<input value={form.slug} onChange={set('slug')} placeholder="auto-center-silva"/></label>
        <label>Domínio do site<input value={form.host} onChange={set('host')} placeholder="silva.motordeck.com.br"/></label>
        <label>Administrador (nome)<input value={form.adminName} onChange={set('adminName')}/></label>
        <label>Administrador (e-mail)<input type="email" value={form.adminEmail} onChange={set('adminEmail')}/></label>
      </div>
      <button className="button" type="button" disabled={busy} onClick={create}><Building2 size={17}/> Criar cliente e convidar</button>
    </section>
    {message && <p className="admin-message" role="status">{message}</p>}
    {link && <input className="invite-link" readOnly value={link} onFocus={event => event.currentTarget.select()} aria-label="Link de convite"/>}
    <section className="platform-list">{tenants.map(tenant => <article className="platform-row" key={tenant.id}>
      <div><strong>{tenant.name}</strong><span>{tenant.domains.length ? tenant.domains.join(' · ') : 'sem domínio'}</span><small>{tenant.vehicles} veículo(s) · {tenant.admins} usuário(s){tenant.pending_admins ? ` · ${tenant.pending_admins} convite(s) pendente(s)` : ''}</small></div>
      <small className={tenant.status === 'active' ? 'platform-on' : 'platform-off'}>{tenant.status === 'active' ? 'Ativo' : 'Suspenso'}</small>
      <div className="platform-actions">
        <button type="button" disabled={busy} onClick={() => resend(tenant)} title="Reenviar convite do administrador"><Mail size={16}/></button>
        <button type="button" disabled={busy} onClick={() => addDomain(tenant)} title="Adicionar domínio"><Globe size={16}/></button>
        <button type="button" disabled={busy} onClick={() => toggle(tenant)} title={tenant.status === 'active' ? 'Suspender' : 'Reativar'}>{tenant.status === 'active' ? <Pause size={16}/> : <Play size={16}/>}</button>
      </div></article>)}</section>
  </div></main>;
}
