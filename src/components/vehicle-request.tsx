'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageCircle, Search } from 'lucide-react';
import { whatsapp } from '@/lib/data';

export default function VehicleRequest({ compact = false }: { compact?: boolean }) {
  const [desiredCar, setDesiredCar] = useState('');
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = desiredCar.trim();
    const message = description
      ? `Olá, Bruno! Não encontrei o carro que procuro no seu site. Estou procurando: ${description}. Você consegue me ajudar?`
      : 'Olá, Bruno! Não encontrei o carro que procuro no seu site. Você consegue me ajudar a encontrar?';
    window.open(whatsapp(message), '_blank', 'noopener,noreferrer');
  }
  return (
    <section className={`vehicle-request ${compact ? 'vehicle-request-compact' : ''}`} aria-labelledby={compact ? 'busca-home-title' : 'busca-catalogo-title'}>
      <div className="vehicle-request-copy">
        <span className="eyebrow">NÃO ENCONTROU O QUE PROCURA?</span>
        <h2 id={compact ? 'busca-home-title' : 'busca-catalogo-title'}>O carro que você procura não está aqui?</h2>
        <p>Me conta qual modelo você tem em mente. Posso te ajudar a encontrar.</p>
      </div>
      <form onSubmit={handleSubmit} className="vehicle-request-form">
        <label htmlFor={compact ? 'carro-procurado-home' : 'carro-procurado-catalogo'}>Qual carro você está procurando?</label>
        <div className="vehicle-request-controls">
          <div className="vehicle-request-field"><Search size={19} aria-hidden="true"/><input id={compact ? 'carro-procurado-home' : 'carro-procurado-catalogo'} type="text" maxLength={120} placeholder="Ex.: Honda Civic automático 2022" value={desiredCar} onChange={(event) => setDesiredCar(event.target.value)}/></div>
          <button type="submit" className="button"><MessageCircle size={18} aria-hidden="true"/> Falar comigo <ArrowUpRight size={17} aria-hidden="true"/></button>
        </div>
        <small>Abre uma conversa no WhatsApp. A mensagem só será enviada se você confirmar.</small>
      </form>
    </section>
  );
}
