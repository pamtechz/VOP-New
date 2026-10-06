-- Migration: Add currency column to public.wallet_accounts
-- Fixes Supabase error 42703 (column wallet_accounts.currency does not exist)

ALTER TABLE public.wallet_accounts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZMW';

COMMENT ON COLUMN public.wallet_accounts.currency IS 'Default ISO currency code for seller wallet settlement.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
