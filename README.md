# Pamtechz Local Marketplace

Production-grade, local multi-vendor marketplace designed to support up to **50,000 registered users** while operating efficiently within **Supabase Free Plan** constraints.

---

## 🏛️ System Architecture

- **Mobile Application**: Flutter / Dart (Android primary, located in `mobile/`)
  - Deep linking & App Links for `pamtechz.com` / `assetlinks.json`
  - Public discovery (Home, Search with 350ms debounce, Product Details, Store View)
  - Protected checkout, order history, persistent messaging, and Seller Centre
  - User-owned cloud media integration (Cloudinary & Google Drive) to eliminate platform disk saturation
- **Admin Portal**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (located in `admin/`)
  - Server-side aggregated dashboard metrics (`get_admin_dashboard_metrics` RPC)
  - Real store summaries view (`admin_store_summaries`) with live product counts and active plan tiers
  - Centralized platform configuration console (Base currency, commission, payouts, maintenance mode)
- **Backend & Database**: Supabase PostgreSQL 17 + RLS + Auth + Edge Functions
  - Schema migration control tracked via `supabase_migrations.schema_migrations`
  - Explicit least-privilege Data API grants and `private` schema for internal workers
  - Atomic multi-seller checkout RPC (`create_server_checkout`) with 30-minute inventory reservations
  - Cryptographic payment verification webhook (HMAC-SHA256) with private settlement engine (`private.fulfill_verified_payment`)
  - Append-only financial ledger (`wallet_ledger`, `payments`, `payment_events`)
  - Strict 2-calendar-month account inactivity lifecycle with hold checks and automated warnings
  - First-party Base62 short links with collision retry and expiration enforcement
  - Direct first-party advertising system with `SPONSORED` badge and daily aggregated metrics

---

## 🔒 Security & Data Integrity Invariants

1. **Zero Client Trust**: Prices, inventory reservations, delivery fees, commission snapshots, payment statuses, and staff roles are computed and enforced authoritatively on the server.
2. **Append-Only Financial Records**: Administrators and clients have zero `UPDATE` or `DELETE` grants on financial tables (`payments`, `payment_events`, `wallet_ledger`). Financial corrections occur strictly via reversing entries.
3. **No Unrestricted Profile Mutation**: Profile roles are protected by database triggers. Administrative roles are granted exclusively through `platform_staff_roles` with granular capability checks.
4. **Safe Personal Profiles**: Private customer PII (phone, area, city) is restricted via RLS. Public buyer/seller profiles are safely exposed through `public_profiles` view with `WITH (security_invoker = true)`.
5. **Private Settlement Gateway**: `private.fulfill_verified_payment` is callable only by the `service_role`. Anonymous or ordinary authenticated clients cannot execute payment fulfillment.

---

## 🚀 Development & Deployment

### 1. Database Migrations (Supabase)

All migrations are tracked and forward-only:

```text
supabase/migrations/
├── 20261005100001_baseline_remote_schema.sql
├── 20261005100002_security_definer_lockdown_and_private_schema.sql
├── 20261005100003_rbac_profile_protection_and_addresses.sql
├── 20261005100004_checkout_reservations_settlement_and_store_onboarding.sql
├── 20261005100005_performance_indexes_and_rls_initplan.sql
├── 20261005100006_account_inactivity_lifecycle_hardening.sql
├── 20261005100007_admin_metrics_and_store_summaries.sql
└── 20261005100008_explicit_crud_policies_for_stores_and_products.sql
```

Tracked in: `supabase_migrations.schema_migrations`.

### 2. Edge Functions (Deno / TypeScript)

Deployed and active on remote project:

1. `verify-payment`: Provider webhook verification with cryptographic HMAC signature validation and idempotent settlement call.
2. `account-inactivity-worker`: Automated 2-calendar-month inactivity batch processor with holds enforcement (active orders, wallet balances, disputes).
3. `short-link-handler`: Base62 short link resolution, expiration enforcement, and daily click aggregation.
4. `storage-cleanup-worker`: Releases expired 30-minute inventory reservations and executes T+2 pending-to-available seller proceed settlement.

### 3. Next.js Admin Portal

```bash
cd admin
npm install
npm run dev
```

Build verification:
```bash
npm run build
```

Environment configuration (`admin/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 4. Flutter Mobile App

Run with compile-time flags. Never hardcode credentials into source:

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://<your-project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<your-anon-key> \
  --dart-define=RESOURCE_MODE=constrained
```

Run test suite:
```bash
flutter test
```

Build Android APK:
```bash
flutter build apk --release
```

---

## 🧪 CI/CD Pipeline

Continuous integration is enforced via GitHub Actions in `.github/workflows/ci.yml`:
- **Admin**: Dependency install, linting, typechecking, and Next.js 14 production build.
- **Mobile**: Dart formatting verification, Flutter static analysis, unit/widget tests, and Android release build verification.
- **Database**: Migration file syntax and non-emptiness verification.
