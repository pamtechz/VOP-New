import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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

  async function approvePayoutAction(formData: FormData) {
    'use server';
    const payoutId = String(formData.get('payoutId') ?? '');
    const client = await createServerSupabaseClient();

    const { error } = await client.rpc('review_payout', {
      p_payout_id: payoutId,
      p_action: 'approve',
      p_reason: null,
    });
    if (error) throw new Error(error.message);

    revalidatePath('/payouts');
  }

  async function rejectPayoutAction(formData: FormData) {
    'use server';
    const payoutId = String(formData.get('payoutId') ?? '');
    const reason = String(formData.get('reason') ?? '').trim();
    if (!reason) throw new Error('A rejection reason is required.');

    const client = await createServerSupabaseClient();
    const { error } = await client.rpc('review_payout', {
      p_payout_id: payoutId,
      p_action: 'reject',
      p_reason: reason,
    });
    if (error) throw new Error(error.message);

    revalidatePath('/payouts');
  }

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
              <th className="p-4">Status & Actions</th>
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
                const destinationInfo =
                  p.destination_info && typeof p.destination_info === 'object'
                    ? p.destination_info as Record<string, unknown>
                    : {};
                const destinationProvider = String(destinationInfo.provider ?? 'Payout account');
                const destinationAccount = String(destinationInfo.account ?? destinationInfo.phone ?? '—');
                const destinationName = destinationInfo.account_name
                  ? String(destinationInfo.account_name)
                  : null;
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
                    <td className="p-4 text-xs text-slate-400">
                      <div className="font-semibold text-slate-300">{destinationProvider}</div>
                      <div>{destinationAccount}</div>
                      {destinationName && <div className="text-slate-500">{destinationName}</div>}
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      {p.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <form action={approvePayoutAction}>
                            <input type="hidden" name="payoutId" value={p.id} />
                            <button
                              type="submit"
                              className="px-2.5 py-1 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                          </form>
                          <details className="relative">
                            <summary className="list-none cursor-pointer px-2.5 py-1 text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded flex items-center gap-1 transition-colors">
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </summary>
                            <form action={rejectPayoutAction} className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
                              <input type="hidden" name="payoutId" value={p.id} />
                              <label className="text-xs text-slate-400">
                                Reason
                                <textarea
                                  name="reason"
                                  required
                                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                                  placeholder="Explain why this payout is being rejected"
                                />
                              </label>
                              <button type="submit" className="mt-2 w-full rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">
                                Reject and restore balance
                              </button>
                            </form>
                          </details>
                        </div>
                      ) : p.status === 'approved' || p.status === 'processing' || p.status === 'completed' ? (
                        <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> {p.status.toUpperCase()}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> {p.status.toUpperCase()}
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
