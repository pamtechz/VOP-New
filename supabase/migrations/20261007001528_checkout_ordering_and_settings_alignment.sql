-- Migration: apply corrected checkout ordering and canonical setting parsing to existing deployments
BEGIN;

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
  v_item record;
  v_prod record;
  v_variant record;
  v_inv record;
  v_unit_price numeric(12,2);
  v_item_subtotal numeric(12,2);
  v_total_amount numeric(12,2) := 0.00;
  v_total_shipping numeric(12,2) := 0.00;
  v_store_shipping numeric(12,2) := 0.00;
  v_store_items_map jsonb := '{}'::jsonb;
  v_store_id uuid;
  v_store_record record;
  v_seller_order_id uuid;
  v_seller_order_ref text;
  v_store_subtotal numeric(12,2);
  v_commission_bps integer := 500;
  v_commission_rate numeric(6,4);
  v_default_delivery_fee numeric(12,2) := 25.00;
  v_currency text := 'ZMW';
  v_store_commission numeric(12,2);
  v_store_proceeds numeric(12,2);
  v_expires_at timestamptz;
BEGIN
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

  -- Read canonical marketplace settings using scalar-safe JSON parsing.
  SELECT COALESCE(
    CASE jsonb_typeof(value)
      WHEN 'number' THEN (value::text)::integer
      WHEN 'string' THEN trim(both '"' from value::text)::integer
      ELSE 500
    END,
    500
  )
  INTO v_commission_bps
  FROM public.platform_settings
  WHERE key = 'marketplace_commission_bps';

  v_commission_bps := COALESCE(v_commission_bps, 500);
  IF v_commission_bps < 0 OR v_commission_bps > 10000 THEN
    RAISE EXCEPTION 'Configured marketplace commission is outside the valid 0-10000 bps range';
  END IF;

  SELECT COALESCE(
    CASE jsonb_typeof(value)
      WHEN 'number' THEN (value::text)::numeric
      WHEN 'string' THEN trim(both '"' from value::text)::numeric
      ELSE 25.00
    END,
    25.00
  )
  INTO v_default_delivery_fee
  FROM public.platform_settings
  WHERE key = 'default_delivery_fee';
  v_default_delivery_fee := COALESCE(v_default_delivery_fee, 25.00);

  SELECT COALESCE(
    CASE jsonb_typeof(value)
      WHEN 'string' THEN trim(both '"' from value::text)
      ELSE NULL
    END,
    'ZMW'
  )
  INTO v_currency
  FROM public.platform_settings
  WHERE key = 'default_currency';
  v_currency := COALESCE(NULLIF(v_currency, ''), 'ZMW');

  IF p_delivery_method NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Unsupported delivery method: %', p_delivery_method;
  END IF;

  v_commission_rate := v_commission_bps::numeric / 10000.0;
  v_expires_at := now() + interval '30 minutes';

  -- Create parent order skeleton
  v_parent_order_id := gen_random_uuid();
  v_parent_order_ref := 'ORD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- 1. Insert parent order skeleton FIRST so child foreign keys (inventory_reservations) succeed
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
    0.00,
    0.00,
    0.00,
    'unpaid',
    p_payment_method,
    now(),
    now()
  );

  -- 2. Loop through items to validate and reserve
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
      v_store_shipping := COALESCE(v_store_record.delivery_fee, v_default_delivery_fee);
    END IF;
    v_total_shipping := v_total_shipping + v_store_shipping;
  END LOOP;

  v_total_amount := v_total_amount + v_total_shipping;

  -- 3. Update parent order with finalized totals
  UPDATE public.orders
  SET total_amount = v_total_amount,
      shipping_amount = v_total_shipping,
      updated_at = now()
  WHERE id = v_parent_order_id;

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
      v_store_shipping := COALESCE(v_store_record.delivery_fee, v_default_delivery_fee);
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
    'currency', v_currency,
    'status', 'pending',
    'payment_status', 'unpaid',
    'reservation_expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_server_checkout(jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_server_checkout(jsonb, jsonb, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
