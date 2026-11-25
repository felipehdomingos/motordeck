import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import PlatformDashboard from '@/components/platform-dashboard';
import { getPlatformSession, isPlatformHost } from '@/lib/admin-access';

export const metadata: Metadata = { title: { absolute: 'Plataforma | MotorDeck' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  const requestHeaders = await headers();
  if (!isPlatformHost(requestHeaders)) notFound();
  const session = await getPlatformSession(requestHeaders);
  if (!session) redirect('/plataforma/login');
  return <PlatformDashboard userName={session.name} />;
}
