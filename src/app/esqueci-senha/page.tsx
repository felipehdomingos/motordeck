'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await response.json().catch(() => null);
    setMessage(data?.message || 'Confira seu e-mail.'); setBusy(false);
  }
  return <main className="login-page"><div className="login-card"><div className="login-icon"><Mail size={24}/></div><span className="eyebrow">MOTORDECK / RECUPERAÇÃO</span><h1>Esqueci minha senha</h1><p>Informe o e-mail do seu acesso. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha.</p><form onSubmit={submit} className="login-form"><label>E-mail<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><button className="button" type="submit" disabled={busy}>{busy ? 'Enviando...' : 'Enviar instruções'} <Mail size={17}/></button></form>{message&&<p className="login-error" role="status">{message}</p>}<Link className="text-link login-back" href="/login"><ArrowLeft size={17}/> Voltar para o login</Link></div></main>;
}
