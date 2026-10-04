# Master Development Architecture — Local Multi-Vendor Marketplace

## 1. System Overview & Key Technical Goals
This document specifies the software architecture for a high-performance, resource-efficient, local multi-vendor marketplace designed to support up to **50,000 active users** while operating efficiently within the **Supabase Free Plan** constraints (500 MB DB, 1 GB Storage, 50,000 MAU).

```
                            LOCAL MARKETPLACE ARCHITECTURE
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            │                                                           │
            ▼                                                           ▼
 Flutter Android Mobile App                                   Next.js Admin Portal
(Feature-Based Flutter Architecture)                         (TypeScript + Tailwind + Shadcn UI)
            │                                                           │
            └─────────────────────────────┬─────────────────────────────┘
                                          │
                                          ▼
                                   Supabase Platform
                                          │
      ┌───────────────────┬───────────────┼───────────────┬───────────────────┐
      │                   │               │               │                   │
      ▼                   ▼               ▼               ▼                   ▼
Supabase Auth      PostgreSQL DB   Supabase Storage   Supabase Realtime  Edge Functions / Cron
 (Custom Auth)     (RLS + RPCs)   (Constrained WebP) (Selective Channels)  (Background Workers)
```

---

## 2. Resource Strategy: Constrained vs. Standard Modes

### Baseline Assumptions & Capacity Boundaries
- **Database Storage**: 500 MB limit (Target ~150-250 MB operational footprint at 50,000 users).
- **Object Storage**: 1 GB limit (Target pre-compressed WebP <= 100 KB/image).
- **MAU Capacity**: 50,000 registered/active users.
- **Realtime**: Limited peak channels (Selective subscriptions: active chat, active order delivery tracking).
- **Egress**: Minimized via device-side caching, pagination, data saver mode.

### Platform Configuration Modes (`platform_settings`)
```json
{
  "resource_mode": "constrained",
  "product_image_max_bytes": 122880,
  "product_image_max_dimension": 1024,
  "product_image_limit_by_plan": {
    "free": 2,
    "business": 4,
    "pro": 8
  },
  "chat_attachment_retention_days": 30,
  "cart_retention_days": 30,
  "notification_retention_days": 45,
  "inactivity_period_days": 60,
  "inactivity_warning_schedule": [14, 7, 3, 2, 1, 0],
  "default_commission_rate": 0.05
}
```

---

## 3. Account Lifecycle & Inactivity Deletion Workflow

Account inactivity policy enforces deletion after **2 months (60 days)** of inactivity with mandatory scheduled warnings:

```
Last Activity (last_active_at)
       │
       ├─► deletion_due_at = last_active_at + 60 days
       │
       ├─► Schedule Warnings:
       │    ├── T - 14 Days: Warning Email & Notification
       │    ├── T - 7 Days:  Warning Email & Notification
       │    ├── T - 3 Days:  Warning Email & Notification
       │    ├── T - 2 Days:  Warning Email & Notification
       │    ├── T - 1 Day:   Warning Email & Notification
       │    └── T - 0 Days:  Final Warning & Deletion Hold Evaluation
       │
       ├─► Activity Reset Event (Login, Purchase, Seller listing, "Keep My Account" tap)
       │    └── Resets last_active_at, clears warning stage, calculates new deletion_due_at
       │
       └─► Deletion Day Check:
            ├── Check Deletion Holds (Active Orders, Unsettled Ledger, Open Disputes, Pending Payouts, Fraud Hold)
            │    ├── IF HOLD EXISTS: Suspend deletion, flag `deletion_hold_reason`, log audit
            │    └── IF NO HOLD: Cleanup Storage objects -> Anonymize Financial Records -> Delete Supabase Auth User
```

---

## 4. Multi-Seller Checkout & Immutable Financial Ledger

### Order Architecture
```
                           Parent Order (ORD-2026-X)
                        Total: K1,500 | Buyer: User_A
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
            ▼                                                   ▼
Seller Order A (SORD-A1)                              Seller Order B (SORD-B1)
Store: Alpha Electronics                              Store: Beta Crafts
Subtotal: K1,000 | Commission (5%): K50              Subtotal: K500 | Commission (5%): K25
Seller Proceeds: K950                                 Seller Proceeds: K475
```

### Ledger Immutability
- Commission rate applied at purchase time is saved into `order_items` and `seller_orders` (`commission_rate_applied`).
- Platform rate updates (e.g. from 5% to 6%) do not recalculate past transactions.
- Append-only `wallet_ledger` entries ensure full financial auditability.

---

## 5. Direct Advertising & First-Party Base62 Short Links

### Direct Advertising
- Supported Placements: Home Hero, Home Inline, Category Ads, Sponsored Search, Native Promo Cards.
- Aggregated Daily Performance (`ad_metrics_daily`): Aggregates impressions, unique impressions, clicks, unique clicks, conversions per campaign per day to prevent database record explosion.

### First-Party Short Link System
- Base62 Canonical Short Codes (e.g., `go.marketplace.com/A7kP31`).
- Canonical short links are reused across shares for the same target entity (Product, Store, Campaign).
- Aggregated stats stored in `short_link_metrics_daily`.

---

## 6. Project Structure Overview
```
store/
├── docs/                      # Technical Documentation & Diagrams
├── supabase/                  # PostgreSQL Migrations & Edge Functions
│   ├── migrations/            # SQL Schemas, Functions, Triggers, RLS
│   └── functions/             # Edge Functions & Cron Tasks
├── admin/                     # Next.js 14+ TypeScript Admin Portal
│   ├── src/
│   │   ├── app/               # App Router pages (Dashboard, Commerce, Advertising, System)
│   │   ├── components/        # UI & Management components
│   │   └── lib/               # Supabase client & utilities
│   └── package.json
└── mobile/                    # Flutter Multi-Vendor App
    ├── lib/
    │   ├── core/              # Services, Storage, Compression, Network, Data Saver
    │   ├── config/            # Design tokens, themes, platform settings
    │   ├── routing/           # GoRouter setup
    │   ├── auth/              # Auth state & screens
    │   ├── marketplace/       # Home, Categories, Explore, Search, Ads
    │   ├── stores/            # Store views & management
    │   ├── products/          # Product details, search, filters
    │   ├── cart/              # Multi-seller shopping cart
    │   ├── checkout/          # Multi-seller order placement
    │   ├── orders/            # Order history & tracking
    │   ├── payments/          # Gateway integrations & verification
    │   ├── wallet/            # Seller wallet & payout requests
    │   ├── subscriptions/     # Seller plans & upgrades
    │   ├── advertising/       # Admin & Seller ad view models
    │   ├── messaging/         # Buyer-Seller chat
    │   ├── notifications/     # In-app notifications
    │   ├── account/           # Profile & Inactivity deletion controls
    │   └── shared/            # Shared UI widgets & models
    └── pubspec.yaml
```
