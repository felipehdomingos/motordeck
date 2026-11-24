import type { Metadata } from 'next';
import { headers } from 'next/headers';
import AdminDashboard from '@/components/admin-dashboard';
import { hasAdminAccess } from '@/lib/admin-access';
export const metadata:Metadata={title:{absolute:'Painel de cadastro | MotorDeck'},robots:{index:false,follow:false}};
export default async function AdminPage(){
  if (!hasAdminAccess(await headers())) return null;
  return <AdminDashboard plateLookupEnabled={Boolean(process.env.PLACAEFIPE_API_KEY?.trim())}/>;
}
