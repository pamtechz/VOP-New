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

  // ── Parallel data fetching ──────────────────────────────────────────────────
  const [
    { count: totalUsers },
    { count: totalStores },
    { count: totalProducts },
    { count: totalOrders },
    { data: revenueData },
    { data: withdrawalData },
    { data: storageData },
    { count: activeAds },
    { count: shortLinks },
    { data: recentOrders },
    { data: topStores },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('total_amount').eq('payment_status', 'paid'),
    supabase.from('payouts').select('amount').eq('status', 'pending'),
    supabase.from('platform_settings').select('value').eq('key', 'storage_used_mb').single(),
    supabase.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('short_links').select('*', { count: 'exact', head: true }),
    supabase.from('orders')
      .select('id, public_ref, buyer_name, total_amount, payment_status, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('stores')
      .select('id, name, slug, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const totalRevenue = (revenueData ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0), 0
  );
  const pendingWithdrawals = (withdrawalData ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0), 0
  );

  const stats: DashboardStats = {
    totalUsers: totalUsers ?? 0,
    activeStores: totalStores ?? 0,
    totalProducts: totalProducts ?? 0,
    totalOrders: totalOrders ?? 0,
    totalRevenue,
    pendingWithdrawals,
    storageUsedMb: Number(storageData?.value ?? 0),
    storageCapacityMb: 1024, // Supabase Free Tier: 1 GB
    activeAds: activeAds ?? 0,
    shortLinksCreated: shortLinks ?? 0,
  };

  const orders: RecentOrder[] = (recentOrders ?? []).map((o: any) => ({
    id: o.id,
    public_ref: o.public_ref ?? o.id.slice(0, 8).toUpperCase(),
    buyer_name: o.buyer_name ?? 'Unknown',
    total_amount: Number(o.total_amount ?? 0),
    status: o.payment_status ?? 'pending',
    created_at: o.created_at,
  }));

  const stores: StoreSummary[] = (topStores ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    owner_name: s.owner_name ?? '—',
    plan: 'free',
    is_active: s.status === 'active',
    product_count: 0,
    created_at: s.created_at,
  }));

  return <DashboardClient stats={stats} recentOrders={orders} topStores={stores} />;
}
