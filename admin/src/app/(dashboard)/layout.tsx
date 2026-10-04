import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

const ALLOWED_ADMIN_ROLES = ['super_admin', 'marketplace_admin', 'finance_admin', 'support_agent'];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Verify that the authenticated user has an administrator role in public.profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ADMIN_ROLES.includes(profile.role)) {
    // Normal users have no right to access the admin portal
    redirect('/login?error=unauthorized');
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
