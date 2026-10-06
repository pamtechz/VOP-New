import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Activity, Database, Users, Store, ShoppingBag, CreditCard, ShieldCheck, Image as ImageIcon, MessageSquare, Layers } from 'lucide-react';

export default async function AdminUsagePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { count: usersCount },
    { count: storesCount },
    { count: productsCount },
    { count: ordersCount },
    { count: imagesCount },
    { count: messagesCount },
    { count: ledgerCount },
    { data: settingsData }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('product_images').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('wallet_ledger').select('*', { count: 'exact', head: true }),
    supabase.from('platform_settings').select('*')
  ]);

  const settingsMap = new Map((settingsData ?? []).map((s) => [s.key, s.value]));
  const resourceMode = settingsMap.get('resource_mode') || 'constrained';

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            System Health & Capacity Monitor
          </h1>
          <p className="text-slate-400 text-sm">
            Live database entities and planning allocations for 50,000-user capacity.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          ACTIVE ({resourceMode.toString().toUpperCase()})
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Registered Users</p>
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{usersCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Total buyer & seller accounts</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Active Stores</p>
            <Store className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{storesCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Multi-tenant stores online</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Published Products</p>
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{productsCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Items catalogued in PostgreSQL</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Total Orders</p>
            <CreditCard className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{ordersCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Orders processed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Measured Database Row Allocations
          </h2>
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                Linked Cloud Images
              </span>
              <span className="font-bold text-white font-mono">{imagesCount ?? 0} references</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                Store Messages
              </span>
              <span className="font-bold text-white font-mono">{messagesCount ?? 0} messages</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <Layers className="w-4 h-4 text-purple-400" />
                Audited Financial Ledger Entries
              </span>
              <span className="font-bold text-white font-mono">{ledgerCount ?? 0} records</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white">Configured Planning Thresholds</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Thresholds target approximately 50,000 registered users while operating safely within standard resource parameters.
          </p>
          <ul className="text-xs text-slate-300 space-y-2.5 pt-1">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0"></span>
              <span><strong>User-Owned Media Hosting:</strong> Cloudinary / Google Drive prevents platform disk saturation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0"></span>
              <span><strong>Account Lifecycle Engine:</strong> Strict 2-month inactivity policy with automated T-14 to T-0 email notices.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0"></span>
              <span><strong>Selective Realtime:</strong> Ephemeral channels open only while active conversation is in foreground.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
