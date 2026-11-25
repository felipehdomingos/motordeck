'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (password !== confirmation) { setMessage('As senhas não conferem.'); return; }
    setBusy(true);
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) setMessage(data?.message || 'Não foi possível redefinir a senha.'); else setDone(true);
    setBusy(false);
  }
  return <main className="login-page"><div className="login-card"><div className="login-icon"><LockKeyhole size={24}/></div><span className="eyebrow">MOTORDECK / SENHA</span><h1>Definir senha</h1>{done?<><p>Senha atualizada. Você já pode entrar no painel.</p><Link className="button login-reset-link" href="/login">Ir para o login <ArrowRight size={17}/></Link></>:<><p>Escolha uma senha com pelo menos 12 caracteres. O link só funciona uma vez.</p><form onSubmit={submit} className="login-form"><label>Nova senha<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Repetir senha<input type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label><button className="button" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar senha'} <ArrowRight size={17}/></button></form>{message&&<p className="login-error" role="alert">{message}</p>}</>}</div></main>;
}
