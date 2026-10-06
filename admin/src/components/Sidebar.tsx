'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  CreditCard,
  Users,
  Megaphone,
  Link as LinkIcon,
  Activity,
  Settings,
  ShieldAlert,
  LogOut,
  Wallet,
  Tag,
  ChevronRight,
  Truck,
  Scale,
  Ticket,
  BarChart3,
  MessageSquare,
  ShieldCheck,
  Building2,
  Globe,
  LifeBuoy,
} from 'lucide-react';

const menuGroups = [
  {
    title: '1. COMMAND CENTER',
    items: [
      { label: 'Executive Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: '2. COMMERCE & ORDERS',
    items: [
      { label: 'Multi-Vendor Orders', href: '/orders', icon: ShoppingBag },
    ],
  },
  {
    title: '3. CATALOG & TAXONOMY',
    items: [
      { label: 'Products & Moderation', href: '/products', icon: ShoppingBag },
      { label: 'Category & Attribute Builder', href: '/categories', icon: Tag },
    ],
  },
  {
    title: '4. VENDOR GOVERNANCE',
    items: [
      { label: 'Sellers & Storefronts', href: '/stores', icon: Store },
      { label: 'Vendor Subscriptions', href: '/subscriptions', icon: CreditCard },
    ],
  },
  {
    title: '5. CUSTOMERS & RBAC',
    items: [
      { label: 'User Profiles & RBAC', href: '/users', icon: Users },
    ],
  },
  {
    title: '6. FULFILLMENT & LOGISTICS',
    items: [
      { label: 'Deliveries & Driver Fleet', href: '/deliveries', icon: Truck },
    ],
  },
  {
    title: '7. FINANCE & LEDGER',
    items: [
      { label: 'Payout Requests & Ledger', href: '/payouts', icon: Wallet },
    ],
  },
  {
    title: '8. TRUST & SAFETY',
    items: [
      { label: 'Disputes & Escrow', href: '/disputes', icon: Scale },
    ],
  },
  {
    title: '9. MARKETING & MERCHANDISING',
    items: [
      { label: 'Platform Coupons', href: '/promotions', icon: Ticket },
      { label: 'Ad Campaigns', href: '/advertising', icon: Megaphone },
      { label: 'Short Links', href: '/short-links', icon: LinkIcon },
    ],
  },
  {
    title: '10. SYSTEM & PLATFORM',
    items: [
      { label: 'Account Lifecycle', href: '/lifecycle', icon: ShieldAlert },
      { label: 'Usage & Capacity', href: '/usage', icon: Activity },
      { label: 'Settings & Controls', href: '/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="w-64 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-white tracking-wide">MARKETPLACE</p>
            <p className="text-[10px] text-slate-500 font-medium">Admin Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {menuGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[10px] font-semibold text-slate-600 tracking-widest px-2 mb-1.5">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                      active
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight className="w-3 h-3 text-blue-500" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-800 space-y-1">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
            <span>Free Tier</span>
            <span className="text-emerald-400 font-semibold">ACTIVE</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: '12%' }} />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">~120 MB / 1 GB used</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}
