import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CreditCard, ShieldCheck, Plus, CheckCircle2, Percent, Layers, Trash2 } from 'lucide-react';

interface SubscriptionPlanRow {
  id: string;
  name: string;
  code: string;
  price_monthly: number;
  max_products: number;
  commission_rate: number;
  created_at: string;
}

export default async function AdminSubscriptionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createPlanAction(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const code = formData.get('code') as string || name.toLowerCase().replace(/\s+/g, '-');
    const priceMonthly = parseFloat(formData.get('priceMonthly') as string || '0');
    const maxProducts = parseInt(formData.get('maxProducts') as string || '50', 10);
    const commissionRate = parseFloat(formData.get('commissionRate') as string || '0.10');
    const client = await createServerSupabaseClient();

    await client.from('subscription_plans').insert({
      name,
      code,
      price_monthly: priceMonthly,
      max_products: maxProducts,
      commission_rate: commissionRate,
    });

    revalidatePath('/subscriptions');
  }

  async function deletePlanAction(formData: FormData) {
    'use server';
    const planId = formData.get('planId') as string;
    const client = await createServerSupabaseClient();

    await client.from('subscription_plans').delete().eq('id', planId);
    revalidatePath('/subscriptions');
  }

  const { data: plansData, error } = await supabase
    .from('subscription_plans')
    .select('id, name, code, price_monthly, max_products, commission_rate, created_at')
    .order('price_monthly', { ascending: true });

  const plans: SubscriptionPlanRow[] = (plansData ?? []) as SubscriptionPlanRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            Vendor Subscription & Commission Engine
          </h1>
          <p className="text-slate-400 text-sm">
            {plans.length} subscription packages configured — manage tier pricing, product limits, and platform fee split rates.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          COMMISSION AUTOMATED
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error loading subscription plans: {error.message}
        </div>
      )}

      {/* Create Subscription Tier Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          Create New Vendor Subscription Tier
        </h2>
        <form action={createPlanAction} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Plan Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Enterprise Tier"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Code Slug</label>
            <input
              type="text"
              name="code"
              placeholder="enterprise-tier"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Monthly Fee (K)</label>
            <input
              type="number"
              step="0.01"
              name="priceMonthly"
              required
              placeholder="299.00"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Max Catalog Products</label>
            <input
              type="number"
              name="maxProducts"
              defaultValue={500}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Save Package
          </button>
        </form>
      </div>

      {/* Subscription Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p) => (
          <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                {p.code.toUpperCase()}
              </span>
              <form action={deletePlanAction}>
                <input type="hidden" name="planId" value={p.id} />
                <button
                  type="submit"
                  className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                  title="Delete Plan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">{p.name}</h3>
              <p className="text-2xl font-black text-emerald-400 mt-1">
                K{Number(p.price_monthly).toFixed(2)} <span className="text-xs text-slate-400 font-normal">/ month</span>
              </p>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Catalogue Product Limit:</span>
                <span className="font-bold text-white">{p.max_products} Products</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Commission Rate:</span>
                <span className="font-bold text-emerald-400">{(Number(p.commission_rate) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
