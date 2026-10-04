import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ShieldAlert, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';

interface LifecycleRow {
  user_id: string;
  last_active_at: string;
  deletion_due_at: string;
  warning_stage: number;
  deletion_hold: boolean;
  deletion_hold_reason: string | null;
  profiles: { full_name: string; role: string } | null;
}

export default async function AdminLifecyclePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: lifecycleData } = await supabase
    .from('account_lifecycle')
    .select('user_id, last_active_at, deletion_due_at, warning_stage, deletion_hold, deletion_hold_reason, profiles(full_name, role)')
    .order('deletion_due_at', { ascending: true });

  const lifecycle: LifecycleRow[] = (lifecycleData ?? []) as LifecycleRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            Account Inactivity & Lifecycle Console (60-Day Policy)
          </h1>
          <p className="text-slate-400 text-sm">
            Automated lifecycle schedule (T-14, T-7, T-3, T-2, T-1, T-0), deletion holds, and storage orphan cleanup.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            RLS ENFORCED
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Last Active</th>
              <th className="p-4">Deletion Due</th>
              <th className="p-4">Warning Stage</th>
              <th className="p-4">Deletion Hold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {lifecycle.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No accounts pending inactivity warnings or deletion. All active!
                </td>
              </tr>
            ) : (
              lifecycle.map((u) => (
                <tr key={u.user_id} className="hover:bg-slate-800/50">
                  <td className="p-4">
                    <p className="font-semibold text-white">{u.profiles?.full_name || 'Marketplace User'}</p>
                    <p className="text-xs font-mono text-slate-500">{u.user_id.substring(0, 8)}...</p>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-400">
                    {new Date(u.last_active_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 font-mono text-xs text-rose-400 font-bold">
                    {new Date(u.deletion_due_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full flex items-center gap-1 w-fit">
                      <AlertTriangle className="w-3 h-3" />
                      Stage {u.warning_stage}
                    </span>
                  </td>
                  <td className="p-4">
                    {u.deletion_hold ? (
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Hold: {u.deletion_hold_reason || 'Active Transactions'}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">None</span>
                    )}
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
