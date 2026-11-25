import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/admin-dashboard';
import AdminUsersPanel from '@/components/admin-users-panel';
import { getAdminSession } from '@/lib/admin-access';
export const metadata:Metadata={title:{absolute:'Painel de cadastro | MotorDeck'},robots:{index:false,follow:false}};
export default async function AdminPage(){
  const session = await getAdminSession(await headers());
  if (!session) redirect('/login?next=/admin');
  return <><AdminDashboard plateLookupEnabled={session.permissions.includes('plate:lookup') || session.role === 'owner'} permissions={session.permissions} />{(session.permissions.includes('users:manage') || session.role === 'owner') && <AdminUsersPanel />}</>;
}
