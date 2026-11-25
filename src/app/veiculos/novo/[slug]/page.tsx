import { notFound } from 'next/navigation';
import Link from 'next/link';
import { VehicleGallery } from '@/components/vehicle-gallery';
import { ContactButton } from '@/components/ui';
import { money } from '@/lib/data';
import { findPublished } from '@/lib/vehicle-storage';
import { requireTenant } from '@/lib/tenant-page';

export const dynamic = 'force-dynamic';

export default async function VehicleDetail({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const v = await findPublished((await requireTenant()).id, slug);
 if (!v) notFound();
 return <section className="container section"><Link className="text-link" href="/veiculos">← Voltar ao catálogo</Link><div className="detail-grid"><VehicleGallery images={v.images} label={`${v.brand} ${v.model}`}/><div className="detail-summary"><span className="eyebrow">{v.status} · PARTICULAR</span><h1>{v.brand} {v.model}</h1><p>{v.version} · {v.manufactureYear}/{v.year}</p><strong className="detail-price">{money(v.price)}</strong><dl className="detail-specs">{[['Ano fabricação/modelo',`${v.manufactureYear}/${v.year}`],['Quilometragem',v.mileage ? v.mileage.toLocaleString('pt-BR')+' km' : 'Sob consulta'],['Câmbio',v.transmission],['Combustível',v.fuel],['Cor',v.color]].map(([a,b])=><div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl><ContactButton message={`Olá, Bruno! Gostaria de saber mais sobre ${v.brand} ${v.model} ${v.version}.`}>Tenho interesse</ContactButton></div></div><div className="prose"><h2>Sobre este veículo</h2><p>{v.notes}</p></div></section>}
