'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';

type Mode = 'login' | 'setup';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [nextPath] = useState(() => {
    if (typeof window === 'undefined') return '/admin';
    const requested = new URLSearchParams(window.location.search).get('next');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/admin';
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (data.setupRequired) setMode('setup');
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const endpoint = mode === 'setup' ? '/api/auth/bootstrap' : '/api/auth/login';
    const body = mode === 'setup' ? { setupToken, username, email, name, password } : { username, password };
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir.');
      if (mode === 'setup') {
        setMode('login');
        setMessage('Administrador criado. Agora entre com seu usuário e senha.');
        setPassword('');
      } else {
        window.location.assign(nextPath);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally { setBusy(false); }
  }

  const setup = mode === 'setup';
  return <main className="login-page"><div className="login-card">
    <div className="login-icon"><LockKeyhole size={24}/></div>
    <span className="eyebrow">MOTORDECK / {setup ? 'PRIMEIRO ACESSO' : 'ÁREA ADMINISTRATIVA'}</span>
    <h1>{setup ? 'Criar administrador' : 'Entrar no painel'}</h1>
    <p>{setup ? 'Crie o primeiro acesso. Depois, você poderá cadastrar outros usuários e definir permissões.' : 'Entre para gerenciar os veículos e as informações publicadas no site.'}</p>
    <form onSubmit={submit} className="login-form">
      {setup && <><label>Nome completo<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} required /></label><label>E-mail<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Código de configuração<input value={setupToken} onChange={event => setSetupToken(event.target.value)} required /></label></>}
      <label>{setup ? 'Usuário' : 'Usuário ou e-mail'}<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
      <label>Senha<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} minLength={12} required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? 'Aguarde...' : setup ? 'Criar administrador' : 'Entrar no painel'} <ArrowRight size={17}/></button>
    </form>
    {message && <p className="login-error" role="alert">{message}</p>}
    {!setup && <Link className="text-link login-back" href="/esqueci-senha">Esqueci minha senha</Link>}
    <Link className="text-link login-back" href="/">Voltar para o site</Link>
  </div></main>;
}
