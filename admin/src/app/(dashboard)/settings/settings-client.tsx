'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  Settings,
  ShieldCheck,
  DollarSign,
  Image as ImageIcon,
  Layers,
  Clock,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  Link2
} from 'lucide-react';

interface SettingRow {
  key: string;
  value: any;
  description: string;
  updated_at: string;
}

interface PlanRow {
  id: string;
  name: string;
  code: string;
  price_monthly: number;
  max_products: number;
  max_images_per_product: number;
  featured_badge: boolean;
  is_active: boolean;
}

export function SettingsClient({
  initialSettings,
  initialPlans,
}: {
  initialSettings: SettingRow[];
  initialPlans: PlanRow[];
}) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'financial' | 'media' | 'plans' | 'lifecycle' | 'system'>('financial');
  const [settings, setSettings] = useState<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    initialSettings.forEach((s) => {
      map[s.key] = s.value;
    });
    return map;
  });

  const [plans, setPlans] = useState<PlanRow[]>(initialPlans);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Drive link test helper
  const [driveInput, setDriveInput] = useState('');
  const [driveConverted, setDriveConverted] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleUpdateSetting = async (key: string, value: any, description?: string) => {
    setSavingKey(key);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          key,
          value,
          description: description || 'Configured via Admin Settings Console',
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setSettings((prev) => ({ ...prev, [key]: value }));
      showToast(`Setting "${key}" updated successfully!`);
    } catch (err: any) {
      showToast(`Failed to update setting: ${err.message}`, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleUpdatePlan = async (plan: PlanRow) => {
    setSavingKey(`plan-${plan.id}`);
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({
          name: plan.name,
          price_monthly: plan.price_monthly,
          max_products: plan.max_products,
          max_images_per_product: plan.max_images_per_product,
          featured_badge: plan.featured_badge,
          is_active: plan.is_active,
        })
        .eq('id', plan.id);

      if (error) throw error;
      showToast(`Plan "${plan.name}" updated successfully!`);
    } catch (err: any) {
      showToast(`Failed to update plan: ${err.message}`, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const convertDriveLink = (raw: string) => {
    const trimmed = raw.trim();
    setDriveInput(trimmed);
    const driveFileMatch = RegExp(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/).exec(trimmed);
    if (driveFileMatch && driveFileMatch[1]) {
      setDriveConverted(`https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`);
      return;
    }
    const driveIdMatch = RegExp(/drive\.google\.com\/(?:open|uc)\?.*id=([a-zA-Z0-9_-]+)/).exec(trimmed);
    if (driveIdMatch && driveIdMatch[1]) {
      setDriveConverted(`https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`);
      return;
    }
    setDriveConverted(trimmed);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-blue-400" />
            Platform & Admin Settings
          </h1>
          <p className="text-slate-400 text-sm">
            Live marketplace configuration, external cloud media rules, and subscription tier controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            FULL ADMIN PRIVILEGES
          </span>
          <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            UNRESTRICTED QUOTAS
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('financial')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'financial'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Financial & Rates
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'media'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          External Media (Cloudinary / Drive)
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'plans'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          Subscription Plans & Admin Bypass
        </button>
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'lifecycle'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          Retention & 60-Day Policy
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'system'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Lock className="w-4 h-4" />
          System & Maintenance
        </button>
      </div>

      {/* Tab 1: Financial & Rates */}
      {activeTab === 'financial' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Marketplace Commission
            </h3>
            <p className="text-xs text-slate-400">
              Percentage deducted automatically from merchant sub-orders upon checkout settlement.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Commission Rate (%)</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  step="0.1"
                  value={settings['marketplace_commission_percent'] ?? 5.0}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketplace_commission_percent: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() =>
                    handleUpdateSetting(
                      'marketplace_commission_percent',
                      settings['marketplace_commission_percent']
                    )
                  }
                  disabled={savingKey === 'marketplace_commission_percent'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-400" />
              Seller Payout Minimum
            </h3>
            <p className="text-xs text-slate-400">
              Minimum available wallet balance required for sellers to submit payout withdrawal requests.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Minimum Payout (ZMW)</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  step="10"
                  value={settings['minimum_payout_amount'] ?? 100.0}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      minimum_payout_amount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() =>
                    handleUpdateSetting(
                      'minimum_payout_amount',
                      settings['minimum_payout_amount']
                    )
                  }
                  disabled={savingKey === 'minimum_payout_amount'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: External Media & Images (Cloudinary / Google Drive) */}
      {activeTab === 'media' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-blue-400" />
                  External Cloud Image Hosting (Cloudinary & Google Drive)
                </h3>
                <p className="text-xs text-slate-400">
                  Instead of storing bulky raw files locally, merchants link images directly from Cloudinary (console.cloudinary.com) or Google Drive.
                </p>
              </div>
              <a
                href="https://console.cloudinary.com/app/"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Cloudinary Console
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Cloudinary Cloud Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings['cloudinary_cloud_name'] ?? 'ubuy-store'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        cloudinary_cloud_name: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() =>
                      handleUpdateSetting('cloudinary_cloud_name', settings['cloudinary_cloud_name'])
                    }
                    disabled={savingKey === 'cloudinary_cloud_name'}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shrink-0"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Whitelisted CDN & Image Hosts</label>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-400">
                  res.cloudinary.com, drive.google.com, lh3.googleusercontent.com, images.unsplash.com
                </div>
              </div>
            </div>
          </div>

          {/* Built-in Google Drive Converter Tool */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-400" />
              Google Drive Share-to-Direct Link Converter & Tester
            </h3>
            <p className="text-xs text-slate-400">
              Test and verify how user-pasted Google Drive URLs are automatically transformed into direct image embeds.
            </p>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="Paste Google Drive share link (e.g. https://drive.google.com/file/d/.../view)"
                value={driveInput}
                onChange={(e) => convertDriveLink(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            {driveConverted && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-400">Resolved Direct Embed URL:</span>
                  <span className="text-slate-500 font-mono">{driveConverted}</span>
                </div>
                <div className="h-36 w-full max-w-sm bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                  <img
                    src={driveConverted}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Subscription Plans & Admin Bypass */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          {/* Admin Bypass Banner */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-5 flex items-start gap-4">
            <ShieldCheck className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-base font-bold text-emerald-200">
                Admin Master Subscription Bypass Active
              </h4>
              <p className="text-xs text-emerald-300/80 mt-1 leading-relaxed">
                As a platform administrator, your stores and actions are strictly exempt from all product listing caps, image quotas, and subscription billing triggers. You have full CRUD authority to create, update, and manage unlimited catalogue items.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Merchant Subscription Tiers</h3>
              <span className="text-xs text-slate-400">{plans.length} configured plans</span>
            </div>

            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  <th className="p-4">Plan Name</th>
                  <th className="p-4">Code</th>
                  <th className="p-4">Monthly Price (ZMW)</th>
                  <th className="p-4">Max Products</th>
                  <th className="p-4">Max Images</th>
                  <th className="p-4">Featured Badge</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {plans.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-800/40">
                    <td className="p-4 font-bold text-white">{p.name}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">/{p.code}</td>
                    <td className="p-4 font-bold text-blue-400">
                      <input
                        type="number"
                        value={p.price_monthly}
                        onChange={(e) => {
                          const updated = [...plans];
                          updated[idx].price_monthly = parseFloat(e.target.value) || 0;
                          setPlans(updated);
                        }}
                        className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="number"
                        value={p.max_products}
                        onChange={(e) => {
                          const updated = [...plans];
                          updated[idx].max_products = parseInt(e.target.value) || 0;
                          setPlans(updated);
                        }}
                        className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="number"
                        value={p.max_images_per_product}
                        onChange={(e) => {
                          const updated = [...plans];
                          updated[idx].max_images_per_product = parseInt(e.target.value) || 0;
                          setPlans(updated);
                        }}
                        className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                      />
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded ${
                          p.featured_badge
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {p.featured_badge ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleUpdatePlan(p)}
                        disabled={savingKey === `plan-${p.id}`}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Lifecycle & Retention */}
      {activeTab === 'lifecycle' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            60-Day Inactivity & Data Retention Policy
          </h3>
          <p className="text-xs text-slate-400">
            Automated database storage optimization policy. Unverified or inactive accounts enter deletion schedule after 60 days.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Auto-Purge Inactivity Threshold (Days)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={settings['auto_purge_days'] ?? 60}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      auto_purge_days: parseInt(e.target.value) || 60,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => handleUpdateSetting('auto_purge_days', settings['auto_purge_days'])}
                  disabled={savingKey === 'auto_purge_days'}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shrink-0"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: System & Maintenance */}
      {activeTab === 'system' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-rose-400" />
            Global Maintenance & Access Control
          </h3>
          <p className="text-xs text-slate-400">
            Emergency switch to pause non-admin marketplace checkout and store modifications.
          </p>

          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div>
              <div className="font-bold text-white text-sm">Platform Maintenance Mode</div>
              <div className="text-xs text-slate-400 mt-0.5">
                When enabled, non-admin users receive a maintenance banner and checkout is safely locked.
              </div>
            </div>
            <button
              onClick={() => {
                const newVal = !(settings['maintenance_mode'] === true || settings['maintenance_mode'] === 'true');
                handleUpdateSetting('maintenance_mode', newVal);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                settings['maintenance_mode'] === true || settings['maintenance_mode'] === 'true'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
            >
              {settings['maintenance_mode'] === true || settings['maintenance_mode'] === 'true'
                ? 'MAINTENANCE ACTIVE (CLICK TO DISABLE)'
                : 'PLATFORM ONLINE (NORMAL OPERATION)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
