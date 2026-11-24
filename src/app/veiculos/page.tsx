import { PageIntro } from '@/components/ui';
import Catalog from '@/components/catalog';
import { listPublished } from '@/lib/vehicle-storage';
export const metadata={title:'Veículos particulares em Suzano'};
export const dynamic = 'force-dynamic';
export default async function Page(){
  const inventory = await listPublished();
  return <><PageIntro eyebrow="CATÁLOGO DE PARTICULARES" title="Seu próximo carro começa aqui." text="Explore as opções e conte com atendimento pessoal para dar o próximo passo."/><section className="container section"><Catalog all={inventory}/></section></>;
}
