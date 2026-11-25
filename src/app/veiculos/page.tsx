import { PageIntro } from '@/components/ui';
import Catalog from '@/components/catalog';
import { listPublished } from '@/lib/vehicle-storage';
import { requireTenant } from '@/lib/tenant-page';
export const metadata={title:'Veículos particulares em Suzano'};
export const dynamic = 'force-dynamic';
export default async function Page(){
  const tenant = await requireTenant();
  const inventory = await listPublished(tenant.id);
  return <><PageIntro eyebrow="CATÁLOGO DE PARTICULARES" title="Seu próximo carro começa aqui." text="Explore as opções e conte com atendimento pessoal para dar o próximo passo."/><section className="container section"><Catalog all={inventory}/></section></>;
}
