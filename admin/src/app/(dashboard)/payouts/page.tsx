import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Wallet, CheckCircle2, Clock, XCircle, ShieldCheck } from 'lucide-react';

interface PayoutRow {
  id: string;
  public_ref: string;
  amount: number;
  status: string;
  destination_info: any;
  created_at: string;
  stores: { name: string } | null;
}

export default async function AdminPayoutsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: payoutsData, error } = await supabase
    .from('payouts')
    .select('id, public_ref, amount, status, destination_info, created_at, stores(name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const payouts: PayoutRow[] = (payoutsData ?? []) as unknown as PayoutRow[];

  const pendingTotal = payouts
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Payout Requests
          </h1>
          <p className="text-slate-400 text-sm">
            {payouts.filter(p => p.status === 'pending').length} pending · K{pendingTotal.toFixed(2)} awaiting approval
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          SERVER AUTHORIZED
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error: {error.message}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Payout Ref</th>
              <th className="p-4">Store</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Destination</th>
              <th className="p-4">Requested</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {payouts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No payout requests yet.
                </td>
              </tr>
            ) : (
              payouts.map((p) => {
                const destination = typeof p.destination_info === 'object'
                  ? JSON.stringify(p.destination_info)
                  : String(p.destination_info ?? '—');
                return (
                  <tr key={p.id} className="hover:bg-slate-800/50">
                    <td className="p-4 font-mono font-bold text-blue-400">
                      {p.public_ref ?? p.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="p-4 font-semibold text-white">
                      {(p.stores as any)?.name ?? '—'}
                    </td>
                    <td className="p-4 font-bold text-emerald-400">
                      K{Number(p.amount ?? 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-xs text-slate-400 max-w-xs truncate">
                      {destination}
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      {p.status === 'pending' && (
                        <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded flex items-center gap-1 w-fit">
                          <Clock className="w-3 h-3" /> PENDING
                        </span>
                      )}
                      {p.status === 'approved' && (
                        <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> APPROVED
                        </span>
                      )}
                      {p.status === 'rejected' && (
                        <span className="px-2.5 py-1 text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> REJECTED
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
