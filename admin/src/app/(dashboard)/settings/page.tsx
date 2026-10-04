import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Settings, ShieldCheck, Database, Key } from 'lucide-react';

interface SettingRow {
  key: string;
  value: any;
  description: string;
  updated_at: string;
}

export default async function AdminSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: settingsData } = await supabase
    .from('platform_settings')
    .select('key, value, description, updated_at')
    .order('key', { ascending: true });

  const settings: SettingRow[] = (settingsData ?? []) as SettingRow[];

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            Central Platform Settings
          </h1>
          <p className="text-slate-400 text-sm">
            Live parameters configured in PostgreSQL `platform_settings` table.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          PG LIVE CONFIG
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Setting Key</th>
              <th className="p-4">Configured Value</th>
              <th className="p-4">Description</th>
              <th className="p-4">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {settings.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  No platform settings found in database.
                </td>
              </tr>
            ) : (
              settings.map((s) => (
                <tr key={s.key} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-blue-400 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-blue-500" />
                    {s.key}
                  </td>
                  <td className="p-4 font-mono text-sm text-emerald-400 bg-slate-950/40">
                    {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                  </td>
                  <td className="p-4 text-xs text-slate-300 max-w-md">
                    {s.description || 'Global configuration parameter.'}
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-500">
                    {new Date(s.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
