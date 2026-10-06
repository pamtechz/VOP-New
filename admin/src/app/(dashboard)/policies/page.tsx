import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ShieldCheck, FileText, Save, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PolicyRow {
  id: string;
  key: string;
  title: string;
  content: string;
  updated_at: string;
}

export default async function AdminPoliciesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updatePolicyAction(formData: FormData) {
    'use server';
    const policyKey = formData.get('policyKey') as string;
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const client = await createServerSupabaseClient();

    await client
      .from('platform_settings')
      .upsert({
        key: `policy_${policyKey}`,
        value: { title, content, updated_at: new Date().toISOString() },
      }, { onConflict: 'key' });

    revalidatePath('/policies');
  }

  const { data: settingsData } = await supabase
    .from('platform_settings')
    .select('key, value')
    .like('key', 'policy_%');

  const defaultPolicies = [
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-400" />
            Platform Policies & Safety Terms Manager
          </h1>
          <p className="text-slate-400 text-sm">
            Modify live platform terms, delivery rules, anti-robbery consent policies, and buyer protection guidelines.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          GOVERNANCE ACTIVE
        </span>
      </div>

      <div className="space-y-6">
        {defaultPolicies.map((p) => {
          const loaded = loadedMap.get(p.key);
          const currentTitle = loaded?.title ?? p.title;
          const currentContent = loaded?.content ?? p.content;

          return (
            <div key={p.key} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
                  POLICY KEY: {p.key}
                </span>
                <span className="text-xs text-slate-500">Modifiable Admin Policy</span>
              </div>

              <form action={updatePolicyAction} className="space-y-4">
                <input type="hidden" name="policyKey" value={p.key} />
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Policy Header Title</label>
                  <input
                    type="text"
                    name="title"
                    defaultValue={currentTitle}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Policy Content & Terms Text</label>
                  <textarea
                    name="content"
                    rows={4}
                    defaultValue={currentContent}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Save className="w-4 h-4" /> Save Policy Terms
                  </button>
                </div>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
