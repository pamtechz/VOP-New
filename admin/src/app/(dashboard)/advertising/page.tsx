import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Megaphone, Plus, ShieldCheck } from 'lucide-react';

interface CampaignRow {
  id: string;
  title: string;
  placement: string;
  budget: number;
  status: string;
  start_date: string;
  end_date: string;
  advertisers: { company_name: string } | null;
  stores: { name: string } | null;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'scheduled':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'completed':
      return 'bg-slate-800 text-slate-300 border-slate-700';
    default:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }
};

export default async function AdminAdvertisingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaignsData } = await supabase
    .from('ad_campaigns')
    .select('id, title, placement, budget, status, start_date, end_date, advertisers(company_name), stores(name)')
    .order('created_at', { ascending: false });

  const campaigns: CampaignRow[] = (campaignsData ?? []) as unknown as CampaignRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-400" />
            Direct Advertising System
          </h1>
          <p className="text-slate-400 text-sm">
            {campaigns.length} registered campaign{campaigns.length !== 1 ? 's' : ''} in PostgreSQL — manage placement creatives and budgets.
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
              <th className="p-4">Campaign Title</th>
              <th className="p-4">Advertiser / Store</th>
              <th className="p-4">Placement</th>
              <th className="p-4">Budget (ZMW)</th>
              <th className="p-4">Schedule</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No advertising campaigns found.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-semibold text-white">{c.title}</td>
                  <td className="p-4 text-slate-400">
                    {c.advertisers?.company_name || c.stores?.name || 'Platform Sponsor'}
                  </td>
                  <td className="p-4 font-mono text-xs text-amber-300">{c.placement}</td>
                  <td className="p-4 font-mono font-bold text-white">
                    K{Number(c.budget).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {new Date(c.start_date).toLocaleDateString()} &rarr; {new Date(c.end_date).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${statusBadge(c.status)}`}>
                      {c.status.toUpperCase()}
                    </span>
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
