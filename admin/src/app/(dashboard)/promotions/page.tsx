import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  Ticket,
  Plus,
  ShieldCheck,
  Trash2,
  Pencil,
  Power,
  Clock3,
  Users,
} from 'lucide-react';

interface PromoRow {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  promotion_redemptions: { count: number }[];
}

function parseMoney(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normaliseCode(value: FormDataEntryValue | null) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function toIsoOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid promotion date.');
  return date.toISOString();
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validateDiscount(type: string, value: number) {
  if (!['percentage', 'fixed'].includes(type)) {
    throw new Error('Unsupported discount type.');
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Discount value must be greater than zero.');
  }
  if (type === 'percentage' && value > 100) {
    throw new Error('Percentage discounts cannot exceed 100%.');
  }
}

export default async function AdminPromotionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createPromotionAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const { data: { user: actor } } = await client.auth.getUser();
    if (!actor) redirect('/login');

    const code = normaliseCode(formData.get('code'));
    const discountType = String(formData.get('discountType') ?? '');
    const discountValue = parseMoney(formData.get('discountValue'));
    const minimum = Math.max(0, parseMoney(formData.get('minOrderAmount')));
    const maxDiscountRaw = String(formData.get('maxDiscountAmount') ?? '').trim();
    const maxDiscount = maxDiscountRaw ? parseMoney(maxDiscountRaw) : null;
    const startsAt = toIsoOrNull(formData.get('startsAt'));
    const endsAt = toIsoOrNull(formData.get('endsAt'));
    const usageLimit = parsePositiveInteger(formData.get('usageLimit'));
    const perUserLimit = parsePositiveInteger(formData.get('perUserLimit')) ?? 1;

    if (!code) throw new Error('Promotion code is required.');
    validateDiscount(discountType, discountValue);
    if (maxDiscount != null && maxDiscount <= 0) throw new Error('Maximum discount must be positive.');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new Error('End date must be after start date.');
    }

    const { error } = await client.from('promotions').insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: minimum,
      max_discount_amount: maxDiscount,
      starts_at: startsAt,
      ends_at: endsAt,
      usage_limit: usageLimit,
      per_user_limit: perUserLimit,
      is_active: formData.get('isActive') === 'on',
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    revalidatePath('/promotions');
  }

  async function updatePromotionAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('promoId') ?? '');
    const code = normaliseCode(formData.get('code'));
    const discountType = String(formData.get('discountType') ?? '');
    const discountValue = parseMoney(formData.get('discountValue'));
    const minimum = Math.max(0, parseMoney(formData.get('minOrderAmount')));
    const maxDiscountRaw = String(formData.get('maxDiscountAmount') ?? '').trim();
    const maxDiscount = maxDiscountRaw ? parseMoney(maxDiscountRaw) : null;
    const startsAt = toIsoOrNull(formData.get('startsAt'));
    const endsAt = toIsoOrNull(formData.get('endsAt'));
    const usageLimit = parsePositiveInteger(formData.get('usageLimit'));
    const perUserLimit = parsePositiveInteger(formData.get('perUserLimit')) ?? 1;

    if (!id || !code) throw new Error('Promotion ID and code are required.');
    validateDiscount(discountType, discountValue);
    if (maxDiscount != null && maxDiscount <= 0) throw new Error('Maximum discount must be positive.');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new Error('End date must be after start date.');
    }

    const { error } = await client
      .from('promotions')
      .update({
        code,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: minimum,
        max_discount_amount: maxDiscount,
        starts_at: startsAt,
        ends_at: endsAt,
        usage_limit: usageLimit,
        per_user_limit: perUserLimit,
        is_active: formData.get('isActive') === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);

    revalidatePath('/promotions');
  }

  async function togglePromotionAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('promoId') ?? '');
    const nextActive = formData.get('nextActive') === 'true';

    const { error } = await client
      .from('promotions')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);

    revalidatePath('/promotions');
  }

  async function deletePromotionAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('promoId') ?? '');

    const { count, error: countError } = await client
      .from('promotion_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', id);
    if (countError) throw new Error(countError.message);

    if ((count ?? 0) > 0) {
      const { error } = await client
        .from('promotions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from('promotions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/promotions');
  }

  const { data: promosData, error } = await supabase
    .from('promotions')
    .select(
      'id, code, discount_type, discount_value, min_order_amount, max_discount_amount, starts_at, ends_at, usage_limit, per_user_limit, is_active, created_at, updated_at, promotion_redemptions(count)',
    )
    .order('created_at', { ascending: false });

  const promos = (promosData ?? []) as unknown as PromoRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Ticket className="h-6 w-6 text-pink-400" />
            Promotions & Coupons
          </h1>
          <p className="text-sm text-slate-400">
            Configure seller-funded marketplace discounts that are revalidated atomically during checkout.
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          SERVER-AUTHORITATIVE
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <Plus className="h-4 w-4 text-pink-400" />
          Create promotion
        </h2>
        <form action={createPromotionAction} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input name="code" required placeholder="CODE" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm uppercase text-white" />
          <select name="discountType" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (K)</option>
          </select>
          <input name="discountValue" type="number" min="0.01" step="0.01" required placeholder="Discount value" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="minOrderAmount" type="number" min="0" step="0.01" defaultValue="0" placeholder="Minimum order" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="maxDiscountAmount" type="number" min="0.01" step="0.01" placeholder="Maximum discount (optional)" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="usageLimit" type="number" min="1" placeholder="Total usage limit" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="perUserLimit" type="number" min="1" defaultValue="1" placeholder="Per-user limit" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input name="isActive" type="checkbox" defaultChecked />
            Active immediately
          </label>
          <label className="text-xs text-slate-400">
            Starts
            <input name="startsAt" type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-400">
            Ends
            <input name="endsAt" type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <button className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-500 xl:col-span-2">
            Create Promotion
          </button>
        </form>
      </section>

      <div className="space-y-4">
        {promos.map((promo) => {
          const uses = promo.promotion_redemptions?.[0]?.count ?? 0;
          return (
            <article key={promo.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-pink-500/20 bg-pink-500/10 px-2 py-1 font-mono text-xs font-bold text-pink-400">
                      {promo.code}
                    </span>
                    <span className={`rounded px-2 py-1 text-xs font-bold ${
                      promo.is_active
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {promo.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="mt-3 text-xl font-bold text-white">
                    {promo.discount_type === 'percentage'
                      ? `${Number(promo.discount_value).toFixed(2)}% off`
                      : `K${Number(promo.discount_value).toFixed(2)} off`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>Minimum K{Number(promo.min_order_amount).toFixed(2)}</span>
                    {promo.max_discount_amount != null && (
                      <span>Cap K{Number(promo.max_discount_amount).toFixed(2)}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {uses}{promo.usage_limit ? ` / ${promo.usage_limit}` : ''} reservations
                    </span>
                    <span>Per user: {promo.per_user_limit}</span>
                    {(promo.starts_at || promo.ends_at) && (
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {promo.starts_at ? new Date(promo.starts_at).toLocaleString() : 'Now'}
                        {' → '}
                        {promo.ends_at ? new Date(promo.ends_at).toLocaleString() : 'No end'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <form action={togglePromotionAction}>
                    <input type="hidden" name="promoId" value={promo.id} />
                    <input type="hidden" name="nextActive" value={String(!promo.is_active)} />
                    <button className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" title={promo.is_active ? 'Deactivate' : 'Activate'}>
                      <Power className="h-4 w-4" />
                    </button>
                  </form>
                  <form action={deletePromotionAction}>
                    <input type="hidden" name="promoId" value={promo.id} />
                    <button className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400" title="Delete unused promotion or deactivate one with history">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>

              <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-200">
                  <Pencil className="h-4 w-4" />
                  Edit promotion
                </summary>
                <form action={updatePromotionAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="promoId" value={promo.id} />
                  <input name="code" required defaultValue={promo.code} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm uppercase text-white" />
                  <select name="discountType" defaultValue={promo.discount_type} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount (K)</option>
                  </select>
                  <input name="discountValue" type="number" min="0.01" step="0.01" required defaultValue={promo.discount_value} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <input name="minOrderAmount" type="number" min="0" step="0.01" defaultValue={promo.min_order_amount} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <input name="maxDiscountAmount" type="number" min="0.01" step="0.01" defaultValue={promo.max_discount_amount ?? ''} placeholder="No maximum" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <input name="usageLimit" type="number" min="1" defaultValue={promo.usage_limit ?? ''} placeholder="Unlimited" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <input name="perUserLimit" type="number" min="1" defaultValue={promo.per_user_limit} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input name="isActive" type="checkbox" defaultChecked={promo.is_active} />
                    Active
                  </label>
                  <label className="text-xs text-slate-400">
                    Starts
                    <input name="startsAt" type="datetime-local" defaultValue={toDateTimeLocal(promo.starts_at)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  </label>
                  <label className="text-xs text-slate-400">
                    Ends
                    <input name="endsAt" type="datetime-local" defaultValue={toDateTimeLocal(promo.ends_at)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                  </label>
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 xl:col-span-2">
                    Save Changes
                  </button>
                </form>
              </details>
            </article>
          );
        })}

        {promos.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-sm text-slate-500">
            No promotions configured.
          </div>
        )}
      </div>
    </div>
  );
}
