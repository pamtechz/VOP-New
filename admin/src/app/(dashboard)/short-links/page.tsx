import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Link as LinkIcon, Pencil, Power, ShieldCheck } from 'lucide-react';

interface ShortLinkRow {
  id: string;
  code: string;
  destination_type: string;
  external_url: string | null;
  expires_at: string | null;
  is_active: boolean;
  validation_status: 'pending' | 'safe' | 'blocked' | null;
  created_at: string;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validationBadge(status: string | null) {
  switch (status) {
    case 'safe':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'blocked':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }
}

export default async function AdminShortLinksPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updateShortLinkAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('linkId') ?? '');
    const destinationType = String(formData.get('destinationType') ?? '');
    const validationStatus = String(formData.get('validationStatus') ?? 'pending');
    const expiresRaw = String(formData.get('expiresAt') ?? '').trim();

    if (!id) throw new Error('Short-link ID is required.');
    if (!['pending', 'safe', 'blocked'].includes(validationStatus)) {
      throw new Error('Invalid validation status.');
    }

    const payload: Record<string, string | boolean | null> = {
      is_active: formData.get('isActive') === 'on',
      validation_status: validationStatus,
      expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (destinationType === 'external') {
      const externalUrl = String(formData.get('externalUrl') ?? '').trim();
      if (!externalUrl) throw new Error('External links require a destination URL.');
      payload.external_url = externalUrl;
    }

    const { error } = await client.from('short_links').update(payload).eq('id', id);
    if (error) throw new Error(error.message);

    revalidatePath('/short-links');
  }

  async function toggleShortLinkAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const id = String(formData.get('linkId') ?? '');
    const nextActive = formData.get('nextActive') === 'true';

    const { error } = await client
      .from('short_links')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);

    revalidatePath('/short-links');
  }

  const [{ data: linksData, error }, { data: domainSetting }] = await Promise.all([
    supabase
      .from('short_links')
      .select('id, code, destination_type, external_url, expires_at, is_active, validation_status, created_at')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'short_link_domain')
      .maybeSingle(),
  ]);

  const links = (linksData ?? []) as ShortLinkRow[];
  const domain = domainSetting?.value
    ? String(domainSetting.value).replace(/^"|"$/g, '')
    : '';
  const shortUrl = (code: string) =>
    domain ? `https://${domain}/s/${code}` : `/s/${code}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <LinkIcon className="h-6 w-6 text-blue-400" />
            Short Links
          </h1>
          <p className="text-sm text-slate-400">
            {links.length} link{links.length !== 1 ? 's' : ''} · Domain: {domain || 'relative /s/...'}
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          SAFE DEACTIVATION
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error.message}
        </div>
      )}

      <div className="space-y-3">
        {links.map((link) => (
          <article key={link.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-blue-400">{link.code}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {link.destination_type}
                  </span>
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${validationBadge(link.validation_status)}`}>
                    {(link.validation_status ?? 'pending').toUpperCase()}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    link.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {link.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div className="mt-2 break-all font-mono text-xs text-slate-300">{shortUrl(link.code)}</div>
                {link.external_url && (
                  <div className="mt-1 break-all text-xs text-slate-500">→ {link.external_url}</div>
                )}
                <div className="mt-1 text-xs text-slate-600">
                  Created {new Date(link.created_at).toLocaleString()}
                  {link.expires_at ? ` · Expires ${new Date(link.expires_at).toLocaleString()}` : ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <form action={toggleShortLinkAction}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="nextActive" value={String(!link.is_active)} />
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" title={link.is_active ? 'Deactivate' : 'Activate'}>
                    <Power className="h-4 w-4" />
                  </button>
                </form>
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-blue-300" title="Edit link controls">
                    <Pencil className="h-4 w-4" />
                  </summary>
                  <form action={updateShortLinkAction} className="absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="destinationType" value={link.destination_type} />
                    {link.destination_type === 'external' && (
                      <input name="externalUrl" required defaultValue={link.external_url ?? ''} placeholder="Destination URL" className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                    )}
                    <select name="validationStatus" defaultValue={link.validation_status ?? 'pending'} className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white">
                      <option value="pending">Pending validation</option>
                      <option value="safe">Safe</option>
                      <option value="blocked">Blocked</option>
                    </select>
                    <label className="block text-xs text-slate-400">
                      Expires
                      <input name="expiresAt" type="datetime-local" defaultValue={toDateTimeLocal(link.expires_at)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input name="isActive" type="checkbox" defaultChecked={link.is_active} />
                      Active
                    </label>
                    <button className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">
                      Save controls
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </article>
        ))}

        {links.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-sm text-slate-500">
            No short links have been created yet.
          </div>
        )}
      </div>
    </div>
  );
}
