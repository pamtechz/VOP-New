-- Migration: 20261005100004_checkout_reservations_settlement_and_store_onboarding
-- Description: Implement server-authoritative checkout, inventory reservations, private payment settlement, store onboarding, and financial RLS

BEGIN;

-- 1. Ensure inventory_reservations table exists
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  reserved_quantity integer NOT NULL CHECK (reserved_quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'committed', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_inventory_id ON public.inventory_reservations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires ON public.inventory_reservations(status, expires_at);

-- 2. Delivery configuration columns on stores
ALTER TABLE public.stores 
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS allows_pickup boolean NOT NULL DEFAULT true;

-- 3. Unique index to prevent duplicate successful payments per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_succeeded 
  ON public.payments(order_id) WHERE status = 'succeeded';

-- Unique active subscription per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_store_active 
  ON public.subscriptions(store_id) WHERE status = 'active';

-- Seed free subscriptions for existing stores if missing
INSERT INTO public.subscriptions (store_id, plan_id, status, current_period_start, current_period_end, auto_renew)
SELECT 
  s.id,
  p.id,
  'active',
  now(),
  now() + interval '100 years',
  true
FROM public.stores s
CROSS JOIN (SELECT id FROM public.subscription_plans WHERE code = 'free' LIMIT 1) p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions sub WHERE sub.store_id = s.id AND sub.status = 'active'
);

-- Seed default delivery fee if missing
INSERT INTO public.platform_settings (key, value, description)
VALUES ('default_delivery_fee', '25.00'::jsonb, 'Default delivery fee in base currency')
ON CONFLICT (key) DO NOTHING;

-- 4. Authoritative Checkout RPC
CREATE OR REPLACE FUNCTION public.create_server_checkout(
  p_items jsonb,
  p_shipping_address jsonb,
  p_delivery_method text DEFAULT 'delivery',
  p_payment_method text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_buyer_id uuid;
  v_buyer_name text;
  v_buyer_phone text;
  v_parent_order_id uuid;
  v_parent_order_ref text;
  v_total_amount numeric := 0;
  v_total_shipping numeric := 0;
  v_commission_bps integer := 500;
  v_commission_rate numeric;
  v_item record;
  v_prod record;
  v_variant record;
  v_inv record;
  v_unit_price numeric;
  v_item_subtotal numeric;
  v_store_id uuid;
  v_seller_orders_map jsonb := '{}'::jsonb;
  v_store_items_map jsonb := '{}'::jsonb;
  v_store_record record;
  v_seller_order_id uuid;
  v_seller_order_ref text;
  v_store_subtotal numeric;
  v_store_shipping numeric;
  v_store_commission numeric;
  v_store_proceeds numeric;
  v_expires_at timestamptz;
BEGIN
  -- Authenticate buyer
  v_buyer_id := (SELECT auth.uid());
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to checkout';
  END IF;

  SELECT full_name, phone INTO v_buyer_name, v_buyer_phone
  FROM public.profiles
  WHERE id = v_buyer_id;

  v_buyer_name := COALESCE(v_buyer_name, 'Buyer');
  v_buyer_phone := COALESCE(v_buyer_phone, p_shipping_address->>'phone', '');

  -- Validate cart items input
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot checkout with an empty cart';
  END IF;

  -- Read marketplace commission from configuration
  SELECT COALESCE((value->>0)::integer, 500) INTO v_commission_bps
  FROM public.platform_settings
  WHERE key = 'marketplace_commission_bps';

  v_commission_rate := v_commission_bps::numeric / 10000.0;
  v_expires_at := now() + interval '30 minutes';

  -- Create parent order skeleton
  v_parent_order_id := gen_random_uuid();
  v_parent_order_ref := 'ORD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- Loop through items to validate and reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid,
    variant_id uuid,
    quantity integer
  )
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity: %', v_item.quantity;
    END IF;

    -- Validate product and store
    SELECT p.id, p.store_id, p.title, p.price, p.status, s.status AS store_status, s.delivery_fee, s.allows_pickup
    INTO v_prod
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
    WHERE p.id = v_item.product_id;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'Product % not found', v_item.product_id;
    END IF;

    IF v_prod.status != 'active' THEN
      RAISE EXCEPTION 'Product "%" is not currently active for purchase', v_prod.title;
    END IF;

    IF v_prod.store_status != 'active' THEN
      RAISE EXCEPTION 'Store for product "%" is not currently active', v_prod.title;
    END IF;

    -- Resolve authoritative unit price (variant override if exists)
    v_unit_price := v_prod.price;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT id, title, price INTO v_variant
      FROM public.product_variants
      WHERE id = v_item.variant_id AND product_id = v_prod.id;

      IF v_variant.id IS NULL THEN
        RAISE EXCEPTION 'Variant % not found for product %', v_item.variant_id, v_prod.title;
      END IF;

      IF v_variant.price IS NOT NULL THEN
        v_unit_price := v_variant.price;
      END IF;
    END IF;

    -- Atomically lock and validate inventory row
    SELECT id, quantity, reserved_quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_prod.id 
      AND (
        (v_item.variant_id IS NOT NULL AND variant_id = v_item.variant_id) OR
        (v_item.variant_id IS NULL AND variant_id IS NULL)
      )
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Inventory record missing for product "%"', v_prod.title;
    END IF;

    IF (v_inv.quantity - v_inv.reserved_quantity) < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Available: %, Requested: %',
        v_prod.title, (v_inv.quantity - v_inv.reserved_quantity), v_item.quantity;
    END IF;

    -- Reserve inventory
    UPDATE public.inventory
    SET reserved_quantity = reserved_quantity + v_item.quantity,
        updated_at = now()
    WHERE id = v_inv.id;

    INSERT INTO public.inventory_reservations (
      order_id,
      inventory_id,
      product_id,
      variant_id,
      reserved_quantity,
      status,
      expires_at
    ) VALUES (
      v_parent_order_id,
      v_inv.id,
      v_prod.id,
      v_item.variant_id,
      v_item.quantity,
      'active',
      v_expires_at
    );

    v_item_subtotal := v_unit_price * v_item.quantity;
    v_total_amount := v_total_amount + v_item_subtotal;

    -- Group items by store
    v_store_id := v_prod.store_id;
    IF NOT (v_store_items_map ? v_store_id::text) THEN
      v_store_items_map := jsonb_set(v_store_items_map, ARRAY[v_store_id::text], '[]'::jsonb);
    END IF;

    v_store_items_map := jsonb_set(
      v_store_items_map,
      ARRAY[v_store_id::text],
      (v_store_items_map->v_store_id::text) || jsonb_build_object(
        'product_id', v_prod.id,
        'product_title', v_prod.title,
        'variant_title', CASE WHEN v_item.variant_id IS NOT NULL THEN v_variant.title ELSE NULL END,
        'quantity', v_item.quantity,
        'unit_price', v_unit_price,
        'commission_rate', v_commission_rate
      )
    );
  END LOOP;

  -- Calculate shipping per store
  FOR v_store_record IN 
    SELECT s.id, s.delivery_fee, s.allows_pickup
    FROM public.stores s
    WHERE s.id IN (SELECT jsonb_object_keys(v_store_items_map)::uuid)
  LOOP
    IF p_delivery_method = 'pickup' THEN
      v_store_shipping := 0.00;
    ELSE
      v_store_shipping := COALESCE(v_store_record.delivery_fee, 25.00);
    END IF;
    v_total_shipping := v_total_shipping + v_store_shipping;
  END LOOP;

  v_total_amount := v_total_amount + v_total_shipping;

  -- Insert parent order
  INSERT INTO public.orders (
    id,
    public_ref,
    buyer_id,
    buyer_name,
    buyer_phone,
    shipping_address,
    status,
    total_amount,
    discount_amount,
    shipping_amount,
    payment_status,
    payment_method,
    created_at,
    updated_at
  ) VALUES (
    v_parent_order_id,
    v_parent_order_ref,
    v_buyer_id,
    v_buyer_name,
    v_buyer_phone,
    p_shipping_address,
    'pending',
    v_total_amount,
    0.00,
    v_total_shipping,
    'unpaid',
    p_payment_method,
    now(),
    now()
  );

  -- Insert seller orders and order items
  FOR v_store_record IN 
    SELECT s.id, s.delivery_fee, s.allows_pickup
    FROM public.stores s
    WHERE s.id IN (SELECT jsonb_object_keys(v_store_items_map)::uuid)
  LOOP
    v_store_id := v_store_record.id;
    v_seller_order_id := gen_random_uuid();
    v_seller_order_ref := 'ORD-S-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

    IF p_delivery_method = 'pickup' THEN
      v_store_shipping := 0.00;
    ELSE
      v_store_shipping := COALESCE(v_store_record.delivery_fee, 25.00);
    END IF;

    -- Calculate store subtotal
    SELECT COALESCE(SUM((item->>'quantity')::integer * (item->>'unit_price')::numeric), 0)
    INTO v_store_subtotal
    FROM jsonb_array_elements(v_store_items_map->v_store_id::text) AS item;

    v_store_commission := ROUND(v_store_subtotal * v_commission_rate, 2);
    v_store_proceeds := (v_store_subtotal - v_store_commission) + v_store_shipping;

    INSERT INTO public.seller_orders (
      id,
      public_ref,
      parent_order_id,
      store_id,
      status,
      subtotal,
      shipping_fee,
      platform_commission_rate,
      platform_commission_amount,
      seller_proceeds,
      created_at,
      updated_at
    ) VALUES (
      v_seller_order_id,
      v_seller_order_ref,
      v_parent_order_id,
      v_store_id,
      'pending',
      v_store_subtotal,
      v_store_shipping,
      v_commission_rate,
      v_store_commission,
      v_store_proceeds,
      now(),
      now()
    );

    -- Insert order items
    INSERT INTO public.order_items (
      id,
      seller_order_id,
      product_id,
      product_name_at_purchase,
      variant_name_at_purchase,
      quantity,
      unit_price,
      commission_rate_applied,
      created_at
    )
    SELECT
      gen_random_uuid(),
      v_seller_order_id,
      (item->>'product_id')::uuid,
      item->>'product_title',
      item->>'variant_title',
      (item->>'quantity')::integer,
      (item->>'unit_price')::numeric,
      v_commission_rate,
      now()
    FROM jsonb_array_elements(v_store_items_map->v_store_id::text) AS item;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_parent_order_id,
    'public_ref', v_parent_order_ref,
    'total_amount', v_total_amount,
    'shipping_amount', v_total_shipping,
    'currency', 'ZMW',
    'status', 'pending',
    'payment_status', 'unpaid',
    'reservation_expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_server_checkout(jsonb, jsonb, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_server_checkout(jsonb, jsonb, text, text) FROM anon;

-- 5. Release Expired Reservations RPC
CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res record;
  v_count integer := 0;
BEGIN
  FOR v_res IN
    SELECT r.id, r.inventory_id, r.order_id, r.reserved_quantity
    FROM public.inventory_reservations r
    WHERE r.status = 'active' AND r.expires_at < now()
    FOR UPDATE
  LOOP
    -- Restore inventory
    UPDATE public.inventory
    SET reserved_quantity = GREATEST(0, reserved_quantity - v_res.reserved_quantity),
        updated_at = now()
    WHERE id = v_res.inventory_id;

    -- Mark reservation released
    UPDATE public.inventory_reservations
    SET status = 'released', updated_at = now()
    WHERE id = v_res.id;

    -- Mark order cancelled if unpaid
    UPDATE public.orders
    SET status = 'cancelled', payment_status = 'unpaid', updated_at = now()
    WHERE id = v_res.order_id AND payment_status = 'unpaid';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6. Private Payment Settlement RPC (Service-Role Only)
CREATE OR REPLACE FUNCTION private.fulfill_verified_payment(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_amount numeric,
  p_currency text,
  p_event_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_order record;
  v_payment_id uuid;
  v_payment_ref text;
  v_res record;
  v_sorder record;
  v_wallet record;
  v_existing_payment record;
BEGIN
  -- 1. Lock order row
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 2. Check if already settled (idempotency)
  SELECT * INTO v_existing_payment
  FROM public.payments
  WHERE order_id = p_order_id AND status = 'succeeded';

  IF v_existing_payment.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_processed',
      'order_id', p_order_id,
      'payment_id', v_existing_payment.id,
      'transaction_id', v_existing_payment.transaction_id
    );
  END IF;

  -- 3. Verify order is awaiting payment
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Order % is already marked paid', p_order_id;
  END IF;

  -- 4. Verify amount strictly matches
  IF v_order.total_amount != p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch: expected %, received %', v_order.total_amount, p_amount;
  END IF;

  -- 5. Verify currency (ZMW standard)
  IF p_currency IS NOT NULL AND upper(p_currency) != 'ZMW' THEN
    RAISE EXCEPTION 'Currency mismatch: expected ZMW, received %', p_currency;
  END IF;

  -- 6. Check provider transaction uniqueness
  IF EXISTS (SELECT 1 FROM public.payments WHERE transaction_id = p_transaction_id AND status = 'succeeded') THEN
    RAISE EXCEPTION 'Transaction % has already been processed', p_transaction_id;
  END IF;

  -- 7. Create payment record
  v_payment_id := gen_random_uuid();
  v_payment_ref := 'PAY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.payments (
    id,
    public_ref,
    order_id,
    provider,
    transaction_id,
    amount,
    currency,
    status,
    created_at
  ) VALUES (
    v_payment_id,
    v_payment_ref,
    p_order_id,
    p_provider,
    p_transaction_id,
    p_amount,
    COALESCE(p_currency, 'ZMW'),
    'succeeded',
    now()
  );

  -- 8. Create immutable payment event
  INSERT INTO public.payment_events (
    id,
    payment_id,
    provider_event_id,
    event_type,
    payload,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_payment_id,
    p_transaction_id,
    'payment.succeeded',
    p_event_payload,
    now()
  );

  -- 9. Mark orders paid and processing
  UPDATE public.orders
  SET payment_status = 'paid',
      status = 'processing',
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.seller_orders
  SET status = 'processing',
      updated_at = now()
  WHERE parent_order_id = p_order_id;

  -- 10. Commit inventory reservations (deduct physical quantity and reserved quantity)
  FOR v_res IN
    SELECT id, inventory_id, reserved_quantity
    FROM public.inventory_reservations
    WHERE order_id = p_order_id AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE public.inventory
    SET quantity = GREATEST(0, quantity - v_res.reserved_quantity),
        reserved_quantity = GREATEST(0, reserved_quantity - v_res.reserved_quantity),
        updated_at = now()
    WHERE id = v_res.inventory_id;

    UPDATE public.inventory_reservations
    SET status = 'committed', updated_at = now()
    WHERE id = v_res.id;
  END LOOP;

  -- 11. Credit pending balance to each seller wallet with immutable ledger entries
  FOR v_sorder IN
    SELECT id, store_id, public_ref, seller_proceeds
    FROM public.seller_orders
    WHERE parent_order_id = p_order_id
  LOOP
    -- Ensure wallet exists
    INSERT INTO public.wallet_accounts (store_id, balance_available, balance_pending)
    VALUES (v_sorder.store_id, 0.00, 0.00)
    ON CONFLICT (store_id) DO NOTHING;

    -- Lock wallet
    SELECT id, balance_pending, balance_available INTO v_wallet
    FROM public.wallet_accounts
    WHERE store_id = v_sorder.store_id
    FOR UPDATE;

    -- Credit pending balance
    UPDATE public.wallet_accounts
    SET balance_pending = balance_pending + v_sorder.seller_proceeds,
        updated_at = now()
    WHERE id = v_wallet.id;

    -- Immutable ledger debit/credit entry
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
      'seller_order',
      v_sorder.id,
      'credit_proceeds',
      v_sorder.seller_proceeds,
      v_wallet.balance_pending + v_sorder.seller_proceeds,
      'Pending proceeds for seller order ' || v_sorder.public_ref,
      now()
    );
  END LOOP;

  -- 12. Clear buyer's cart items
  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_order.buyer_id);

  RETURN jsonb_build_object(
    'status', 'succeeded',
    'order_id', p_order_id,
    'payment_id', v_payment_id,
    'transaction_id', p_transaction_id,
    'amount', p_amount
  );
END;
$$;

-- Restrict private settlement: ONLY service_role
REVOKE ALL ON FUNCTION private.fulfill_verified_payment(uuid, text, text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fulfill_verified_payment(uuid, text, text, numeric, text, jsonb) TO service_role;

-- 7. Store Onboarding RPC (Phase 13 & 15)
CREATE OR REPLACE FUNCTION public.start_selling_onboard_store(
  p_name text,
  p_description text DEFAULT '',
  p_city text DEFAULT 'Lusaka',
  p_province text DEFAULT 'Lusaka',
  p_area text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_store_ref text;
  v_slug text;
  v_free_plan_id uuid;
  v_wallet_id uuid;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a store';
  END IF;

  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Store name cannot be empty';
  END IF;

  -- Generate slug and ref
  v_store_id := gen_random_uuid();
  v_store_ref := 'STR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 4);

  -- Insert store
  INSERT INTO public.stores (
    id,
    public_ref,
    owner_id,
    name,
    slug,
    description,
    province,
    city,
    area,
    status,
    total_sales,
    rating_avg,
    rating_count,
    created_at,
    updated_at
  ) VALUES (
    v_store_id,
    v_store_ref,
    v_user_id,
    p_name,
    v_slug,
    p_description,
    p_province,
    p_city,
    p_area,
    'active',
    0.00,
    0.00,
    0,
    now(),
    now()
  );

  -- Insert owner into store_members
  INSERT INTO public.store_members (
    id,
    store_id,
    user_id,
    role,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_store_id,
    v_user_id,
    'owner',
    now()
  );

  -- Find free plan
  SELECT id INTO v_free_plan_id
  FROM public.subscription_plans
  WHERE code = 'free'
  LIMIT 1;

  -- Create active Free subscription automatically
  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      id,
      store_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      auto_renew,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_store_id,
      v_free_plan_id,
      'active',
      now(),
      now() + interval '100 years',
      true,
      now()
    );
  END IF;

  -- Initialize wallet account
  v_wallet_id := gen_random_uuid();
  INSERT INTO public.wallet_accounts (
    id,
    store_id,
    balance_available,
    balance_pending,
    updated_at
  ) VALUES (
    v_wallet_id,
    v_store_id,
    0.00,
    0.00,
    now()
  );

  -- Update profile role to seller if currently user
  UPDATE public.profiles
  SET role = 'seller', updated_at = now()
  WHERE id = v_user_id AND role = 'user';

  RETURN jsonb_build_object(
    'store_id', v_store_id,
    'public_ref', v_store_ref,
    'name', p_name,
    'slug', v_slug,
    'status', 'active',
    'wallet_id', v_wallet_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_selling_onboard_store(text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.start_selling_onboard_store(text, text, text, text, text) FROM anon;

-- 8. Payout Request RPC (Phase 20)
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
  v_user_id uuid;
  v_wallet record;
  v_min_payout numeric := 100.00;
  v_payout_id uuid;
  v_payout_ref text;
BEGIN
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

  -- Read minimum payout from settings
  SELECT COALESCE((value->>0)::numeric, 100.00) INTO v_min_payout
  FROM public.platform_settings
  WHERE key = 'minimum_payout_amount';

  IF p_amount < v_min_payout THEN
    RAISE EXCEPTION 'Requested amount % is below the minimum payout threshold of %', p_amount, v_min_payout;
  END IF;

  -- Lock wallet
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

  -- Deduct available balance and reserve for payout
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
    p_destination_info,
    now()
  );

  -- Record debit in ledger
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
    p_amount,
    v_wallet.balance_available - p_amount,
    'Payout request ' || v_payout_ref,
    now()
  );

  RETURN jsonb_build_object(
    'payout_id', v_payout_id,
    'public_ref', v_payout_ref,
    'amount', p_amount,
    'status', 'pending',
    'balance_available_remaining', v_wallet.balance_available - p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout(uuid, numeric, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_payout(uuid, numeric, jsonb) FROM anon;

-- 9. Settle Pending Proceeds Batch (Phase 19, T+2 Engine)
CREATE OR REPLACE FUNCTION private.settle_seller_proceeds_batch()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_sorder record;
  v_wallet record;
  v_settlement_days integer := 2;
  v_count integer := 0;
BEGIN
  -- Read settlement period
  SELECT COALESCE((value->>0)::integer, 2) INTO v_settlement_days
  FROM public.platform_settings
  WHERE key = 'settlement_period_days';

  -- Find orders eligible for settlement (processing/shipped/delivered and paid >= settlement_days ago)
  FOR v_sorder IN
    SELECT so.id, so.store_id, so.public_ref, so.seller_proceeds
    FROM public.seller_orders so
    JOIN public.orders po ON po.id = so.parent_order_id
    WHERE po.payment_status = 'paid'
      AND so.status NOT IN ('cancelled', 'disputed')
      AND po.updated_at <= (now() - (v_settlement_days || ' days')::interval)
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_ledger wl
        WHERE wl.reference_id = so.id AND wl.type = 'credit_adjustment' AND wl.description LIKE 'Settled proceeds%'
      )
    FOR UPDATE OF so
  LOOP
    -- Lock wallet
    SELECT id, balance_pending, balance_available INTO v_wallet
    FROM public.wallet_accounts
    WHERE store_id = v_sorder.store_id
    FOR UPDATE;

    IF v_wallet.id IS NOT NULL AND v_wallet.balance_pending >= v_sorder.seller_proceeds THEN
      -- Move from pending to available
      UPDATE public.wallet_accounts
      SET balance_pending = balance_pending - v_sorder.seller_proceeds,
          balance_available = balance_available + v_sorder.seller_proceeds,
          updated_at = now()
      WHERE id = v_wallet.id;

      -- Record settlement ledger entry
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
        'seller_order',
        v_sorder.id,
        'credit_adjustment',
        v_sorder.seller_proceeds,
        v_wallet.balance_available + v_sorder.seller_proceeds,
        'Settled proceeds for seller order ' || v_sorder.public_ref,
        now()
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.settle_seller_proceeds_batch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.settle_seller_proceeds_batch() TO service_role;

-- 10. RLS Policies for Financial and Store Tables

-- INVENTORY
CREATE POLICY "inventory_select_active_products"
  ON public.inventory FOR SELECT
  TO public
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = inventory.product_id AND p.status = 'active'));

CREATE POLICY "inventory_store_owner_manage"
  ON public.inventory FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = inventory.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = inventory.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

-- PRODUCT VARIANTS
CREATE POLICY "variants_select_active"
  ON public.product_variants FOR SELECT
  TO public
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.status = 'active'));

CREATE POLICY "variants_store_owner_manage"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_variants.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_variants.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

-- STORE MEMBERS
CREATE POLICY "store_members_select_own"
  ON public.store_members FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id OR EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('stores.moderate'));

CREATE POLICY "store_members_owner_manage"
  ON public.store_members FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('stores.moderate'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('stores.moderate'));

-- WALLET ACCOUNTS (Read-only for store owners and finance staff; no client writes)
CREATE POLICY "wallet_accounts_select_owner"
  ON public.wallet_accounts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = wallet_accounts.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('finance.view'));

-- WALLET LEDGER (Append-only; read-only for store owners and finance staff; no client writes)
CREATE POLICY "wallet_ledger_select_owner"
  ON public.wallet_ledger FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wallet_accounts wa 
    JOIN public.stores s ON s.id = wa.store_id 
    WHERE wa.id = wallet_ledger.wallet_account_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('finance.view'));

-- PAYOUTS
CREATE POLICY "payouts_select_owner"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = payouts.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('payouts.approve'));

-- SUBSCRIPTIONS
CREATE POLICY "subscriptions_select_owner"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = subscriptions.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('stores.moderate'));

-- PAYMENTS & PAYMENT EVENTS (Staff finance view, buyer can view payment for their own order)
CREATE POLICY "payments_select_buyer_or_staff"
  ON public.payments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND o.buyer_id = (select auth.uid())
  ) OR public.has_capability('finance.view'));

CREATE POLICY "payment_events_select_staff"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (public.has_capability('finance.view'));

-- INVENTORY RESERVATIONS (Buyer or store owner can view)
CREATE POLICY "reservations_select_buyer_or_owner"
  ON public.inventory_reservations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = inventory_reservations.order_id AND o.buyer_id = (select auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = inventory_reservations.product_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('products.manage'));

-- Track migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261005100004',
  'checkout_reservations_settlement_and_store_onboarding',
  ARRAY['inventory_reservations', 'create_server_checkout', 'fulfill_verified_payment', 'start_selling_onboard_store', 'request_payout', 'settle_seller_proceeds_batch', 'financial_rls']
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
