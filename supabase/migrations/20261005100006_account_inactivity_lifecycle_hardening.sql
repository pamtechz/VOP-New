-- Migration: 20261005100006_account_inactivity_lifecycle_hardening
-- Description: Implement strict 2-month inactivity lifecycle, hold verification, authenticated touch, and terminal deletion

BEGIN;

-- 1. Add lifecycle_status column
ALTER TABLE public.account_lifecycle
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active'
  CHECK (lifecycle_status IN ('active', 'warning', 'held', 'deletion_pending', 'deleted'));

-- 2. Authenticated touch_current_user_activity
CREATE OR REPLACE FUNCTION public.touch_current_user_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_last_active timestamptz;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT last_active_at INTO v_last_active
  FROM public.account_lifecycle
  WHERE user_id = v_user_id;

  -- Only write if last active was more than 1 day ago to prevent write explosion
  IF v_last_active IS NULL OR v_last_active < (now() - interval '1 day') THEN
    INSERT INTO public.account_lifecycle (
      user_id,
      last_active_at,
      deletion_due_at,
      next_action_at,
      warning_stage,
      lifecycle_status,
      deletion_hold,
      deletion_hold_reason,
      exempt,
      updated_at
    ) VALUES (
      v_user_id,
      now(),
      now() + interval '2 months',
      now() + interval '2 months' - interval '14 days',
      0,
      'active',
      false,
      NULL,
      false,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      last_active_at = now(),
      deletion_due_at = now() + interval '2 months',
      next_action_at = now() + interval '2 months' - interval '14 days',
      warning_stage = 0,
      lifecycle_status = 'active',
      deletion_hold = false,
      deletion_hold_reason = NULL,
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_current_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_current_user_activity() TO authenticated;

-- 3. Explicit Keep My Account RPC
CREATE OR REPLACE FUNCTION public.keep_my_account_active()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.account_lifecycle
  SET last_active_at = now(),
      deletion_due_at = now() + interval '2 months',
      next_action_at = now() + interval '2 months' - interval '14 days',
      warning_stage = 0,
      lifecycle_status = 'active',
      deletion_hold = false,
      deletion_hold_reason = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    v_user_id,
    'account_status',
    'Account Kept Active',
    'Your Pamtechz Marketplace account has been successfully confirmed as active. Deletion countdown has been reset for 2 months.'
  );

  RETURN jsonb_build_object('status', 'active', 'due_at', now() + interval '2 months');
END;
$$;

REVOKE ALL ON FUNCTION public.keep_my_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.keep_my_account_active() TO authenticated;

-- 4. Batch Lifecycle Processor in private schema
CREATE OR REPLACE FUNCTION private.process_account_inactivity_batch(p_batch_size integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_account record;
  v_processed_count int := 0;
  v_warnings_sent int := 0;
  v_deletions_executed int := 0;
  v_days_left int;
  v_has_hold boolean;
  v_hold_reason text;
BEGIN
  FOR v_account IN
    SELECT user_id, last_active_at, deletion_due_at, warning_stage, deletion_hold, lifecycle_status
    FROM public.account_lifecycle
    WHERE exempt = false
      AND lifecycle_status != 'deleted'
      AND next_action_at <= now()
    ORDER BY next_action_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed_count := v_processed_count + 1;
    v_days_left := EXTRACT(DAY FROM (v_account.deletion_due_at - now()))::int;

    IF v_days_left > 14 THEN
      UPDATE public.account_lifecycle 
      SET next_action_at = v_account.deletion_due_at - interval '14 days',
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 14 AND v_days_left > 7 AND COALESCE(v_account.warning_stage, 0) < 1 THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_account.user_id, 'inactivity_warning', 'Account Inactivity Warning (14 Days)', 
              'Your account has been inactive. It will be deleted in 14 days unless you log in or tap Keep My Account.');
      v_warnings_sent := v_warnings_sent + 1;
      UPDATE public.account_lifecycle 
      SET warning_stage = 1, 
          lifecycle_status = 'warning',
          next_action_at = v_account.deletion_due_at - interval '7 days',
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 7 AND v_days_left > 3 AND COALESCE(v_account.warning_stage, 0) < 2 THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_account.user_id, 'inactivity_warning', '7 Days Until Account Deletion', 
              'Your account will be deleted in 7 days due to inactivity. Please log in to keep your account active.');
      v_warnings_sent := v_warnings_sent + 1;
      UPDATE public.account_lifecycle 
      SET warning_stage = 2, 
          lifecycle_status = 'warning',
          next_action_at = v_account.deletion_due_at - interval '3 days',
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 3 AND v_days_left > 2 AND COALESCE(v_account.warning_stage, 0) < 3 THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_account.user_id, 'inactivity_warning', '3 Days Until Account Deletion', 
              'Your marketplace account will be permanently deleted in 3 days. Action is required.');
      v_warnings_sent := v_warnings_sent + 1;
      UPDATE public.account_lifecycle 
      SET warning_stage = 3, 
          lifecycle_status = 'warning',
          next_action_at = v_account.deletion_due_at - interval '2 days',
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 2 AND v_days_left > 1 AND COALESCE(v_account.warning_stage, 0) < 4 THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_account.user_id, 'inactivity_warning', '2 Days Until Account Deletion', 
              'Final reminder: 2 days left to save your marketplace account.');
      v_warnings_sent := v_warnings_sent + 1;
      UPDATE public.account_lifecycle 
      SET warning_stage = 4, 
          lifecycle_status = 'warning',
          next_action_at = v_account.deletion_due_at - interval '1 day',
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 1 AND v_days_left > 0 AND COALESCE(v_account.warning_stage, 0) < 5 THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_account.user_id, 'inactivity_warning', 'Account Deletion Tomorrow', 
              'Your account is scheduled for deletion tomorrow. Log in immediately to cancel deletion.');
      v_warnings_sent := v_warnings_sent + 1;
      UPDATE public.account_lifecycle 
      SET warning_stage = 5, 
          lifecycle_status = 'deletion_pending',
          next_action_at = v_account.deletion_due_at,
          updated_at = now()
      WHERE user_id = v_account.user_id;

    ELSIF v_days_left <= 0 THEN
      -- Issue T-0 Final Notice if not yet sent
      IF COALESCE(v_account.warning_stage, 0) < 6 THEN
        INSERT INTO public.notifications (user_id, type, title, body)
        VALUES (v_account.user_id, 'inactivity_warning', 'Final Account Deletion Notice', 
                'Account deletion processing today due to 2 months of inactivity.');
        v_warnings_sent := v_warnings_sent + 1;
      END IF;

      -- Check all deletion holds
      v_has_hold := false;
      v_hold_reason := NULL;

      -- 1. Active buyer order
      IF EXISTS (SELECT 1 FROM public.orders WHERE buyer_id = v_account.user_id AND status IN ('pending', 'processing')) THEN
        v_has_hold := true;
        v_hold_reason := 'Active pending buyer order in progress';
      -- 2. Active seller order
      ELSIF EXISTS (
        SELECT 1 FROM public.seller_orders so 
        JOIN public.stores s ON s.id = so.store_id 
        WHERE s.owner_id = v_account.user_id AND so.status IN ('pending', 'processing', 'shipped')
      ) THEN
        v_has_hold := true;
        v_hold_reason := 'Active seller order in fulfillment';
      -- 3. Unsettled seller proceeds
      ELSIF EXISTS (
        SELECT 1 FROM public.wallet_accounts wa 
        JOIN public.stores s ON s.id = wa.store_id 
        WHERE s.owner_id = v_account.user_id AND wa.balance_pending > 0
      ) THEN
        v_has_hold := true;
        v_hold_reason := 'Unsettled seller proceeds in wallet';
      -- 4. Available wallet balance
      ELSIF EXISTS (
        SELECT 1 FROM public.wallet_accounts wa 
        JOIN public.stores s ON s.id = wa.store_id 
        WHERE s.owner_id = v_account.user_id AND wa.balance_available > 0
      ) THEN
        v_has_hold := true;
        v_hold_reason := 'Available funds in seller wallet awaiting payout';
      -- 5. Pending or processing payout
      ELSIF EXISTS (
        SELECT 1 FROM public.payouts p 
        JOIN public.stores s ON s.id = p.store_id 
        WHERE s.owner_id = v_account.user_id AND p.status IN ('pending', 'approved')
      ) THEN
        v_has_hold := true;
        v_hold_reason := 'Payout request is currently processing';
      -- 6. Unresolved dispute as buyer or seller
      ELSIF EXISTS (
        SELECT 1 FROM public.disputes d 
        WHERE (d.buyer_id = v_account.user_id OR EXISTS (
          SELECT 1 FROM public.seller_orders so 
          JOIN public.stores s ON s.id = so.store_id 
          WHERE so.id = d.seller_order_id AND s.owner_id = v_account.user_id
        )) AND d.status IN ('open', 'under_review')
      ) THEN
        v_has_hold := true;
        v_hold_reason := 'Unresolved transaction dispute in progress';
      END IF;

      IF v_has_hold THEN
        UPDATE public.account_lifecycle
        SET deletion_hold = true, 
            deletion_hold_reason = v_hold_reason, 
            lifecycle_status = 'held',
            next_action_at = now() + interval '7 days',
            updated_at = now()
        WHERE user_id = v_account.user_id;
      ELSE
        -- True Deletion & Anonymization
        -- Suspend store
        UPDATE public.stores
        SET status = 'suspended', updated_at = now()
        WHERE owner_id = v_account.user_id;

        -- Unpublish store products
        UPDATE public.products
        SET status = 'archived', updated_at = now()
        WHERE store_id IN (SELECT id FROM public.stores WHERE owner_id = v_account.user_id);

        -- Anonymize user profile
        UPDATE public.profiles
        SET full_name = 'Deleted User', 
            avatar_url = NULL, 
            phone = NULL,
            city = NULL,
            province = NULL,
            area = NULL,
            updated_at = now()
        WHERE id = v_account.user_id;

        -- Mark terminal lifecycle state
        UPDATE public.account_lifecycle
        SET lifecycle_status = 'deleted',
            warning_stage = 6,
            next_action_at = now() + interval '100 years',
            updated_at = now()
        WHERE user_id = v_account.user_id;

        -- Log Deletion Audit Record
        INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
        VALUES (v_account.user_id, 'ACCOUNT_DELETED_INACTIVITY', 'profile', v_account.user_id, 
                jsonb_build_object('last_active', v_account.last_active_at, 'deleted_at', now()));

        v_deletions_executed := v_deletions_executed + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed_count,
    'warnings_sent', v_warnings_sent,
    'deletions_executed', v_deletions_executed
  );
END;
$$;

REVOKE ALL ON FUNCTION private.process_account_inactivity_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.process_account_inactivity_batch(integer) TO service_role;

-- Service role gateway in public schema for scheduled workers
CREATE OR REPLACE FUNCTION public.process_account_inactivity_batch(p_batch_size integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF (current_user != 'service_role' AND COALESCE((select auth.role()), '') != 'service_role') THEN
    RAISE EXCEPTION 'Access denied: service_role required';
  END IF;

  RETURN private.process_account_inactivity_batch(p_batch_size);
END;
$$;

REVOKE ALL ON FUNCTION public.process_account_inactivity_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_account_inactivity_batch(integer) TO service_role;

-- Track migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261005100006',
  'account_inactivity_lifecycle_hardening',
  ARRAY['account_lifecycle_status', 'touch_current_user_activity', 'keep_my_account_active', 'process_account_inactivity_batch']
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
