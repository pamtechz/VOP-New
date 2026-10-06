import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  Megaphone,
  Plus,
  ShieldCheck,
  Pencil,
  Trash2,
  ImageIcon,
  Building2,
} from 'lucide-react';

const placements = [
  'home_hero',
  'home_inline',
  'explore_inline',
  'category_banner',
  'sponsored_search',
  'native_card',
];

const campaignStatuses = [
  'draft',
  'pending_payment',
  'approved',
  'scheduled',
  'active',
  'paused',
  'completed',
  'cancelled',
  'rejected',
];

interface CreativeRow {
  id: string;
  headline: string;
  body_text: string | null;
  image_url: string;
  target_url: string;
  cta_text: string | null;
}

interface CampaignRow {
  id: string;
  advertiser_id: string | null;
  store_id: string | null;
  target_category_id: string | null;
  title: string;
  placement: string;
  budget: number;
  status: string;
  start_date: string;
  end_date: string;
  advertisers: { company_name: string } | null;
  stores: { name: string } | null;
  categories: { name: string } | null;
  ad_creatives: CreativeRow[];
}

interface AdvertiserRow {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
}

interface OptionRow {
  id: string;
  name: string;
}

function toIso(value: FormDataEntryValue | null, field: string) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${field} is required.`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${field.toLowerCase()}.`);
  return date.toISOString();
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function optionalUuid(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

function campaignPayload(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const placement = String(formData.get('placement') ?? '');
  const status = String(formData.get('status') ?? 'draft');
  const budget = Number(formData.get('budget') ?? 0);
  const startDate = toIso(formData.get('startDate'), 'Start date');
  const endDate = toIso(formData.get('endDate'), 'End date');

  if (!title) throw new Error('Campaign title is required.');
  if (!placements.includes(placement)) throw new Error('Invalid advertising placement.');
  if (!campaignStatuses.includes(status)) throw new Error('Invalid campaign status.');
  if (!Number.isFinite(budget) || budget < 0) throw new Error('Budget must be zero or greater.');
  if (new Date(endDate) <= new Date(startDate)) throw new Error('Campaign end date must be after the start date.');

  return {
    title,
    placement,
    status,
    budget,
    start_date: startDate,
    end_date: endDate,
    advertiser_id: optionalUuid(formData.get('advertiserId')),
    store_id: optionalUuid(formData.get('storeId')),
    target_category_id: optionalUuid(formData.get('categoryId')),
    updated_at: new Date().toISOString(),
  };
}

export default async function AdminAdvertisingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createAdvertiserAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const companyName = String(formData.get('companyName') ?? '').trim();
    const contactName = String(formData.get('contactName') ?? '').trim();
    const contactEmail = String(formData.get('contactEmail') ?? '').trim().toLowerCase();
    if (!companyName || !contactName || !contactEmail) {
      throw new Error('Company, contact name and contact email are required.');
    }

    const { error } = await client.from('advertisers').insert({
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: String(formData.get('contactPhone') ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function updateAdvertiserAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('advertiserId') ?? '');
    const companyName = String(formData.get('companyName') ?? '').trim();
    const contactName = String(formData.get('contactName') ?? '').trim();
    const contactEmail = String(formData.get('contactEmail') ?? '').trim().toLowerCase();
    if (!id || !companyName || !contactName || !contactEmail) {
      throw new Error('Advertiser details are incomplete.');
    }

    const { error } = await client
      .from('advertisers')
      .update({
        company_name: companyName,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: String(formData.get('contactPhone') ?? '').trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function createCampaignAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const { error } = await client.from('ad_campaigns').insert(campaignPayload(formData));
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function updateCampaignAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('campaignId') ?? '');
    if (!id) throw new Error('Campaign ID is required.');

    const { error } = await client
      .from('ad_campaigns')
      .update(campaignPayload(formData))
      .eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function createCreativeAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const campaignId = String(formData.get('campaignId') ?? '');
    const headline = String(formData.get('headline') ?? '').trim();
    const imageUrl = String(formData.get('imageUrl') ?? '').trim();
    const targetUrl = String(formData.get('targetUrl') ?? '').trim();
    if (!campaignId || !headline || !imageUrl || !targetUrl) {
      throw new Error('Campaign, headline, image URL and target URL are required.');
    }

    const { error } = await client.from('ad_creatives').insert({
      campaign_id: campaignId,
      headline,
      body_text: String(formData.get('bodyText') ?? '').trim() || null,
      image_url: imageUrl,
      target_url: targetUrl,
      cta_text: String(formData.get('ctaText') ?? '').trim() || 'Learn More',
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function updateCreativeAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const creativeId = String(formData.get('creativeId') ?? '');
    const headline = String(formData.get('headline') ?? '').trim();
    const imageUrl = String(formData.get('imageUrl') ?? '').trim();
    const targetUrl = String(formData.get('targetUrl') ?? '').trim();
    if (!creativeId || !headline || !imageUrl || !targetUrl) {
      throw new Error('Creative details are incomplete.');
    }

    const { error } = await client
      .from('ad_creatives')
      .update({
        headline,
        body_text: String(formData.get('bodyText') ?? '').trim() || null,
        image_url: imageUrl,
        target_url: targetUrl,
        cta_text: String(formData.get('ctaText') ?? '').trim() || 'Learn More',
        updated_at: new Date().toISOString(),
      })
      .eq('id', creativeId);
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  async function deleteCreativeAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const creativeId = String(formData.get('creativeId') ?? '');
    const { error } = await client.from('ad_creatives').delete().eq('id', creativeId);
    if (error) throw new Error(error.message);
    revalidatePath('/advertising');
  }

  const [
    { data: campaignsData, error: campaignsError },
    { data: advertisersData, error: advertisersError },
    { data: storesData },
    { data: categoriesData },
  ] = await Promise.all([
    supabase
      .from('ad_campaigns')
      .select(
        'id, advertiser_id, store_id, target_category_id, title, placement, budget, status, start_date, end_date, advertisers(company_name), stores(name), categories(name), ad_creatives(id, headline, body_text, image_url, target_url, cta_text)',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('advertisers')
      .select('id, company_name, contact_name, contact_email, contact_phone')
      .order('company_name'),
    supabase.from('stores').select('id, name').order('name'),
    supabase.from('categories').select('id, name').order('name'),
  ]);

  const campaigns = (campaignsData ?? []) as unknown as CampaignRow[];
  const advertisers = (advertisersData ?? []) as AdvertiserRow[];
  const stores = (storesData ?? []) as OptionRow[];
  const categories = (categoriesData ?? []) as OptionRow[];

  const campaignFields = (
    campaign?: CampaignRow,
  ) => (
    <>
      <input name="title" required defaultValue={campaign?.title ?? ''} placeholder="Campaign title" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      <select name="placement" defaultValue={campaign?.placement ?? 'home_inline'} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
        {placements.map((placement) => <option key={placement} value={placement}>{placement.replaceAll('_', ' ')}</option>)}
      </select>
      <select name="status" defaultValue={campaign?.status ?? 'draft'} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
        {campaignStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
      </select>
      <input name="budget" type="number" min="0" step="0.01" defaultValue={campaign?.budget ?? 0} placeholder="Budget (K)" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      <label className="text-xs text-slate-400">
        Starts
        <input name="startDate" type="datetime-local" required defaultValue={campaign ? toDateTimeLocal(campaign.start_date) : ''} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      </label>
      <label className="text-xs text-slate-400">
        Ends
        <input name="endDate" type="datetime-local" required defaultValue={campaign ? toDateTimeLocal(campaign.end_date) : ''} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      </label>
      <select name="advertiserId" defaultValue={campaign?.advertiser_id ?? ''} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
        <option value="">Platform / no advertiser</option>
        {advertisers.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}
      </select>
      <select name="storeId" defaultValue={campaign?.store_id ?? ''} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
        <option value="">No seller store</option>
        {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select name="categoryId" defaultValue={campaign?.target_category_id ?? ''} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
        <option value="">All categories</option>
        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Megaphone className="h-6 w-6 text-amber-400" />
            Advertising
          </h1>
          <p className="text-sm text-slate-400">
            Manage advertisers, campaigns, placements, schedules and creatives from one workspace.
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          CAPABILITY-PROTECTED
        </span>
      </div>

      {(campaignsError || advertisersError) && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {campaignsError?.message || advertisersError?.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <Building2 className="h-5 w-5 text-amber-400" />
          Advertisers
        </h2>
        <form action={createAdvertiserAction} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input name="companyName" required placeholder="Company" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="contactName" required placeholder="Contact name" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="contactEmail" type="email" required placeholder="Email" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input name="contactPhone" placeholder="Phone" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
          <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500">
            Add Advertiser
          </button>
        </form>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {advertisers.map((advertiser) => (
            <details key={advertiser.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                {advertiser.company_name}
                <span className="ml-2 text-xs font-normal text-slate-500">{advertiser.contact_email}</span>
              </summary>
              <form action={updateAdvertiserAction} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <input type="hidden" name="advertiserId" value={advertiser.id} />
                <input name="companyName" required defaultValue={advertiser.company_name} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                <input name="contactName" required defaultValue={advertiser.contact_name} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                <input name="contactEmail" type="email" required defaultValue={advertiser.contact_email} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                <input name="contactPhone" defaultValue={advertiser.contact_phone ?? ''} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                <button className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white md:col-span-2">Save advertiser</button>
              </form>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <Plus className="h-5 w-5 text-blue-400" />
          Create campaign
        </h2>
        <form action={createCampaignAction} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campaignFields()}
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 xl:col-span-3">
            Create Campaign
          </button>
        </form>
      </section>

      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-1 text-xs font-bold ${
                    campaign.status === 'active'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : campaign.status === 'scheduled'
                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}>
                    {campaign.status.toUpperCase()}
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-1 font-mono text-xs text-amber-300">
                    {campaign.placement}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-white">{campaign.title}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {campaign.advertisers?.company_name || campaign.stores?.name || 'Platform sponsor'}
                  {campaign.categories?.name ? ` · ${campaign.categories.name}` : ''}
                  {' · '}K{Number(campaign.budget ?? 0).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(campaign.start_date).toLocaleString()} → {new Date(campaign.end_date).toLocaleString()}
                </p>
              </div>
              <details>
                <summary className="cursor-pointer list-none rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-blue-300" title="Edit campaign">
                  <Pencil className="h-4 w-4" />
                </summary>
                <form action={updateCampaignAction} className="mt-2 grid w-full min-w-[320px] grid-cols-1 gap-2 rounded-xl border border-slate-700 bg-slate-950 p-4 lg:w-[560px] lg:grid-cols-2">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  {campaignFields(campaign)}
                  <button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white lg:col-span-2">Save campaign</button>
                </form>
              </details>
            </div>

            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <ImageIcon className="h-4 w-4 text-purple-400" />
                Creatives ({campaign.ad_creatives?.length ?? 0})
              </div>

              <form action={createCreativeAction} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                <input type="hidden" name="campaignId" value={campaign.id} />
                <input name="headline" required placeholder="Headline" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" />
                <input name="bodyText" placeholder="Body text" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" />
                <input name="imageUrl" required placeholder="Image URL" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" />
                <input name="targetUrl" required placeholder="Target URL / deep link" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" />
                <div className="flex gap-2">
                  <input name="ctaText" placeholder="CTA" defaultValue="Learn More" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" />
                  <button className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white">Add</button>
                </div>
              </form>

              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                {(campaign.ad_creatives ?? []).map((creative) => (
                  <details key={creative.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                      {creative.headline}
                      <span className="ml-2 text-xs font-normal text-slate-500">{creative.cta_text || 'Learn More'}</span>
                    </summary>
                    <form action={updateCreativeAction} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input type="hidden" name="creativeId" value={creative.id} />
                      <input name="headline" required defaultValue={creative.headline} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                      <input name="ctaText" defaultValue={creative.cta_text ?? 'Learn More'} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                      <input name="imageUrl" required defaultValue={creative.image_url} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white md:col-span-2" />
                      <input name="targetUrl" required defaultValue={creative.target_url} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white md:col-span-2" />
                      <textarea name="bodyText" defaultValue={creative.body_text ?? ''} className="min-h-20 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white md:col-span-2" />
                      <button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Save creative</button>
                    </form>
                    <form action={deleteCreativeAction} className="mt-2">
                      <input type="hidden" name="creativeId" value={creative.id} />
                      <button className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete creative
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </div>
          </article>
        ))}

        {campaigns.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-sm text-slate-500">
            No advertising campaigns found.
          </div>
        )}
      </div>
    </div>
  );
}
