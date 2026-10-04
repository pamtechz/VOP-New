import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Link as LinkIcon, Copy } from 'lucide-react';

interface ShortLinkRow {
  id: string;
  code: string;
  destination_type: string;
  external_url: string | null;
  is_active: boolean;
  validation_status: string | null;
  created_at: string;
}

const validationBadge = (status: string | null) => {
  switch (status) {
    case 'safe': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'blocked': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }
};

export default async function AdminShortLinksPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: linksData, error } = await supabase
    .from('short_links')
    .select('id, code, destination_type, external_url, is_active, validation_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const links: ShortLinkRow[] = (linksData ?? []) as ShortLinkRow[];

  // Get short_link_domain from platform_settings
  const { data: domainSetting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'short_link_domain')
    .single();

  const domain = domainSetting?.value
    ? String(domainSetting.value).replace(/^"|"$/g, '')
    : '';

  const shortUrl = (code: string) =>
    domain ? `https://${domain}/s/${code}` : `/s/${code}`;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <LinkIcon className="w-6 h-6 text-blue-400" />
          Short Links
        </h1>
        <p className="text-slate-400 text-sm">
          {links.length} short link{links.length !== 1 ? 's' : ''} · Base62 encoded · Domain: {domain || 'relative (/s/...)'}
        </p>
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
              <th className="p-4">Code</th>
              <th className="p-4">Type</th>
              <th className="p-4">Short URL</th>
              <th className="p-4">Target URL</th>
              <th className="p-4">Validation</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {links.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No short links created yet.
                </td>
              </tr>
            ) : (
              links.map((link) => (
                <tr key={link.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-blue-400">{link.code}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs">
                      {link.destination_type}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                      <span className="truncate max-w-[140px]">{shortUrl(link.code)}</span>
                      <button
                        className="text-slate-500 hover:text-slate-300 shrink-0"
                        title="Copy URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="p-4 text-xs text-slate-400 max-w-[160px] truncate">
                    {link.external_url ?? '—'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-xs font-semibold border rounded ${validationBadge(link.validation_status)}`}>
                      {(link.validation_status ?? 'pending').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {new Date(link.created_at).toLocaleDateString()}
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
