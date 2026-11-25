import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTenant } from './tenant';

// Páginas públicas: domínio desconhecido ou cliente suspenso = 404.
export async function requireTenant() {
  const tenant = await getTenant(await headers());
  if (!tenant) notFound();
  return tenant;
}
