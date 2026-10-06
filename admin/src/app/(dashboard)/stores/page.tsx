import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Store, ShieldCheck, CheckCircle2, Ban } from 'lucide-react';

interface StoreRow {
  id: string;
  public_ref: string;
  name: string;
  slug: string;
  status: string;
  total_sales: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  profiles: { full_name: string } | null;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'paused':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'suspended':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
};

export default async function AdminStoresPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updateStoreStatusAction(formData: FormData) {
    'use server';
    const storeId = formData.get('storeId') as string;
    const newStatus = formData.get('newStatus') as string;
    const client = await createServerSupabaseClient();

    await client
      .from('stores')
      .update({ status: newStatus })
      .eq('id', storeId);

    revalidatePath('/stores');
  }

  const { data: storesData, error } = await supabase
    .from('stores')
    .select('id, public_ref, name, slug, status, total_sales, rating_avg, rating_count, created_at, profiles!stores_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const stores: StoreRow[] = (storesData ?? []) as unknown as StoreRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Store className="w-6 h-6 text-purple-400" />
            Stores & Seller Management
          </h1>
          <p className="text-slate-400 text-sm">
            {stores.length} registered store{stores.length !== 1 ? 's' : ''} — monitor subscriptions, sales, ratings, and active status.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          RLS ENFORCED
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error loading stores: {error.message}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Store Reference</th>
              <th className="p-4">Store Name</th>
              <th className="p-4">Owner</th>
              <th className="p-4">Total Sales</th>
              <th className="p-4">Rating</th>
              <th className="p-4">Status</th>
              <th className="p-4">Admin Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {stores.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No stores registered yet. Stores appear when sellers create them.
                </td>
              </tr>
            ) : (
              stores.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-blue-400">{s.public_ref}</td>
                  <td className="p-4 font-semibold text-white">{s.name}</td>
                  <td className="p-4">{(s.profiles as any)?.full_name ?? '—'}</td>
                  <td className="p-4 font-bold text-emerald-400">K{Number(s.total_sales ?? 0).toFixed(2)}</td>
                  <td className="p-4 font-semibold text-amber-400">
                    {s.rating_count > 0 ? `★ ${Number(s.rating_avg).toFixed(1)} (${s.rating_count})` : '—'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-bold border rounded ${statusBadge(s.status)}`}>
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <form action={updateStoreStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="storeId" value={s.id} />
                      {s.status === 'active' ? (
                        <button
                          type="submit"
                          name="newStatus"
                          value="suspended"
                          className="px-2.5 py-1 text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded flex items-center gap-1 transition-colors"
                        >
                          <Ban className="w-3 h-3" /> Suspend Store
                        </button>
                      ) : (
                        <button
                          type="submit"
                          name="newStatus"
                          value="active"
                          className="px-2.5 py-1 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Activate Store
                        </button>
                      )}
                    </form>
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
