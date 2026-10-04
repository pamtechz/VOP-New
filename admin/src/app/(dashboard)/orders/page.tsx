import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { CreditCard, ShieldCheck, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface OrderRow {
  id: string;
  public_ref: string;
  buyer_name: string;
  buyer_phone: string;
  total_amount: number;
  payment_status: string;
  status: string;
  created_at: string;
}

const paymentBadge = (status: string) => {
  switch (status) {
    case 'paid': return { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 };
    case 'pending': return { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: Clock };
    case 'failed': return { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', Icon: XCircle };
    default: return { cls: 'bg-slate-800 text-slate-400 border-slate-700', Icon: Clock };
  }
};

export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ordersData, error } = await supabase
    .from('orders')
    .select('id, public_ref, buyer_name, buyer_phone, total_amount, payment_status, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const orders: OrderRow[] = (ordersData ?? []) as OrderRow[];

  const totalRevenue = orders
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            Orders Management
          </h1>
          <p className="text-slate-400 text-sm">
            {orders.length} order{orders.length !== 1 ? 's' : ''} · Total revenue: K{totalRevenue.toFixed(2)}
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          RLS ENFORCED
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error loading orders: {error.message}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Order Ref</th>
              <th className="p-4">Buyer</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No orders yet. Orders will appear here when buyers place them.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const badge = paymentBadge(order.payment_status);
                const Icon = badge.Icon;
                return (
                  <tr key={order.id} className="hover:bg-slate-800/50">
                    <td className="p-4 font-mono font-bold text-blue-400">
                      {order.public_ref ?? order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="p-4 font-semibold text-white">{order.buyer_name ?? '—'}</td>
                    <td className="p-4 text-slate-400 text-xs">{order.buyer_phone ?? '—'}</td>
                    <td className="p-4 font-bold text-emerald-400">
                      K{Number(order.total_amount ?? 0).toFixed(2)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-bold border rounded flex items-center gap-1 w-fit ${badge.cls}`}>
                        <Icon className="w-3 h-3" />
                        {order.payment_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(order.created_at).toLocaleDateString()}
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
