import Link from 'next/link';
export default function NotFound(){return <section className="container section empty-state"><span className="eyebrow">404</span><h1>Página não encontrada.</h1><p>Vamos encontrar outro caminho para seu próximo passo.</p><Link className="button" href="/">Voltar ao início</Link></section>;}
