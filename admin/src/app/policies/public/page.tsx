import React from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ShieldCheck, FileText, Globe, Store, Lock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PublicPoliciesPage() {
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

  const { data: settingsData } = await supabase
    .from('platform_settings')
    .select('key, value')
    .like('key', 'policy_%');

  const defaultPolicies = [
    {
      key: 'about_us',
      title: 'About Pamtechz Marketplace & Platform Mission',
      content: 'Pamtechz Marketplace is an enterprise-grade multi-vendor platform empowering local merchants, buyers, and independent couriers. Our mission is to connect local commerce with verified escrow safety, multi-modal delivery networks, and transparent merchant tools.',
    },
    {
      key: 'terms_of_service',
      title: 'Terms of Service & User Conduct',
      content: 'By accessing or operating a store on Pamtechz Marketplace, users agree to uphold fair trading standards, accurate product representations, prompt fulfillment, and respectful communication. Prohibited items, fraudulent listings, or unauthorized access will result in immediate account suspension.',
    },
    {
      key: 'privacy_policy',
      title: 'Privacy Policy & Data Security Guarantee',
      content: 'We respect user data privacy. Personal information, order histories, and payment credentials are encrypted using industry-standard protocols. Location data collected for delivery routing is strictly used for order fulfillment and anti-robbery emergency SOS safety.',
    },
    {
      key: 'delivery_logistics',
      title: 'Local Delivery & Multi-Modal Logistics Policy',
      content: 'Local fulfillment supports Bicycles (eco short-haul), Motorbikes (express), Vehicles & Vans (cargo), Heavy Freight Trucks, and Verified Delivery Companies. Handshake PINs (4-digit pickup PIN & 4-digit buyer delivery OTP) are required for all dispatches.',
    },
    {
      key: 'driver_consent_safety',
      title: 'Courier Live Tracking Consent & Anti-Robbery SOS Policy',
      content: 'Couriers explicitly consent to continuous GPS tracking while on active duty. Drivers have access to an instant Anti-Robbery Panic/SOS button that immediately alerts platform security and logs high-risk location coordinates.',
    },
    {
      key: 'return_refund',
      title: 'Return & Refund Policy',
      content: 'Buyers may initiate return requests within 7 days of delivery for items that are damaged or not as described. Funds remain in escrow until return inspection or admin dispute resolution.',
    },
    {
      key: 'buyer_protection',
      title: 'Buyer Protection & Escrow Guarantee Policy',
      content: 'All marketplace payments are held securely in platform escrow. Merchant payouts are released only upon successful buyer OTP verification or automated expiration of the dispute window.',
    },
    {
      key: 'seller_standards',
      title: 'Seller Performance Standards & Compliance Policy',
      content: 'Merchants are evaluated on order defect rate, late shipment rate, and cancellation rate. Policy violations result in warnings, temporary payout holds, or permanent store suspension.',
    },
  ];

  const loadedMap = new Map<string, { title: string; content: string }>();
  (settingsData ?? []).forEach((row: any) => {
    const k = row.key.replace('policy_', '');
    if (row.value && typeof row.value === 'object') {
      loadedMap.set(k, row.value);
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Pamtechz Marketplace</h1>
            <p className="text-xs text-slate-400">Official Platform Governance, Terms & Privacy Statement</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
          <Globe className="w-4 h-4" />
          PUBLIC VERIFIED GOVERNANCE
        </div>
      </header>

      <main className="space-y-6">
        {defaultPolicies.map((p) => {
          const loaded = loadedMap.get(p.key);
          const currentTitle = loaded?.title ?? p.title;
          const currentContent = loaded?.content ?? p.content;

          return (
            <section key={p.key} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                {currentTitle}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed font-sans">
                {currentContent}
              </p>
            </section>
          );
        })}
      </main>

      <footer className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Lock className="w-3.5 h-3.5 text-slate-400" />
        <span>Pamtechz Marketplace &copy; 2026. All rights reserved. Encrypted & Protected.</span>
      </footer>
    </div>
  );
}
