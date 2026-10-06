import React from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Briefcase, Calendar, Trash2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function ServicesAdminPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  // Trigger automated purge on page render
  await supabase.rpc('purge_expired_service_listings');

  // Fetch active service listings
  const { data: listings } = await supabase
    .from('service_listings')
    .select('*')
    .order('created_at', { ascending: false });

  const activeCount = listings?.filter((l) => new Date(l.interview_date) >= new Date()).length || 0;
  const expiredCount = listings?.filter((l) => new Date(l.interview_date) < new Date()).length || 0;

  async function purgeExpiredAction() {
    'use server';
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    await supabase.rpc('purge_expired_service_listings');
    revalidatePath('/services');
  }

  async function deleteListingAction(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    await supabase.from('service_listings').delete().eq('id', id);
    revalidatePath('/services');
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-400" />
            Services & Job Advertisements
          </h1>
          <p className="text-sm text-slate-400">
            Manage cleaning services, maids/housekeepers, caretakers, and job openings with interview date auto-expiry.
          </p>
        </div>

        <form action={purgeExpiredAction}>
          <button
            type="submit"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            Purge Expired Advertisements
          </button>
        </form>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active Services & Jobs</p>
          <p className="text-2xl font-bold text-white mt-1">{activeCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Interview Scheduled</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{activeCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Auto-Purged / Expired</p>
          <p className="text-2xl font-bold text-rose-400 mt-1">{expiredCount}</p>
        </div>
      </div>

      {/* Table of Listings */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Live Service Ads & Recruitment Posts</h2>
          <span className="text-xs text-slate-400">Auto-deletes when interview date elapses</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="p-4">Listing / Title</th>
                <th className="p-4">Category</th>
                <th className="p-4">Interview Date</th>
                <th className="p-4">Pay & Location</th>
                <th className="p-4">Employer / Contact</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {(!listings || listings.length === 0) ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No service ads or job listings currently posted.
                  </td>
                </tr>
              ) : (
                listings.map((item) => {
                  const isExpired = new Date(item.interview_date) < new Date();
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-medium text-white max-w-xs">
                        <div>{item.title}</div>
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{item.description}</div>
                      </td>
                      <td className="p-4">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {item.category.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <Calendar className={`w-3.5 h-3.5 ${isExpired ? 'text-rose-400' : 'text-amber-400'}`} />
                          <span className={isExpired ? 'text-rose-400 line-through' : 'text-amber-300'}>
                            {new Date(item.interview_date).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-mono">
                        <div className="text-emerald-400 font-bold">{item.pay_rate || 'N/A'}</div>
                        <div className="text-slate-400">{item.location || 'Remote / Unspecified'}</div>
                      </td>
                      <td className="p-4 text-xs">
                        <div className="text-slate-200 font-medium">{item.provider_name || 'Anonymous'}</div>
                        <div className="text-slate-400 font-mono">{item.contact_phone || item.contact_email || 'No Direct Contact'}</div>
                      </td>
                      <td className="p-4 text-right">
                        <form action={deleteListingAction} className="inline-block">
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                            title="Delete Advertisement"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
