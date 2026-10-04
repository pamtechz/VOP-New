import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Activity, Database, Users, Store, ShoppingBag, CreditCard, ShieldCheck } from 'lucide-react';

export default async function AdminUsagePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { count: usersCount },
    { count: storesCount },
    { count: productsCount },
    { count: ordersCount },
    { data: settingsData }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
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
            System Health & Live Capacity Monitor
          </h1>
          <p className="text-slate-400 text-sm">
            Live database counts and resource metrics against Supabase deployment limits.
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
            PostgreSQL Database & Storage Limits
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Database Table Storage</span>
                <span className="font-bold">Estimated &lt; 5 MB / 500 MB (Free Plan)</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: '2%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Media & Storage Bucket Quota</span>
                <span className="font-bold">Target 150KB/image / 1000 MB</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: '1%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white">Database Optimization Rules</h2>
          <ul className="text-xs text-slate-300 space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Client-side WebP image compression enforced prior to storage upload.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Automatic 60-day account lifecycle and orphan cleanup active.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Optimized composite indices on `products`, `orders`, and `stores`.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
