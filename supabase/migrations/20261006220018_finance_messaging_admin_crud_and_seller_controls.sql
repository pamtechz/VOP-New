-- Migration: finance, messaging, admin CRUD and seller control hardening
-- Aligns the production database with the production-hardening Flutter/admin clients.

BEGIN;

-- ---------------------------------------------------------------------------
-- Platform configuration
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('message_edit_window_minutes', '15'::jsonb, 'Minutes after sending during which a sender may edit message content'),
  ('minimum_payout_amount', '100'::jsonb, 'Minimum seller payout amount in the marketplace base currency')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS platform_settings_select ON public.platform_settings;
CREATE POLICY platform_settings_select ON public.platform_settings
FOR SELECT TO public
USING (
  key = ANY (ARRAY[
    'default_currency',
    'currency_symbol',
    'marketplace_commission_bps',
    'minimum_payout_amount',
    'settlement_period_days',
    'short_link_domain',
    'resource_mode',
    'max_images_per_product_free',
    'inactivity_period_months',
    'message_edit_window_minutes'
  ])
  OR public.has_capability('settings.manage')
);

-- ---------------------------------------------------------------------------
-- Message editing: server-enforced time window and immutable authorship
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.enforce_message_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_window_minutes integer := 15;
  v_setting jsonb;
  v_is_moderator boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update a message';
  END IF;

  v_is_moderator := public.has_capability('stores.moderate');

  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
     OR NEW.attachment_url_type IS DISTINCT FROM OLD.attachment_url_type
     OR NEW.attachment_short_link_id IS DISTINCT FROM OLD.attachment_short_link_id THEN
    RAISE EXCEPTION 'Message authorship, conversation and attachments are immutable';
  END IF;

  -- These fields are system controlled. Ignore client attempts to manipulate them.
  NEW.is_edited := OLD.is_edited;
  NEW.edited_at := OLD.edited_at;

  IF OLD.sender_id <> v_uid AND NOT v_is_moderator THEN
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Only the sender can edit message content';
    END IF;
    -- Recipients may only acknowledge a message as read.
    IF OLD.is_read = true AND NEW.is_read = false THEN
      RAISE EXCEPTION 'A read message cannot be marked unread by another participant';
    END IF;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF OLD.sender_id <> v_uid AND NOT v_is_moderator THEN
      RAISE EXCEPTION 'Only the sender can edit this message';
    END IF;

    SELECT value INTO v_setting
    FROM public.platform_settings
    WHERE key = 'message_edit_window_minutes';

    IF v_setting IS NOT NULL THEN
      BEGIN
        v_window_minutes := CASE jsonb_typeof(v_setting)
          WHEN 'number' THEN (v_setting::text)::integer
          WHEN 'string' THEN trim(both '"' from v_setting::text)::integer
          ELSE 15
        END;
      EXCEPTION WHEN OTHERS THEN
        v_window_minutes := 15;
      END;
    END IF;

    IF NOT v_is_moderator
       AND now() > OLD.created_at + make_interval(mins => GREATEST(v_window_minutes, 0)) THEN
      RAISE EXCEPTION 'The message edit window has expired';
    END IF;

    NEW.is_edited := true;
    NEW.edited_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_edit_window ON public.messages;
CREATE TRIGGER trg_enforce_message_edit_window
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_edit_window();

-- ---------------------------------------------------------------------------
-- Service/job listings: create missing production table and secure CRUD
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('cleaning', 'maid_housekeeper', 'caretaker_keeper', 'general_job', 'maintenance', 'other')),
  title text NOT NULL,
  description text NOT NULL,
  provider_name text,
  contact_phone text,
  contact_email text,
  location text,
  pay_rate text,
  interview_date timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_listings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_service_listings_active_expiry
  ON public.service_listings(is_active, interview_date, expires_at);
CREATE INDEX IF NOT EXISTS idx_service_listings_owner
  ON public.service_listings(user_id, created_at DESC);

ALTER TABLE public.service_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active non-expired service listings" ON public.service_listings;
DROP POLICY IF EXISTS "Users can insert own service listings" ON public.service_listings;
DROP POLICY IF EXISTS "Users can update own service listings" ON public.service_listings;
DROP POLICY IF EXISTS "Users can delete own service listings" ON public.service_listings;
DROP POLICY IF EXISTS "Admins full access to service listings" ON public.service_listings;
DROP POLICY IF EXISTS service_listings_select ON public.service_listings;
DROP POLICY IF EXISTS service_listings_insert ON public.service_listings;
DROP POLICY IF EXISTS service_listings_update ON public.service_listings;
DROP POLICY IF EXISTS service_listings_delete ON public.service_listings;

CREATE POLICY service_listings_select ON public.service_listings
FOR SELECT TO public
USING (
  (is_active = true AND interview_date >= now() AND expires_at >= now())
  OR user_id = (SELECT auth.uid())
  OR public.has_capability('services.manage')
);

CREATE POLICY service_listings_insert ON public.service_listings
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.has_capability('services.manage')
);

CREATE POLICY service_listings_update ON public.service_listings
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_capability('services.manage')
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.has_capability('services.manage')
);

CREATE POLICY service_listings_delete ON public.service_listings
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_capability('services.manage')
);

CREATE OR REPLACE FUNCTION public.purge_expired_service_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.service_listings
  WHERE interview_date < now() OR expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_service_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_service_listings() TO service_role;

-- ---------------------------------------------------------------------------
-- Subscription package administration
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS sub_plans_read_policy ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_select ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_insert ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_update ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_delete ON public.subscription_plans;

CREATE POLICY subscription_plans_select ON public.subscription_plans
FOR SELECT TO public
USING (is_active = true OR public.has_capability('settings.manage'));

CREATE POLICY subscription_plans_insert ON public.subscription_plans
FOR INSERT TO authenticated
WITH CHECK (public.has_capability('settings.manage'));

CREATE POLICY subscription_plans_update ON public.subscription_plans
FOR UPDATE TO authenticated
USING (public.has_capability('settings.manage'))
WITH CHECK (public.has_capability('settings.manage'));

CREATE POLICY subscription_plans_delete ON public.subscription_plans
FOR DELETE TO authenticated
USING (public.has_capability('settings.manage'));

-- Categories need real admin CRUD, not read-only configuration.
DROP POLICY IF EXISTS categories_insert_admin ON public.categories;
DROP POLICY IF EXISTS categories_update_admin ON public.categories;
DROP POLICY IF EXISTS categories_delete_admin ON public.categories;

CREATE POLICY categories_insert_admin ON public.categories
FOR INSERT TO authenticated
WITH CHECK (public.has_capability('settings.manage'));

CREATE POLICY categories_update_admin ON public.categories
FOR UPDATE TO authenticated
USING (public.has_capability('settings.manage'))
WITH CHECK (public.has_capability('settings.manage'));

CREATE POLICY categories_delete_admin ON public.categories
FOR DELETE TO authenticated
USING (public.has_capability('settings.manage'));

DROP POLICY IF EXISTS categories_read_policy ON public.categories;
CREATE POLICY categories_read_policy ON public.categories
FOR SELECT TO public
USING (is_active = true OR public.has_capability('settings.manage'));

-- Admins must be able to see non-public rows they are expected to moderate.
DROP POLICY IF EXISTS products_read_policy ON public.products;
CREATE POLICY products_read_policy ON public.products
FOR SELECT TO public
USING (
  status = 'active'
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = products.store_id
      AND s.owner_id = (SELECT auth.uid())
  )
  OR public.has_capability('products.manage')
);

DROP POLICY IF EXISTS stores_read_policy ON public.stores;
CREATE POLICY stores_read_policy ON public.stores
FOR SELECT TO public
USING (
  status = 'active'
  OR owner_id = (SELECT auth.uid())
  OR public.has_capability('stores.moderate')
);

-- ---------------------------------------------------------------------------
-- Payout RPC: correct role checks, JSON config parsing, debit sign and grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_payout(
  p_store_id uuid,
  p_amount numeric,
  p_destination_info jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_wallet record;
  v_min_payout numeric := 100.00;
  v_setting jsonb;
  v_payout_id uuid := gen_random_uuid();
  v_payout_ref text;
  v_balance_after numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to request payout';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  IF jsonb_typeof(p_destination_info) <> 'object'
     OR COALESCE(btrim(p_destination_info->>'provider'), '') = ''
     OR COALESCE(btrim(p_destination_info->>'account'), '') = '' THEN
    RAISE EXCEPTION 'A valid payout provider and account are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_id = v_user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.store_members
    WHERE store_id = p_store_id
      AND user_id = v_user_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the store owner can request payouts';
  END IF;

  SELECT value INTO v_setting
  FROM public.platform_settings
  WHERE key = 'minimum_payout_amount';

  IF v_setting IS NOT NULL THEN
    BEGIN
      v_min_payout := CASE jsonb_typeof(v_setting)
        WHEN 'number' THEN (v_setting::text)::numeric
        WHEN 'string' THEN trim(both '"' from v_setting::text)::numeric
        ELSE 100.00
      END;
    EXCEPTION WHEN OTHERS THEN
      v_min_payout := 100.00;
    END;
  END IF;

  IF p_amount < v_min_payout THEN
    RAISE EXCEPTION 'Requested amount % is below the minimum payout threshold of %', p_amount, v_min_payout;
  END IF;

  SELECT id, balance_available, balance_pending
  INTO v_wallet
  FROM public.wallet_accounts
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for store %', p_store_id;
  END IF;

  IF v_wallet.balance_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance. Available: %, Requested: %',
      v_wallet.balance_available, p_amount;
  END IF;

  v_balance_after := v_wallet.balance_available - p_amount;

  UPDATE public.wallet_accounts
  SET balance_available = v_balance_after,
      updated_at = now()
  WHERE id = v_wallet.id;

  v_payout_ref := 'PAYOUT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.payouts (
    id, public_ref, store_id, amount, status, destination_info, created_at
  ) VALUES (
    v_payout_id, v_payout_ref, p_store_id, p_amount, 'pending', p_destination_info, now()
  );

  INSERT INTO public.wallet_ledger (
    id,
    wallet_account_id,
    reference_type,
    reference_id,
    type,
    amount,
    balance_after,
    description,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_wallet.id,
    'payout',
    v_payout_id,
    'debit_payout',
    -p_amount,
    v_balance_after,
    'Payout request ' || v_payout_ref,
    now()
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_type, target_id, details, created_at
  ) VALUES (
    v_user_id,
    'payout.requested',
    'payout',
    v_payout_id,
    jsonb_build_object(
      'store_id', p_store_id,
      'amount', p_amount,
      'public_ref', v_payout_ref,
      'provider', p_destination_info->>'provider'
    ),
    now()
  );

  RETURN jsonb_build_object(
    'payout_id', v_payout_id,
    'public_ref', v_payout_ref,
    'amount', p_amount,
    'minimum_payout_amount', v_min_payout,
    'status', 'pending',
    'balance_available_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(uuid, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, numeric, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
