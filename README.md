# Local Multi-Vendor Marketplace

Production-grade local multi-vendor marketplace designed to support up to **50,000 active users** while operating efficiently within the **Supabase Free Plan** constraints.

---

## Architecture Stack

- **Mobile App**: Flutter + Dart (Android primary, feature-based architecture under `mobile/lib/`)
- **Admin Portal**: Next.js 14 + TypeScript + Tailwind CSS (under `admin/`)
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security, Edge Functions, Cron, Realtime, Storage)

---

## 🚀 Quick Start Guide

### 1. Backend & Database Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Execute SQL migrations in your Supabase SQL Editor or via CLI:
   - `supabase/migrations/20261004000001_initial_schema.sql` (Tables, Indexes, RLS Policies)
   - `supabase/migrations/20261004000002_functions_and_cron.sql` (Atomic Multi-Seller Checkout, Payment Ledger & Inactivity RPCs)
3. Deploy Supabase Edge Functions:
   - `account-inactivity-worker` (Scheduled account inactivity scanner)
   - `short-link-handler` (Base62 short link resolver & daily click tracker)
   - `verify-payment` (Server payment webhook fulfillment)
   - `storage-cleanup-worker` (Storage media orphan file garbage collector)

---

### 2. Next.js Admin Portal

Run the administration console locally:

```bash
cd admin
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Environment Variables (`admin/.env.local`)

Create `admin/.env.local` (this file is git-ignored) and fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-anon-key
```

> Obtain these from **Supabase Dashboard → Settings → API**.

---

### 3. Flutter Mobile Application

Run the mobile marketplace application passing credentials as `--dart-define` flags.
**Never** put secrets in source code.

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-publishable-anon-key \
  --dart-define=RESOURCE_MODE=constrained
```

See [`mobile/CREDENTIALS.md`](mobile/CREDENTIALS.md) for full instructions.

---

## 📌 Key Architectural Highlights

- **Resource Strategy (`resource_mode = constrained`)**: Image compression pre-upload (`ImageOptimizerService`), 1024px max dimensions, WebP format, and aggregated metrics tables (`ad_metrics_daily`, `short_link_metrics_daily`).
- **Multi-Seller Checkout**: Parent order with store sub-orders created atomically via `place_multi_seller_order` with inventory row-locking.
- **5% Immutable Platform Commission**: Snapshotted permanently at purchase time onto order items and seller sub-orders.
- **Append-Only Financial Ledger**: Wallet proceeds, payouts, refunds, and adjustments tracked in `wallet_ledger`.
- **60-Day Account Inactivity Lifecycle**: Automated warning schedule (T-14, T-7, T-3, T-2, T-1, T-0 days) with deletion holds for active orders/disputes and "Keep My Account" activity reset.
- **Direct Advertising System**: Direct placement banners ("Sponsored") with daily aggregated impression/click metrics.
- **First-Party Base62 Short Links**: Canonical entity code reuse (`go.marketplace.com/A7kP31`) and redirect Edge Function handler.
