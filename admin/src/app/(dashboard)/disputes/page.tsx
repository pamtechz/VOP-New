import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ShieldCheck, Scale, CheckCircle2, RotateCcw, Plus, Trash2, AlertCircle } from 'lucide-react';

interface DisputeRow {
  id: string;
  public_ref: string;
  seller_order_id: string;
  reason: string;
  status: string;
  refund_amount: number;
  created_at: string;
  seller_orders: { id: string; public_ref: string; subtotal: number } | null;
  profiles: { full_name: string } | null;
}

export default async function AdminDisputesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function resolveDisputeAction(formData: FormData) {
    'use server';
    const disputeId = formData.get('disputeId') as string;
    const newStatus = formData.get('newStatus') as string;
    const client = await createServerSupabaseClient();

    await client
      .from('disputes')
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId);

    revalidatePath('/disputes');
  }

  async function deleteDisputeAction(formData: FormData) {
    'use server';
    const disputeId = formData.get('disputeId') as string;
    const client = await createServerSupabaseClient();

    await client.from('disputes').delete().eq('id', disputeId);
    revalidatePath('/disputes');
  }

  const { data: disputesData, error } = await supabase
    .from('disputes')
    .select('id, public_ref, seller_order_id, reason, status, refund_amount, created_at, seller_orders(id, public_ref, subtotal), profiles!disputes_buyer_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const disputes: DisputeRow[] = (disputesData ?? []) as unknown as DisputeRow[];

  const openCount = disputes.filter(d => d.status === 'open' || d.status === 'under_review').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scale className="w-6 h-6 text-amber-400" />
            Dispute & Trust System (eBay-Style Resolution)
          </h1>
          <p className="text-slate-400 text-sm">
            {disputes.length} disputes recorded · {openCount} active buyer/seller disputes requiring arbitration
          </p>
        </div>
        <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          ESCROW OVERRIDE ACTIVE
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Notice: {error.message}
        </div>
      )}

      {/* Disputes Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Dispute Ref</th>
              <th className="p-4">Seller Order Ref</th>
              <th className="p-4">Buyer Name</th>
              <th className="p-4">Claim / Reason</th>
              <th className="p-4">Order Value</th>
              <th className="p-4">Status</th>
              <th className="p-4">Escrow Arbitration & CRUD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {disputes.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No disputes recorded. Disputes appear here when buyers open refund claims.
                </td>
              </tr>
            ) : (
              disputes.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-rose-400">
                    {d.public_ref ?? d.id.slice(0, 8)}
                  </td>
                  <td className="p-4 font-mono text-blue-400">
                    {(d.seller_orders as any)?.public_ref ?? d.seller_order_id.slice(0, 8)}
                  </td>
                  <td className="p-4 font-semibold text-white">
                    {(d.profiles as any)?.full_name ?? 'Buyer'}
                  </td>
                  <td className="p-4 text-xs text-slate-300 max-w-xs truncate">
                    {d.reason}
                  </td>
                  <td className="p-4 font-bold text-emerald-400">
                    K{Number((d.seller_orders as any)?.subtotal ?? 0).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded border ${
                      d.status === 'open' || d.status === 'under_review'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : d.status === 'resolved_refunded'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {d.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {d.status === 'open' || d.status === 'under_review' ? (
                        <>
                          <form action={resolveDisputeAction}>
                            <input type="hidden" name="disputeId" value={d.id} />
                            <button
                              type="submit"
                              name="newStatus"
                              value="resolved_refunded"
                              className="px-2.5 py-1 text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Force Refund
                            </button>
                          </form>
                          <form action={resolveDisputeAction}>
                            <input type="hidden" name="disputeId" value={d.id} />
                            <button
                              type="submit"
                              name="newStatus"
                              value="resolved_rejected"
                              className="px-2.5 py-1 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Release to Vendor
                            </button>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium">Arbitrated</span>
                      )}

                      <form action={deleteDisputeAction}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <button
                          type="submit"
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
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
