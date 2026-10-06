-- Migration: Fix shortened_links grants & request_payout parameter aliases
-- Fixes PostgREST 404/PGRST202 errors for shortened_links and request_payout

-- 1. Ensure shortened_links table grants & policies
GRANT ALL ON public.shortened_links TO authenticated;
GRANT SELECT, INSERT ON public.shortened_links TO anon;

DROP POLICY IF EXISTS shortened_links_anon_insert_policy ON public.shortened_links;
CREATE POLICY shortened_links_anon_insert_policy ON public.shortened_links
    FOR INSERT TO anon WITH CHECK (true);

-- 2. Ensure register_shortened_media_link grants
GRANT EXECUTE ON FUNCTION public.register_shortened_media_link(VARCHAR, TEXT, VARCHAR) TO authenticated, anon;

-- 3. Unified request_payout RPC supporting both p_destination_info and p_destination parameter aliases
DROP FUNCTION IF EXISTS public.request_payout(UUID, NUMERIC, JSONB);

CREATE OR REPLACE FUNCTION public.request_payout(
  p_store_id UUID,
  p_amount NUMERIC,
  p_destination_info JSONB DEFAULT NULL,
  p_destination JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dest JSONB;
  v_user_id UUID;
  v_wallet RECORD;
  v_min_payout NUMERIC := 50.00;
  v_payout_id UUID;
  v_payout_ref TEXT;
BEGIN
  v_dest := COALESCE(p_destination_info, p_destination);
  IF v_dest IS NULL THEN
    RAISE EXCEPTION 'Payout destination info required';
  END IF;

  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to request payout';
  END IF;

  -- Verify store ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_id = v_user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.store_members
    WHERE store_id = p_store_id AND user_id = v_user_id AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only store owners can request payouts';
  END IF;

  -- Read minimum payout threshold from settings (default K50.00)
  SELECT COALESCE((value->>0)::numeric, 50.00) INTO v_min_payout
  FROM public.platform_settings
  WHERE key = 'minimum_payout_amount';

  IF p_amount < v_min_payout THEN
    RAISE EXCEPTION 'Requested amount % is below the minimum threshold of %', p_amount, v_min_payout;
  END IF;

  -- Lock wallet row
  SELECT id, balance_available, balance_pending INTO v_wallet
  FROM public.wallet_accounts
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for store %', p_store_id;
  END IF;

  IF v_wallet.balance_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance. Available: %, Requested: %', v_wallet.balance_available, p_amount;
  END IF;

  -- Deduct available balance
  UPDATE public.wallet_accounts
  SET balance_available = balance_available - p_amount,
      updated_at = now()
  WHERE id = v_wallet.id;

  -- Create payout record
  v_payout_id := gen_random_uuid();
  v_payout_ref := 'PAYOUT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.payouts (
    id,
    public_ref,
    store_id,
    amount,
    status,
    destination_info,
    created_at
  ) VALUES (
    v_payout_id,
    v_payout_ref,
    p_store_id,
    p_amount,
    'pending',
    v_dest,
    now()
  );

  -- Record entry in immutable wallet ledger
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
    v_wallet.balance_available - p_amount,
    'Payout request ' || v_payout_ref,
    now()
  );

  RETURN jsonb_build_object(
    'payout_id', v_payout_id,
    'public_ref', v_payout_ref,
    'amount', p_amount,
    'status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, JSONB, JSONB) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
