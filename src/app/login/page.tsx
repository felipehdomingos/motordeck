'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nextPath] = useState(() => {
    if (typeof window === 'undefined') return '/admin';
    const requested = new URLSearchParams(window.location.search).get('next');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/admin';
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir.');
      window.location.assign(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally { setBusy(false); }
  }

  return <main className="login-page"><div className="login-card">
    <div className="login-icon"><LockKeyhole size={24}/></div>
    <span className="eyebrow">MOTORDECK / ÁREA ADMINISTRATIVA</span>
    <h1>Entrar no painel</h1>
    <p>Entre para gerenciar os veículos e as informações publicadas no site. O primeiro acesso é feito pelo link de convite enviado ao seu e-mail.</p>
    <form onSubmit={submit} className="login-form">
      <label>Usuário ou e-mail<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? 'Aguarde...' : 'Entrar no painel'} <ArrowRight size={17}/></button>
    </form>
    {message && <p className="login-error" role="alert">{message}</p>}
    <Link className="text-link login-back" href="/esqueci-senha">Esqueci minha senha</Link>
    <Link className="text-link login-back" href="/">Voltar para o site</Link>
  </div></main>;
}
