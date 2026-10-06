import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import DashboardClient from './dashboard-client';

// Types matching the DB schema
export interface DashboardStats {
  totalUsers: number;
  activeStores: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingWithdrawals: number;
  storageUsedMb: number;
  storageCapacityMb: number;
  activeAds: number;
  shortLinksCreated: number;
}

export interface RecentOrder {
  id: string;
  public_ref: string;
  buyer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  plan: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ── Parallel data fetching with server-side aggregation ───────────────────────
  const [
    metricsRes,
    { data: recentOrders },
    { data: topStores },
  ] = await Promise.all([
    supabase.rpc('get_admin_dashboard_metrics'),
    supabase.from('orders')
      .select('id, public_ref, buyer_name, total_amount, payment_status, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('admin_store_summaries')
      .select('id, name, slug, status, created_at, product_count, plan_name')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const metrics = (metricsRes.data ?? {}) as Record<string, any>;

  const stats: DashboardStats = {
    totalUsers: metrics.total_users ?? 0,
    activeStores: metrics.active_stores ?? 0,
    totalProducts: metrics.total_products ?? 0,
    totalOrders: metrics.total_orders ?? 0,
    totalRevenue: Number(metrics.total_revenue ?? 0),
    pendingWithdrawals: Number(metrics.pending_withdrawals ?? 0),
    storageUsedMb: 0, // External cloud images (zero host storage)
    storageCapacityMb: 1024, // Supabase Free Tier: 1 GB plan limit
    activeAds: metrics.active_ads ?? 0,
    shortLinksCreated: metrics.short_links_created ?? 0,
  };

  const orders: RecentOrder[] = (recentOrders ?? []).map((o: any) => ({
    id: o.id,
    public_ref: o.public_ref ?? o.id.slice(0, 8).toUpperCase(),
    buyer_name: o.buyer_name ?? 'Buyer',
    total_amount: Number(o.total_amount ?? 0),
    status: o.payment_status ?? 'pending',
    created_at: o.created_at,
  }));

  const stores: StoreSummary[] = (topStores ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    owner_name: 'Store Owner',
    plan: s.plan_name ?? 'Free Plan',
    is_active: s.status === 'active',
    product_count: Number(s.product_count ?? 0),
    created_at: s.created_at,
  }));

  return <DashboardClient stats={stats} recentOrders={orders} topStores={stores} />;
}
