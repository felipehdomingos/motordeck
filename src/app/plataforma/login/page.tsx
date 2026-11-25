'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function PlatformLoginPage() {
  const [setup, setSetup] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', setupToken: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    fetch('/api/platform/session', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (data.authenticated) window.location.assign('/plataforma');
      else setSetup(Boolean(data.setupRequired));
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      if (setup) {
        const created = await fetch('/api/platform/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (!created.ok) throw new Error((await created.json().catch(() => null))?.message || 'Não foi possível criar o acesso.');
      }
      const response = await fetch('/api/platform/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username, password: form.password }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || 'Não foi possível entrar.');
      window.location.assign('/plataforma');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally { setBusy(false); }
  }

  return <main className="login-page"><div className="login-card">
    <div className="login-icon"><LockKeyhole size={24}/></div>
    <span className="eyebrow">MOTORDECK / PLATAFORMA</span>
    <h1>{setup ? 'Criar acesso do dono' : 'Entrar na plataforma'}</h1>
    <p>{setup ? 'Primeiro acesso: crie o administrador da plataforma com o código de configuração.' : 'Área restrita ao dono da plataforma.'}</p>
    <form onSubmit={submit} className="login-form">
      {setup && <><label>Nome completo<input autoComplete="name" value={form.name} onChange={set('name')} required /></label><label>E-mail<input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></label><label>Código de configuração<input type="password" autoComplete="off" value={form.setupToken} onChange={set('setupToken')} required /></label></>}
      <label>{setup ? 'Usuário' : 'Usuário ou e-mail'}<input autoComplete="username" value={form.username} onChange={set('username')} required /></label>
      <label>Senha<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} value={form.password} onChange={set('password')} required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? 'Aguarde...' : setup ? 'Criar e entrar' : 'Entrar'} <ArrowRight size={17}/></button>
    </form>
    {message && <p className="login-error" role="alert">{message}</p>}
  </div></main>;
}
