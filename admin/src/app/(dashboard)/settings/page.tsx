import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function AdminSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: settingsData } = await supabase
    .from('platform_settings')
    .select('key, value, description, updated_at')
    .order('key', { ascending: true });

  return (
    <div className="p-6">
      <SettingsClient initialSettings={(settingsData ?? []) as any} />
    </div>
  );
}

