-- Migration: transactional payout review workflow
BEGIN;

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.review_payout(
  p_payout_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_payout public.payouts%ROWTYPE;
  v_wallet public.wallet_accounts%ROWTYPE;
  v_balance_after numeric(14,2);
BEGIN
  IF v_actor IS NULL OR NOT public.has_capability('payouts.approve') THEN
    RAISE EXCEPTION 'payouts.approve capability required';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Payout review action must be approve or reject';
  END IF;

  SELECT * INTO v_payout
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF v_payout.id IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  IF v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payouts can be reviewed (current status: %)', v_payout.status;
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.payouts
    SET status = 'approved',
        approved_by = v_actor,
        approved_at = now(),
        reviewed_by = v_actor,
        reviewed_at = now(),
        review_notes = NULLIF(btrim(COALESCE(p_reason, '')), '')
    WHERE id = v_payout.id;

    INSERT INTO public.audit_logs (
      actor_id, action, target_type, target_id, details, created_at
    ) VALUES (
      v_actor,
      'payout.approved',
      'payout',
      v_payout.id,
      jsonb_build_object(
        'store_id', v_payout.store_id,
        'amount', v_payout.amount,
        'public_ref', v_payout.public_ref,
        'reason', p_reason
      ),
      now()
    );

    RETURN jsonb_build_object(
      'payout_id', v_payout.id,
      'public_ref', v_payout.public_ref,
      'status', 'approved'
    );
  END IF;

  -- Rejection returns the amount reserved at request time exactly once.
  SELECT * INTO v_wallet
  FROM public.wallet_accounts
  WHERE store_id = v_payout.store_id
  FOR UPDATE;

  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Store wallet not found for rejected payout';
  END IF;

  UPDATE public.wallet_accounts
  SET balance_available = balance_available + v_payout.amount,
      updated_at = now()
  WHERE id = v_wallet.id
  RETURNING balance_available INTO v_balance_after;

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
    v_payout.id,
    'credit_adjustment',
    v_payout.amount,
    v_balance_after,
    'Payout request rejected; reserved balance restored: ' || v_payout.public_ref,
    now()
  );

  UPDATE public.payouts
  SET status = 'rejected',
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_notes = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = v_payout.id;

  INSERT INTO public.audit_logs (
    actor_id, action, target_type, target_id, details, created_at
  ) VALUES (
    v_actor,
    'payout.rejected',
    'payout',
    v_payout.id,
    jsonb_build_object(
      'store_id', v_payout.store_id,
      'amount', v_payout.amount,
      'public_ref', v_payout.public_ref,
      'restored_balance', v_balance_after,
      'reason', p_reason
    ),
    now()
  );

  RETURN jsonb_build_object(
    'payout_id', v_payout.id,
    'public_ref', v_payout.public_ref,
    'status', 'rejected',
    'restored_balance', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_payout(uuid,text,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_payout(uuid,text,text)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;