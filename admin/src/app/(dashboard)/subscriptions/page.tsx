import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  CreditCard,
  ShieldCheck,
  Plus,
  CheckCircle2,
  ImageIcon,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';

interface SubscriptionPlanRow {
  id: string;
  name: string;
  code: string;
  price_monthly: number;
  max_products: number;
  max_images_per_product: number;
  featured_badge: boolean;
  commission_discount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function AdminSubscriptionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createPlanAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const name = String(formData.get('name') ?? '').trim();
    const requestedCode = String(formData.get('code') ?? '').trim();
    if (!name) throw new Error('Plan name is required.');

    const payload = {
      name,
      code: normalizeCode(requestedCode || name),
      price_monthly: Math.max(0, parseNumber(formData.get('priceMonthly'))),
      max_products: Math.max(0, Math.trunc(parseNumber(formData.get('maxProducts'), 10))),
      max_images_per_product: Math.max(1, Math.trunc(parseNumber(formData.get('maxImages'), 2))),
      featured_badge: formData.get('featuredBadge') === 'on',
      commission_discount: Math.min(
        1,
        Math.max(0, parseNumber(formData.get('commissionDiscountPercent')) / 100),
      ),
      is_active: formData.get('isActive') === 'on',
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('subscription_plans').insert(payload);
    if (error) throw new Error(error.message);
    revalidatePath('/subscriptions');
    revalidatePath('/settings');
  }

  async function updatePlanAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const planId = String(formData.get('planId') ?? '');
    const name = String(formData.get('name') ?? '').trim();
    const code = normalizeCode(String(formData.get('code') ?? ''));
    if (!planId || !name || !code) throw new Error('Plan ID, name and code are required.');

    const { error } = await client
      .from('subscription_plans')
      .update({
        name,
        code,
        price_monthly: Math.max(0, parseNumber(formData.get('priceMonthly'))),
        max_products: Math.max(0, Math.trunc(parseNumber(formData.get('maxProducts'), 10))),
        max_images_per_product: Math.max(1, Math.trunc(parseNumber(formData.get('maxImages'), 2))),
        featured_badge: formData.get('featuredBadge') === 'on',
        commission_discount: Math.min(
          1,
          Math.max(0, parseNumber(formData.get('commissionDiscountPercent')) / 100),
        ),
        is_active: formData.get('isActive') === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (error) throw new Error(error.message);
    revalidatePath('/subscriptions');
    revalidatePath('/settings');
  }

  async function togglePlanAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const planId = String(formData.get('planId') ?? '');
    const nextActive = formData.get('nextActive') === 'true';
    const { error } = await client
      .from('subscription_plans')
      .update({
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (error) throw new Error(error.message);
    revalidatePath('/subscriptions');
  }

  async function deletePlanAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const planId = String(formData.get('planId') ?? '');

    const { count, error: countError } = await client
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', planId);
    if (countError) throw new Error(countError.message);

    if ((count ?? 0) > 0) {
      const { error } = await client
        .from('subscription_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from('subscription_plans').delete().eq('id', planId);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/subscriptions');
  }

  const { data: plansData, error } = await supabase
    .from('subscription_plans')
    .select(
      'id, name, code, price_monthly, max_products, max_images_per_product, featured_badge, commission_discount, is_active, created_at, updated_at',
    )
    .order('price_monthly', { ascending: true });

  const plans = (plansData ?? []) as SubscriptionPlanRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <CreditCard className="h-6 w-6 text-emerald-400" />
            Subscription Packages
          </h1>
          <p className="text-sm text-slate-400">
            Create, edit, activate and retire seller packages without changing code.
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          SERVER-AUTHORIZED CRUD
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          Error loading subscription plans: {error.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <Plus className="h-4 w-4 text-emerald-400" />
          Create package
        </h2>
        <form action={createPlanAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="name" required placeholder="Package name" />
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="code" placeholder="code-slug (optional)" />
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="priceMonthly" type="number" min="0" step="0.01" required placeholder="Monthly price (K)" />
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="maxProducts" type="number" min="0" defaultValue="50" required placeholder="Product limit" />
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="maxImages" type="number" min="1" defaultValue="4" required placeholder="Images per product" />
          <input className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" name="commissionDiscountPercent" type="number" min="0" max="100" step="0.01" defaultValue="0" placeholder="Commission discount %" />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="featuredBadge" />
            Featured seller badge
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="isActive" defaultChecked />
            Active package
          </label>
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">
            Save Package
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-1 font-mono text-xs font-bold text-blue-400">
                    {plan.code.toUpperCase()}
                  </span>
                  <span className={`rounded border px-2 py-1 text-xs font-bold ${
                    plan.is_active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                  }`}>
                    {plan.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="mt-1 text-2xl font-black text-emerald-400">
                  K{Number(plan.price_monthly).toFixed(2)}
                  <span className="ml-1 text-xs font-normal text-slate-400">/ month</span>
                </p>
              </div>

              <div className="flex gap-2">
                <form action={togglePlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="nextActive" value={String(!plan.is_active)} />
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white" title={plan.is_active ? 'Deactivate' : 'Activate'}>
                    <Power className="h-4 w-4" />
                  </button>
                </form>
                <form action={deletePlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400" title="Delete unused package or deactivate one that has subscribers">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm">
              <div className="rounded-lg bg-slate-950 p-3">
                <div className="text-xs text-slate-500">Products</div>
                <div className="font-bold text-white">{plan.max_products}</div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3">
                <div className="flex items-center gap-1 text-xs text-slate-500"><ImageIcon className="h-3 w-3" /> Images / product</div>
                <div className="font-bold text-white">{plan.max_images_per_product}</div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3">
                <div className="text-xs text-slate-500">Commission discount</div>
                <div className="font-bold text-white">{(Number(plan.commission_discount) * 100).toFixed(2)}%</div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3">
                <div className="text-xs text-slate-500">Badge</div>
                <div className="flex items-center gap-1 font-bold text-white">
                  {plan.featured_badge && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {plan.featured_badge ? 'Featured' : 'Standard'}
                </div>
              </div>
            </div>

            <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-200">
                <Pencil className="h-4 w-4" />
                Edit package
              </summary>
              <form action={updatePlanAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="hidden" name="planId" value={plan.id} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="name" required defaultValue={plan.name} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="code" required defaultValue={plan.code} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="priceMonthly" type="number" min="0" step="0.01" required defaultValue={plan.price_monthly} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="maxProducts" type="number" min="0" required defaultValue={plan.max_products} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="maxImages" type="number" min="1" required defaultValue={plan.max_images_per_product} />
                <input className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" name="commissionDiscountPercent" type="number" min="0" max="100" step="0.01" defaultValue={Number(plan.commission_discount) * 100} />
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" name="featuredBadge" defaultChecked={plan.featured_badge} />
                  Featured seller badge
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" name="isActive" defaultChecked={plan.is_active} />
                  Active
                </label>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
                  Save changes
                </button>
              </form>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
