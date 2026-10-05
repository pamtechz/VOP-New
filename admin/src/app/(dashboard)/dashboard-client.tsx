'use client';

import { useState } from 'react';
import type { DashboardStats, RecentOrder, StoreSummary } from './page';
import {
  Users, Store, Package, ShoppingCart, DollarSign,
  HardDrive, Megaphone, Link2, TrendingUp,
  CheckCircle2, XCircle, ArrowUpRight, RefreshCw,
} from 'lucide-react';

const CURRENCY_CODE = 'ZMW';
const CURRENCY_SYMBOL = 'K';

function fmt(n: number) {
  return `${CURRENCY_SYMBOL} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    refunded: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${map[status] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>
      {status.toUpperCase()}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  change?: string;
}

function StatCard({ label, value, icon: Icon, gradient, iconBg, change }: StatCardProps) {
  return (
    <div className={`relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all group`}>
      {/* Subtle gradient glow */}
      <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-10 blur-2xl ${gradient}`} />
      <div className="relative">
        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-sm text-slate-400 mt-0.5">{label}</p>
        {change && (
          <div className="flex items-center gap-1 mt-2">
            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-emerald-400">{change}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  stats: DashboardStats;
  recentOrders: RecentOrder[];
  topStores: StoreSummary[];
}

export default function DashboardClient({ stats, recentOrders, topStores }: Props) {
  const [refreshing] = useState(false);

  const storagePercent = stats.storageCapacityMb > 0
    ? Math.min(100, (stats.storageUsedMb / stats.storageCapacityMb) * 100)
    : 0;

  const statCards: StatCardProps[] = [
    {
      label: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      gradient: 'bg-blue-500',
      iconBg: 'bg-blue-500/15 text-blue-400',
    },
    {
      label: 'Active Stores',
      value: stats.activeStores.toLocaleString(),
      icon: Store,
      gradient: 'bg-violet-500',
      iconBg: 'bg-violet-500/15 text-violet-400',
    },
    {
      label: 'Listed Products',
      value: stats.totalProducts.toLocaleString(),
      icon: Package,
      gradient: 'bg-cyan-500',
      iconBg: 'bg-cyan-500/15 text-cyan-400',
    },
    {
      label: 'Total Orders',
      value: stats.totalOrders.toLocaleString(),
      icon: ShoppingCart,
      gradient: 'bg-indigo-500',
      iconBg: 'bg-indigo-500/15 text-indigo-400',
    },
    {
      label: 'Total Revenue',
      value: fmt(stats.totalRevenue),
      icon: DollarSign,
      gradient: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/15 text-emerald-400',
    },
    {
      label: 'Pending Payouts',
      value: fmt(stats.pendingWithdrawals),
      icon: TrendingUp,
      gradient: 'bg-amber-500',
      iconBg: 'bg-amber-500/15 text-amber-400',
    },
    {
      label: 'Active Ad Campaigns',
      value: stats.activeAds.toLocaleString(),
      icon: Megaphone,
      gradient: 'bg-rose-500',
      iconBg: 'bg-rose-500/15 text-rose-400',
    },
    {
      label: 'Short Links Created',
      value: stats.shortLinksCreated.toLocaleString(),
      icon: Link2,
      gradient: 'bg-slate-400',
      iconBg: 'bg-slate-500/15 text-slate-400',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Page Header */}
      <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Platform overview · Live data</p>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all border border-slate-700"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="px-8 py-8 space-y-8 max-w-screen-xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        {/* Storage Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Storage Usage</p>
                <p className="text-[11px] text-slate-500">Supabase Free Tier · 1 GB limit</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${storagePercent > 80 ? 'text-rose-400' : 'text-slate-200'}`}>
                {stats.storageUsedMb.toFixed(1)} MB
              </p>
              <p className="text-[11px] text-slate-500">of {stats.storageCapacityMb} MB</p>
            </div>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                storagePercent > 80 ? 'bg-gradient-to-r from-rose-600 to-rose-400' :
                storagePercent > 60 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                'bg-gradient-to-r from-emerald-600 to-emerald-400'
              }`}
              style={{ width: `${storagePercent || 1}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[11px] text-slate-600">{storagePercent.toFixed(1)}% used</p>
            <p className="text-[11px] text-slate-600">{(stats.storageCapacityMb - stats.storageUsedMb).toFixed(0)} MB free</p>
          </div>
        </div>

        {/* Two-column tables */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-indigo-400" />
                <h2 className="font-semibold text-sm text-white">Recent Orders</h2>
              </div>
              <a href="/orders" className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 transition-colors">
                View all <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-slate-800">
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                  <ShoppingCart className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No orders yet</p>
                </div>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-800/50 transition-colors">
                    <div>
                      <p className="font-mono text-xs text-blue-400 font-semibold">#{order.public_ref}</p>
                      <p className="text-sm text-slate-300 mt-0.5">{order.buyer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{fmt(order.total_amount)}</p>
                      <div className="flex items-center gap-2 justify-end mt-1">
                        <StatusBadge status={order.status} />
                        <span className="text-[11px] text-slate-600">{timeAgo(order.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Newest Stores */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-violet-400" />
                <h2 className="font-semibold text-sm text-white">Newest Stores</h2>
              </div>
              <a href="/stores" className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 transition-colors">
                View all <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-slate-800">
              {topStores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                  <Store className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No stores yet</p>
                </div>
              ) : (
                topStores.map((store) => (
                  <div key={store.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-slate-300">{store.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{store.name}</p>
                        <p className="text-[11px] text-slate-500">/{store.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md font-mono capitalize">
                        {store.plan}
                      </span>
                      {store.is_active
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <XCircle className="w-4 h-4 text-rose-400" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
