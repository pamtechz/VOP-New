import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Tag, Plus, ShieldCheck, Ticket, Percent, Trash2 } from 'lucide-react';

interface PromoRow {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  is_active: boolean;
  created_at: string;
}

export default async function AdminPromotionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createCouponAction(formData: FormData) {
    'use server';
    const code = (formData.get('code') as string).toUpperCase();
    const discountType = formData.get('discountType') as string;
    const discountValue = parseFloat(formData.get('discountValue') as string || '10');
    const minOrderAmount = parseFloat(formData.get('minOrderAmount') as string || '0');
    const client = await createServerSupabaseClient();

    await client.from('promotions').insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: minOrderAmount,
      is_active: true,
    });

    revalidatePath('/promotions');
  }

  async function toggleCouponActiveAction(formData: FormData) {
    'use server';
    const promoId = formData.get('promoId') as string;
    const currentActive = formData.get('currentActive') === 'true';
    const client = await createServerSupabaseClient();

    await client
      .from('promotions')
      .update({ is_active: !currentActive })
      .eq('id', promoId);

    revalidatePath('/promotions');
  }

  async function deleteCouponAction(formData: FormData) {
    'use server';
    const promoId = formData.get('promoId') as string;
    const client = await createServerSupabaseClient();

    await client.from('promotions').delete().eq('id', promoId);
    revalidatePath('/promotions');
  }

  const { data: promosData, error } = await supabase
    .from('promotions')
    .select('id, code, discount_type, discount_value, min_order_amount, is_active, created_at')
    .order('created_at', { ascending: false });

  const promos: PromoRow[] = (promosData ?? []) as PromoRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Ticket className="w-6 h-6 text-pink-400" />
            Platform Coupon & Promotion Engine
          </h1>
          <p className="text-slate-400 text-sm">
            {promos.length} coupon campaign{promos.length !== 1 ? 's' : ''} configured — launch site-wide discounts and vendor-subsidized promotions.
          </p>
        </div>
        <span className="px-3 py-1 bg-pink-500/10 text-pink-400 border border-pink-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          AUTO-VALIDATED AT CHECKOUT
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Notice: {error.message}
        </div>
      )}

      {/* Create Coupon Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-pink-400" />
          Create New Promo Code
        </h2>
        <form action={createCouponAction} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Coupon Code</label>
            <input
              type="text"
              name="code"
              required
              placeholder="e.g. PAMTECHZ10"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white uppercase font-mono focus:outline-none focus:border-pink-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Discount Type</label>
            <select
              name="discountType"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
            >
              <option value="percentage">Percentage Off (%)</option>
              <option value="fixed">Fixed Amount Off (K)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Discount Value</label>
            <input
              type="number"
              step="0.01"
              name="discountValue"
              required
              placeholder="10"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Min Order Amount (K)</label>
            <input
              type="number"
              step="0.01"
              name="minOrderAmount"
              defaultValue={0}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Coupon
          </button>
        </form>
      </div>

      {/* Promos Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Promo Code</th>
              <th className="p-4">Discount Type</th>
              <th className="p-4">Discount Value</th>
              <th className="p-4">Min Order</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {promos.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No active coupon campaigns yet. Create your first promotional code above.
                </td>
              </tr>
            ) : (
              promos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-pink-400">{p.code}</td>
                  <td className="p-4 text-xs font-semibold text-slate-300">
                    {p.discount_type.toUpperCase()}
                  </td>
                  <td className="p-4 font-bold text-emerald-400">
                    {p.discount_type === 'percentage' ? `${p.discount_value}% OFF` : `K${p.discount_value.toFixed(2)} OFF`}
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {p.min_order_amount > 0 ? `K${p.min_order_amount.toFixed(2)}` : 'No Minimum'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                      p.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {p.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <form action={toggleCouponActiveAction}>
                        <input type="hidden" name="promoId" value={p.id} />
                        <input type="hidden" name="currentActive" value={String(p.is_active)} />
                        <button
                          type="submit"
                          className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
                            p.is_active
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          {p.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </form>

                      <form action={deleteCouponAction}>
                        <input type="hidden" name="promoId" value={p.id} />
                        <button
                          type="submit"
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Coupon"
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
