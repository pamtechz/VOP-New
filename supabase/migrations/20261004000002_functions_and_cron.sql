-- Migration: 20261004000002_functions_and_cron.sql
-- Description: Advanced RPC Functions for Atomic Order Placement, Payment Ledger Fulfillment, Inactivity Batch Processing, and Base62 Short Links

-- -----------------------------------------------------------------------------
-- 1. ATOMIC MULTI-SELLER CHECKOUT & ORDER CREATION RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_multi_seller_order(
    p_buyer_id UUID,
    p_buyer_name TEXT,
    p_buyer_phone TEXT,
    p_shipping_address JSONB,
    p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB AS $$
DECLARE
    v_cart_id UUID;
    v_parent_order_id UUID;
    v_parent_public_ref TEXT;
    v_total_amount NUMERIC(14, 2) := 0.00;
    v_store_record RECORD;
    v_item_record RECORD;
    v_seller_order_id UUID;
    v_subtotal NUMERIC(14, 2);
    v_commission_rate NUMERIC(5, 4);
    v_commission_amount NUMERIC(14, 2);
    v_seller_proceeds NUMERIC(14, 2);
    v_default_commission NUMERIC(5, 4);
    v_seller_orders_summary JSONB := '[]'::jsonb;
BEGIN
    -- Get current default commission rate from platform settings
    SELECT (value::text)::numeric INTO v_default_commission
    FROM public.platform_settings
    WHERE key = 'default_commission_rate';
    IF v_default_commission IS NULL THEN
        v_default_commission := 0.0500;
    END IF;

    -- Fetch active cart for buyer
    SELECT id INTO v_cart_id
    FROM public.carts
    WHERE user_id = p_buyer_id;

    IF v_cart_id IS NULL THEN
        RAISE EXCEPTION 'Cart is empty or does not exist.';
    END IF;

    -- Verify stock for all cart items (Locking inventory rows to prevent race conditions)
    FOR v_item_record IN
        SELECT ci.product_id, ci.variant_id, ci.quantity, p.title, p.price, inv.quantity as available_stock
        FROM public.cart_items ci
        JOIN public.products p ON ci.product_id = p.id
        JOIN public.inventory inv ON inv.product_id = p.id AND (inv.variant_id IS NOT DISTINCT FROM ci.variant_id)
        WHERE ci.cart_id = v_cart_id
        FOR UPDATE OF inv
    LOOP
        IF v_item_record.available_stock < v_item_record.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product "%": Requested %, Available %',
                v_item_record.title, v_item_record.quantity, v_item_record.available_stock;
        END IF;
    END LOOP;

    -- Create Parent Order
    v_parent_public_ref := 'ORD-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5));
    INSERT INTO public.orders (
        public_ref, buyer_id, buyer_name, buyer_phone, shipping_address, status, total_amount, payment_status, payment_method
    ) VALUES (
        v_parent_public_ref, p_buyer_id, p_buyer_name, p_buyer_phone, p_shipping_address, 'pending', 0.00, 'unpaid', p_payment_method
    ) RETURNING id INTO v_parent_order_id;

    -- Group items by Store & Create Seller Sub-Orders
    FOR v_store_record IN
        SELECT DISTINCT p.store_id
        FROM public.cart_items ci
        JOIN public.products p ON ci.product_id = p.id
        WHERE ci.cart_id = v_cart_id
    LOOP
        v_subtotal := 0.00;
        
        -- Calculate store subtotal
        SELECT SUM(p.price * ci.quantity) INTO v_subtotal
        FROM public.cart_items ci
        JOIN public.products p ON ci.product_id = p.id
        WHERE ci.cart_id = v_cart_id AND p.store_id = v_store_record.store_id;

        v_commission_rate := v_default_commission;
        v_commission_amount := ROUND((v_subtotal * v_commission_rate)::numeric, 2);
        v_seller_proceeds := v_subtotal - v_commission_amount;

        -- Insert Seller Sub-Order
        INSERT INTO public.seller_orders (
            parent_order_id, store_id, status, subtotal, shipping_fee,
            platform_commission_rate, platform_commission_amount, seller_proceeds
        ) VALUES (
            v_parent_order_id, v_store_record.store_id, 'pending', v_subtotal, 0.00,
            v_commission_rate, v_commission_amount, v_seller_proceeds
        ) RETURNING id INTO v_seller_order_id;

        -- Insert Line Items & Deduct Reserved Inventory
        FOR v_item_record IN
            SELECT ci.product_id, ci.variant_id, ci.quantity, p.title, p.price, pv.title as variant_title
            FROM public.cart_items ci
            JOIN public.products p ON ci.product_id = p.id
            LEFT JOIN public.product_variants pv ON ci.variant_id = pv.id
            WHERE ci.cart_id = v_cart_id AND p.store_id = v_store_record.store_id
        LOOP
            INSERT INTO public.order_items (
                seller_order_id, product_id, product_name_at_purchase, variant_name_at_purchase,
                quantity, unit_price, commission_rate_applied
            ) VALUES (
                v_seller_order_id, v_item_record.product_id, v_item_record.title, v_item_record.variant_title,
                v_item_record.quantity, v_item_record.price, v_commission_rate
            );

            -- Deduct physical inventory
            UPDATE public.inventory
            SET quantity = quantity - v_item_record.quantity,
                updated_at = NOW()
            WHERE product_id = v_item_record.product_id AND (variant_id IS NOT DISTINCT FROM v_item_record.variant_id);
        END LOOP;

        v_total_amount := v_total_amount + v_subtotal;
        v_seller_orders_summary := v_seller_orders_summary || jsonb_build_object(
            'seller_order_id', v_seller_order_id,
            'store_id', v_store_record.store_id,
            'subtotal', v_subtotal,
            'commission', v_commission_amount,
            'seller_proceeds', v_seller_proceeds
        );
    END LOOP;

    -- Update Parent Order Total
    UPDATE public.orders
    SET total_amount = v_total_amount
    WHERE id = v_parent_order_id;

    -- Empty Buyer Cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

    -- Touch user activity timestamp
    PERFORM public.touch_user_activity(p_buyer_id);

    RETURN jsonb_build_object(
        'parent_order_id', v_parent_order_id,
        'public_ref', v_parent_public_ref,
        'total_amount', v_total_amount,
        'seller_orders', v_seller_orders_summary
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 2. ATOMIC PAYMENT VERIFICATION & WALLET LEDGER CREDIT RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_payment_and_credit_ledger(
    p_order_id UUID,
    p_provider TEXT,
    p_transaction_id TEXT,
    p_amount NUMERIC(14, 2),
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_payment_id UUID;
    v_order_status TEXT;
    v_so RECORD;
    v_wallet_id UUID;
    v_new_balance NUMERIC(14, 2);
BEGIN
    -- Idempotency Check: Verify if payment transaction already processed
    IF EXISTS (SELECT 1 FROM public.payments WHERE transaction_id = p_transaction_id) THEN
        RETURN jsonb_build_object('status', 'already_processed', 'transaction_id', p_transaction_id);
    END IF;

    -- Create Payment Record
    INSERT INTO public.payments (
        order_id, provider, transaction_id, amount, status
    ) VALUES (
        p_order_id, p_provider, p_transaction_id, p_amount, 'succeeded'
    ) RETURNING id INTO v_payment_id;

    -- Save Provider Webhook Event Audit Log
    INSERT INTO public.payment_events (payment_id, provider_event_id, event_type, payload)
    VALUES (v_payment_id, p_transaction_id, 'payment.succeeded', p_payload)
    ON CONFLICT (provider_event_id) DO NOTHING;

    -- Update Parent Order Status
    UPDATE public.orders
    SET payment_status = 'paid',
        status = 'processing',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Update Seller Sub-Orders & Credit Seller Wallets
    FOR v_so IN
        SELECT id, store_id, seller_proceeds, public_ref
        FROM public.seller_orders
        WHERE parent_order_id = p_order_id
    LOOP
        UPDATE public.seller_orders
        SET status = 'processing',
            updated_at = NOW()
        WHERE id = v_so.id;

        -- Get or Create Store Wallet Account
        INSERT INTO public.wallet_accounts (store_id, balance_available, balance_pending)
        VALUES (v_so.store_id, 0.00, v_so.seller_proceeds)
        ON CONFLICT (store_id) DO UPDATE SET
            balance_pending = wallet_accounts.balance_pending + EXCLUDED.balance_pending,
            updated_at = NOW()
        RETURNING id, (balance_available + balance_pending) INTO v_wallet_id, v_new_balance;

        -- Record Immutable Wallet Ledger Entry
        INSERT INTO public.wallet_ledger (
            wallet_account_id, reference_type, reference_id, type, amount, balance_after, description
        ) VALUES (
            v_wallet_id, 'seller_order', v_so.id, 'credit_proceeds', v_so.seller_proceeds, v_new_balance,
            'Proceeds credit for Seller Order ' || v_so.public_ref
        );
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'payment_id', v_payment_id,
        'order_id', p_order_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 3. BASE62 CANONICAL SHORT LINK GENERATOR / REUSER RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_short_link(
    p_destination_type TEXT,
    p_destination_id UUID,
    p_external_url TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_existing_code TEXT;
    v_new_code TEXT;
    v_link_id UUID;
    v_chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    v_rand INT;
    i INT;
BEGIN
    -- Check if canonical short link already exists for entity
    IF p_destination_type IN ('product', 'store', 'category', 'campaign') AND p_destination_id IS NOT NULL THEN
        SELECT id, code INTO v_link_id, v_existing_code
        FROM public.short_links
        WHERE destination_type = p_destination_type AND destination_id = p_destination_id AND is_active = TRUE;

        IF v_existing_code IS NOT NULL THEN
            RETURN jsonb_build_object('id', v_link_id, 'code', v_existing_code, 'reused', true);
        END IF;
    END IF;

    -- Generate Base62 6-character entropy short code
    v_new_code := '';
    FOR i IN 1..6 LOOP
        v_rand := FLOOR(RANDOM() * 62)::int + 1;
        v_new_code := v_new_code || SUBSTRING(v_chars FROM v_rand FOR 1);
    END LOOP;

    INSERT INTO public.short_links (
        code, destination_type, destination_id, external_url, created_by
    ) VALUES (
        v_new_code, p_destination_type, p_destination_id, p_external_url, p_created_by
    ) RETURNING id, code INTO v_link_id, v_new_code;

    RETURN jsonb_build_object('id', v_link_id, 'code', v_new_code, 'reused', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. BATCH ACCOUNT INACTIVITY & WARNING WORKER RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_account_inactivity_batch(p_batch_size INT DEFAULT 50)
RETURNS JSONB AS $$
DECLARE
    v_account RECORD;
    v_processed_count INT := 0;
    v_warnings_sent INT := 0;
    v_deletions_executed INT := 0;
    v_days_left INT;
    v_next_action TIMESTAMPTZ;
    v_has_hold BOOLEAN;
    v_hold_reason TEXT;
BEGIN
    FOR v_account IN
        SELECT user_id, last_active_at, deletion_due_at, warning_stage, deletion_hold
        FROM public.account_lifecycle
        WHERE exempt = FALSE
          AND next_action_at <= NOW()
        ORDER BY next_action_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    LOOP
        v_processed_count := v_processed_count + 1;
        v_days_left := EXTRACT(DAY FROM (v_account.deletion_due_at - NOW()))::int;

        IF v_days_left > 14 THEN
            v_next_action := v_account.deletion_due_at - INTERVAL '14 days';
            UPDATE public.account_lifecycle SET next_action_at = v_next_action WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 14 AND v_days_left > 7 AND v_account.warning_stage < 1 THEN
            -- Issue T-14 days warning
            INSERT INTO public.notifications (user_id, type, title, body)
            VALUES (v_account.user_id, 'inactivity_warning', 'Account Inactivity Warning', 'Your account has been inactive. It will be scheduled for deletion in 14 days unless you log in or tap Keep My Account.');
            v_warnings_sent := v_warnings_sent + 1;
            UPDATE public.account_lifecycle SET warning_stage = 1, next_action_at = v_account.deletion_due_at - INTERVAL '7 days' WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 7 AND v_days_left > 3 AND v_account.warning_stage < 2 THEN
            -- Issue T-7 days warning
            INSERT INTO public.notifications (user_id, type, title, body)
            VALUES (v_account.user_id, 'inactivity_warning', '7 Days Until Account Deletion', 'Your account will be deleted in 7 days due to inactivity.');
            v_warnings_sent := v_warnings_sent + 1;
            UPDATE public.account_lifecycle SET warning_stage = 2, next_action_at = v_account.deletion_due_at - INTERVAL '3 days' WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 3 AND v_days_left > 2 AND v_account.warning_stage < 3 THEN
            -- Issue T-3 days warning
            INSERT INTO public.notifications (user_id, type, title, body)
            VALUES (v_account.user_id, 'inactivity_warning', '3 Days Until Account Deletion', 'Your marketplace account will be permanently deleted in 3 days.');
            v_warnings_sent := v_warnings_sent + 1;
            UPDATE public.account_lifecycle SET warning_stage = 3, next_action_at = v_account.deletion_due_at - INTERVAL '2 days' WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 2 AND v_days_left > 1 AND v_account.warning_stage < 4 THEN
            -- Issue T-2 days warning
            INSERT INTO public.notifications (user_id, type, title, body)
            VALUES (v_account.user_id, 'inactivity_warning', '2 Days Until Account Deletion', 'Final reminder: 2 days left to save your marketplace account.');
            v_warnings_sent := v_warnings_sent + 1;
            UPDATE public.account_lifecycle SET warning_stage = 4, next_action_at = v_account.deletion_due_at - INTERVAL '1 day' WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 1 AND v_days_left > 0 AND v_account.warning_stage < 5 THEN
            -- Issue T-1 day warning
            INSERT INTO public.notifications (user_id, type, title, body)
            VALUES (v_account.user_id, 'inactivity_warning', 'Account Deletion Tomorrow', 'Your account is scheduled for deletion tomorrow.');
            v_warnings_sent := v_warnings_sent + 1;
            UPDATE public.account_lifecycle SET warning_stage = 5, next_action_at = v_account.deletion_due_at WHERE user_id = v_account.user_id;

        ELSIF v_days_left <= 0 THEN
            -- T-0 Day: Check Holds before deletion
            v_has_hold := FALSE;
            v_hold_reason := NULL;

            -- Check active orders hold
            IF EXISTS (SELECT 1 FROM public.orders WHERE buyer_id = v_account.user_id AND status IN ('pending', 'processing')) THEN
                v_has_hold := TRUE;
                v_hold_reason := 'Active pending order in progress';
            ELSIF EXISTS (SELECT 1 FROM public.disputes WHERE buyer_id = v_account.user_id AND status IN ('open', 'under_review')) THEN
                v_has_hold := TRUE;
                v_hold_reason := 'Active unresolved dispute';
            END IF;

            IF v_has_hold THEN
                UPDATE public.account_lifecycle
                SET deletion_hold = TRUE, deletion_hold_reason = v_hold_reason, next_action_at = NOW() + INTERVAL '7 days'
                WHERE user_id = v_account.user_id;
            ELSE
                -- Execute Anonymization & Deletion Preparation
                UPDATE public.profiles
                SET full_name = 'Deleted User', avatar_url = NULL, phone = NULL
                WHERE id = v_account.user_id;

                -- Log Deletion Audit Record
                INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
                VALUES (v_account.user_id, 'ACCOUNT_DELETED_INACTIVITY', 'profile', v_account.user_id, jsonb_build_object('last_active', v_account.last_active_at));

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
