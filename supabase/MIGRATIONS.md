# Supabase Migration Instructions

## Problem: "Table Already Exists" Error

If you ran **migration 000001** already and now see errors like:

```
ERROR: relation "profiles" already exists
ERROR: relation "stores" already exists
```

it means the schema is already in place. **Do not re-run 000001.** Follow the steps below.

---

## Step-by-Step Migration Plan

### Step 1 — Verify existing tables (run this first)

Open the Supabase SQL Editor and run:

```sql
SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;
```

If you see `profiles`, `stores`, `products`, etc., migration 000001 is already applied.

---

### Step 2 — Apply the functions migration (000002)

Paste and run **`supabase/migrations/20261004000002_functions_and_cron.sql`** in full.

All statements use `CREATE OR REPLACE FUNCTION` so they are **safe to re-run** even if the functions already exist. If you see a specific error, paste it here and it will be fixed.

---

### Step 3 — Apply the upgrade migration (000003) — NEW

Paste and run **`supabase/migrations/20261004000003_idempotent_upgrade.sql`** in full.

This migration:
- Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — **safe if columns exist**
- Uses `CREATE INDEX IF NOT EXISTS` — **safe if index exists**
- Uses `CREATE OR REPLACE FUNCTION` — **safe always**
- Uses `INSERT ... ON CONFLICT DO NOTHING` — **safe always**

---

### Step 4 — Verify new columns exist

```sql
-- Confirm new columns on product_images
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'product_images'
ORDER  BY ordinal_position;

-- Confirm new columns on messages
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'messages'
ORDER  BY ordinal_position;

-- Confirm new RPC functions exist
SELECT routine_name
FROM   information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_type   = 'FUNCTION'
ORDER  BY routine_name;
```

Expected new functions:
- `shorten_external_url`
- `attach_shortened_url_to_product_image`
- `attach_shortened_url_to_message`
- `place_multi_seller_order`
- `fulfill_payment_and_credit_ledger`
- `get_or_create_short_link`
- `process_account_inactivity_batch`
- `touch_user_activity`
- `track_ad_event`
- `track_short_link_click`

---

## What Each Migration Does

| Migration | Safe to re-run? | What it contains |
|---|---|---|
| `000001_initial_schema.sql` | ❌ Re-run will error (tables exist) | All 29 tables, indexes, RLS policies, triggers |
| `000002_functions_and_cron.sql` | ✅ Yes (`CREATE OR REPLACE`) | All RPCs/functions |
| `000003_idempotent_upgrade.sql` | ✅ Yes (`IF NOT EXISTS` everywhere) | New columns, URL shortening RPCs |

---

## URL Shortening Flow (New Feature)

When a user pastes an image URL in the Flutter app:

```
User pastes URL
       ↓
Flutter calls RPC: attach_shortened_url_to_product_image(product_id, external_url)
       ↓
PostgreSQL validates URL (https only, max 2048 chars, no javascript:/data: schemes)
       ↓
Generates Base62 code (e.g. A7kP31) or reuses canonical code if URL was seen before
       ↓
Inserts record into short_links with destination_type = 'external'
       ↓
Inserts record into product_images with:
    url          = 'https://go.marketplace.com/A7kP31'   ← short URL stored
    url_type     = 'shortened'
    short_link_id = <UUID of short_links row>
       ↓
Returns: { short_url, code, reused }
       ↓
Flutter displays short URL in image preview
       ↓
When buyer views product → short-link Edge Function resolves to original URL
```

Benefits:
- A 400-character Google Drive / Dropbox URL stored as 6 characters in the DB
- Canonical reuse: same URL pasted 1,000 times = still only 1 `short_links` row
- Security: only http/https URLs pass validation
