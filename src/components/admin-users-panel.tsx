'use client';

import { useEffect, useState } from 'react';
import { Mail, Shield, UserPlus, UserX } from 'lucide-react';

type Permission = 'vehicles:read' | 'vehicles:write' | 'vehicles:delete' | 'plate:lookup' | 'users:manage';
type User = { id: string; username: string; email: string; name: string; role: string; permissions: Permission[]; active: boolean; pending: boolean };
type Invite = { sent: boolean; url?: string };
const permissionOptions: { id: Permission; label: string }[] = [
  { id: 'vehicles:read', label: 'Ver veículos' }, { id: 'vehicles:write', label: 'Criar e editar veículos' },
  { id: 'vehicles:delete', label: 'Excluir veículos' }, { id: 'plate:lookup', label: 'Consultar placa' }, { id: 'users:manage', label: 'Gerenciar acessos' },
];
const emptyForm = { name: '', email: '', role: 'editor', permissions: ['vehicles:read', 'vehicles:write', 'plate:lookup'] as Permission[] };

export default function AdminUsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch('/api/admin/users', { cache: 'no-store' }); if (response.ok) setUsers(await response.json()); }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => setMessage('Não foi possível carregar os acessos.')); }, []);
  function toggle(permission: Permission) { setForm(current => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter(item => item !== permission) : [...current.permissions, permission] })); }
  function report(invite: Invite | undefined, email: string) {
    if (invite?.sent) { setMessage(`Convite enviado para ${email}. A pessoa define a própria senha pelo link.`); setInviteLink(''); }
    else { setMessage('O envio de e-mail não está configurado. Copie o link abaixo e envie para a pessoa:'); setInviteLink(invite?.url || ''); }
  }
  async function create() {
    setBusy(true); setMessage(''); setInviteLink('');
    const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await response.json().catch(() => null);
    if (!response.ok) setMessage(data?.message || 'Não foi possível criar o acesso.');
    else { report(data?.invite, form.email); setForm(emptyForm); await load(); }
    setBusy(false);
  }
  async function resend(user: User) {
    setBusy(true); setMessage(''); setInviteLink('');
    const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'PATCH' });
    const data = await response.json().catch(() => null);
    if (!response.ok) setMessage(data?.message || 'Não foi possível reenviar o convite.'); else report(data?.invite, user.email);
    setBusy(false);
  }
  async function deactivate(id: string) { if (!confirm('Desativar este acesso?')) return; await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
  return <section className="admin-users-panel"><div className="admin-step"><span><Shield size={18}/></span><div><h2>Usuários e permissões</h2><p>A pessoa recebe um link por e-mail e define a própria senha. Você nunca vê nem digita a senha dela.</p></div></div>
    <div className="admin-users-form"><label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>E-mail<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label><label>Perfil<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="admin">Administrador</option><option value="editor">Editor</option><option value="viewer">Visualizador</option></select></label><div className="admin-permissions"><strong>Permissões</strong>{permissionOptions.map(option=><label key={option.id} className="permission-check"><input type="checkbox" checked={form.permissions.includes(option.id)} onChange={() => toggle(option.id)}/>{option.label}</label>)}</div></div>
    <button className="button" type="button" disabled={busy} onClick={create}><UserPlus size={17}/> Convidar</button>
    {message&&<p className="admin-message" role="status">{message}</p>}
    {inviteLink&&<input className="invite-link" readOnly value={inviteLink} onFocus={event => event.currentTarget.select()} aria-label="Link de convite"/>}
    <div className="admin-users-list">{users.map(user=><div className="admin-user-row" key={user.id}><div><strong>{user.name}</strong><span>{user.email}</span></div><small>{!user.active?'Desativado':user.pending?'Convite pendente':user.role}</small>{user.active&&user.pending&&<button type="button" disabled={busy} onClick={() => resend(user)} title="Reenviar convite"><Mail size={16}/></button>}{user.active&&<button type="button" onClick={() => deactivate(user.id)} title="Desativar acesso"><UserX size={16}/></button>}</div>)}</div></section>;
}
