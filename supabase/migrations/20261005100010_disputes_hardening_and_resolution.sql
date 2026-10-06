-- ============================================================================
-- Migration: 20261005100010_disputes_hardening_and_resolution.sql
-- Description: 
--   1. Harden disputes insert RLS policy so only the verified buyer of an order
--      can open a dispute, strictly with status = 'open' and refund_amount = 0.
--   2. Authoritative server function public.resolve_dispute() for staff to resolve
--      disputes with immutable ledger debit and order status update.
-- ============================================================================

DO $$
BEGIN
  -- 1. Harden disputes insert policy
  DROP POLICY IF EXISTS disputes_insert_buyer ON public.disputes;
  CREATE POLICY disputes_insert_buyer ON public.disputes FOR INSERT TO authenticated WITH CHECK (
    ((SELECT auth.uid()) = buyer_id)
    AND (status = 'open')
    AND (COALESCE(refund_amount, 0) = 0)
    AND (resolved_at IS NULL)
    AND (EXISTS (
      SELECT 1 FROM public.seller_orders so
      JOIN public.orders o ON o.id = so.parent_order_id
      WHERE so.id = disputes.seller_order_id
        AND o.buyer_id = (SELECT auth.uid())
    ))
  );

  -- 2. Create authoritative dispute resolution function
  CREATE OR REPLACE FUNCTION public.resolve_dispute(
    p_dispute_id uuid,
    p_resolution_status text,
    p_resolution_notes text DEFAULT NULL,
    p_refund_amount numeric DEFAULT 0.00
  )
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, private, pg_temp
  AS $body$
  DECLARE
    v_dispute record;
    v_seller_order record;
    v_wallet record;
    v_refund_amt numeric := COALESCE(p_refund_amount, 0.00);
    v_new_balance numeric;
  BEGIN
    IF NOT public.has_capability('disputes.manage') THEN
      RAISE EXCEPTION 'Access denied: disputes.manage capability required';
    END IF;

    IF p_resolution_status NOT IN ('resolved_refunded', 'resolved_rejected', 'resolved_store_upheld', 'closed') THEN
      RAISE EXCEPTION 'Invalid resolution status: %', p_resolution_status;
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    IF v_dispute.status IN ('resolved_refunded', 'resolved_rejected', 'resolved_store_upheld', 'closed') THEN
      RAISE EXCEPTION 'Dispute is already resolved (status: %)', v_dispute.status;
    END IF;

    SELECT * INTO v_seller_order
    FROM public.seller_orders
    WHERE id = v_dispute.seller_order_id
    FOR UPDATE;

    IF v_refund_amt > 0 AND p_resolution_status = 'resolved_refunded' THEN
      -- Find store wallet
      SELECT * INTO v_wallet
      FROM public.wallet_accounts
      WHERE store_id = v_seller_order.store_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_wallet.balance_pending >= v_refund_amt THEN
          UPDATE public.wallet_accounts
          SET balance_pending = balance_pending - v_refund_amt,
              updated_at = now()
          WHERE id = v_wallet.id
          RETURNING balance_available INTO v_new_balance;
        ELSE
          UPDATE public.wallet_accounts
          SET balance_available = balance_available - v_refund_amt,
              updated_at = now()
          WHERE id = v_wallet.id
          RETURNING balance_available INTO v_new_balance;
        END IF;

        -- Record immutable ledger debit
        INSERT INTO public.wallet_ledger (
          wallet_account_id,
          reference_type,
          reference_id,
          type,
          amount,
          balance_after,
          description
        ) VALUES (
          v_wallet.id,
          'dispute',
          v_dispute.id,
          'debit',
          v_refund_amt,
          v_new_balance,
          'Dispute refund approved: ' || COALESCE(p_resolution_notes, 'Customer refund issued')
        );
      END IF;

      UPDATE public.seller_orders
      SET status = 'cancelled'
      WHERE id = v_seller_order.id;
    END IF;

    UPDATE public.disputes
    SET status = p_resolution_status,
        resolution_notes = p_resolution_notes,
        refund_amount = v_refund_amt,
        resolved_at = now()
    WHERE id = v_dispute.id;

    RETURN jsonb_build_object(
      'success', true,
      'dispute_id', v_dispute.id,
      'status', p_resolution_status,
      'refund_amount', v_refund_amt
    );
  END;
  $body$;

  REVOKE EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text, numeric) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text, numeric) TO authenticated;

  INSERT INTO supabase_migrations.schema_migrations(version)
  VALUES ('20261005100010')
  ON CONFLICT (version) DO NOTHING;
END $$;
