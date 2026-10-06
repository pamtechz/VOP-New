import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  Briefcase,
  Calendar,
  Trash2,
  ShieldCheck,
  Pencil,
  Power,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ServiceListing {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string;
  provider_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  location: string | null;
  pay_rate: string | null;
  interview_date: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

const categories = [
  'cleaning',
  'maid_housekeeper',
  'caretaker_keeper',
  'general_job',
  'maintenance',
  'other',
];

export default async function ServicesAdminPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updateListingAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('id') ?? '');
    const category = String(formData.get('category') ?? '');
    if (!categories.includes(category)) throw new Error('Invalid service category.');

    const { error } = await client
      .from('service_listings')
      .update({
        title: String(formData.get('title') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim(),
        category,
        provider_name: String(formData.get('providerName') ?? '').trim() || null,
        contact_phone: String(formData.get('contactPhone') ?? '').trim() || null,
        contact_email: String(formData.get('contactEmail') ?? '').trim() || null,
        location: String(formData.get('location') ?? '').trim() || null,
        pay_rate: String(formData.get('payRate') ?? '').trim() || null,
        interview_date: String(formData.get('interviewDate') ?? ''),
        expires_at: String(formData.get('expiresAt') ?? ''),
        is_active: formData.get('isActive') === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/services');
  }

  async function toggleListingAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('id') ?? '');
    const nextActive = formData.get('nextActive') === 'true';
    const { error } = await client
      .from('service_listings')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/services');
  }

  async function deactivateExpiredAction() {
    'use server';
    const client = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await client
      .from('service_listings')
      .update({ is_active: false, updated_at: now })
      .or(`interview_date.lt.${now},expires_at.lt.${now}`);
    if (error) throw new Error(error.message);
    revalidatePath('/services');
  }

  async function deleteListingAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('id') ?? '');
    const { error } = await client.from('service_listings').delete().eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/services');
  }

  const { data, error } = await supabase
    .from('service_listings')
    .select('*')
    .order('created_at', { ascending: false });

  const listings = (data ?? []) as ServiceListing[];
  const nowMs = Date.now();
  const activeCount = listings.filter(
    (listing) =>
      listing.is_active &&
      new Date(listing.interview_date).getTime() >= nowMs &&
      new Date(listing.expires_at).getTime() >= nowMs,
  ).length;
  const expiredCount = listings.filter(
    (listing) =>
      new Date(listing.interview_date).getTime() < nowMs ||
      new Date(listing.expires_at).getTime() < nowMs,
  ).length;

  const localDateTime = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Briefcase className="h-6 w-6 text-indigo-400" />
            Services & Job Advertisements
          </h1>
          <p className="text-sm text-slate-400">
            Edit, deactivate or remove marketplace service and recruitment listings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={deactivateExpiredAction}>
            <button className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
              Deactivate expired
            </button>
          </form>
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            OWNER + ADMIN RLS
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-500">Total listings</div>
          <div className="mt-1 text-2xl font-bold text-white">{listings.length}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-500">Currently active</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-500">Expired</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{expiredCount}</div>
        </div>
      </div>

      <div className="space-y-4">
        {listings.map((listing) => (
          <article key={listing.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-indigo-500/10 px-2 py-1 text-xs font-bold text-indigo-400">
                    {listing.category.replaceAll('_', ' ').toUpperCase()}
                  </span>
                  <span className={`rounded px-2 py-1 text-xs font-bold ${
                    listing.is_active
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {listing.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white">{listing.title}</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">{listing.description}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span><Calendar className="mr-1 inline h-3.5 w-3.5" />Interview {new Date(listing.interview_date).toLocaleString()}</span>
                  {listing.location && <span>{listing.location}</span>}
                  {listing.pay_rate && <span>{listing.pay_rate}</span>}
                  {listing.contact_phone && <a href={`tel:${listing.contact_phone}`} className="text-blue-400 hover:text-blue-300">{listing.contact_phone}</a>}
                </div>
              </div>

              <div className="flex gap-2">
                <form action={toggleListingAction}>
                  <input type="hidden" name="id" value={listing.id} />
                  <input type="hidden" name="nextActive" value={String(!listing.is_active)} />
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" title={listing.is_active ? 'Deactivate' : 'Activate'}>
                    <Power className="h-4 w-4" />
                  </button>
                </form>
                <form action={deleteListingAction}>
                  <input type="hidden" name="id" value={listing.id} />
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400" title="Delete listing">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>

            <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-200">
                <Pencil className="h-4 w-4" />
                Edit listing
              </summary>
              <form action={updateListingAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={listing.id} />
                <input name="title" required defaultValue={listing.title} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <select name="category" defaultValue={listing.category} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
                  {categories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}
                </select>
                <textarea name="description" required defaultValue={listing.description} className="min-h-28 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white md:col-span-2" />
                <input name="providerName" defaultValue={listing.provider_name ?? ''} placeholder="Provider / employer" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="contactPhone" defaultValue={listing.contact_phone ?? ''} placeholder="Phone" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="contactEmail" defaultValue={listing.contact_email ?? ''} placeholder="Email" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="location" defaultValue={listing.location ?? ''} placeholder="Location" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="payRate" defaultValue={listing.pay_rate ?? ''} placeholder="Pay rate" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="interviewDate" type="datetime-local" required defaultValue={localDateTime(listing.interview_date)} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <input name="expiresAt" type="datetime-local" required defaultValue={localDateTime(listing.expires_at)} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input name="isActive" type="checkbox" defaultChecked={listing.is_active} />
                  Active
                </label>
                <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500">
                  Save changes
                </button>
              </form>
            </details>
          </article>
        ))}

        {listings.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-slate-500">
            No service listings found.
          </div>
        )}
      </div>
    </div>
  );
}
