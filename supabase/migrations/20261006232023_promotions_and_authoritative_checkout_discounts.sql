-- Migration: production promotions and server-authoritative checkout discounts
BEGIN;

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(14,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  max_discount_amount numeric(14,2) CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_upper_unique
  ON public.promotions (upper(code));
CREATE INDEX IF NOT EXISTS promotions_active_window_idx
  ON public.promotions (is_active, starts_at, ends_at);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotions_select ON public.promotions;
DROP POLICY IF EXISTS promotions_insert ON public.promotions;
DROP POLICY IF EXISTS promotions_update ON public.promotions;
DROP POLICY IF EXISTS promotions_delete ON public.promotions;

CREATE POLICY promotions_select ON public.promotions
FOR SELECT TO public
USING (
  public.has_capability('advertising.manage')
  OR (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  )
);

CREATE POLICY promotions_insert ON public.promotions
FOR INSERT TO authenticated
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY promotions_update ON public.promotions
FOR UPDATE TO authenticated
USING (public.has_capability('advertising.manage'))
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY promotions_delete ON public.promotions
FOR DELETE TO authenticated
USING (public.has_capability('advertising.manage'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_code text;

ALTER TABLE public.seller_orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14,2) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0);

CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  discount_amount numeric(14,2) NOT NULL CHECK (discount_amount >= 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','committed','released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotion_redemptions_promotion_status_idx
  ON public.promotion_redemptions (promotion_id, status, expires_at);
CREATE INDEX IF NOT EXISTS promotion_redemptions_user_idx
  ON public.promotion_redemptions (promotion_id, user_id, status, expires_at);

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_redemptions_select ON public.promotion_redemptions;
CREATE POLICY promotion_redemptions_select ON public.promotion_redemptions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_capability('advertising.manage')
  OR public.has_capability('finance.view')
);

CREATE OR REPLACE FUNCTION public.create_server_checkout_with_promotion(
  p_items jsonb,
  p_shipping_address jsonb,
  p_delivery_method text DEFAULT 'delivery',
  p_payment_method text DEFAULT 'card',
  p_promotion_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_order_id uuid;
  v_buyer_id uuid := (SELECT auth.uid());
  v_promo public.promotions%ROWTYPE;
  v_code text;
  v_merchandise_subtotal numeric(14,2);
  v_discount numeric(14,2) := 0;
  v_discount_before_cap numeric(14,2) := 0;
  v_shipping numeric(14,2);
  v_total numeric(14,2);
  v_active_uses integer := 0;
  v_user_uses integer := 0;
  v_expiry timestamptz;
  v_store_count integer;
  v_store_index integer := 0;
  v_allocated numeric(14,2) := 0;
  v_store_discount numeric(14,2);
  v_so record;
  v_net_subtotal numeric(14,2);
  v_commission numeric(14,2);
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to checkout';
  END IF;

  -- Existing checkout remains the single source of truth for product prices,
  -- inventory locking, shipping and creation of parent/seller orders.
  v_result := public.create_server_checkout(
    p_items,
    p_shipping_address,
    p_delivery_method,
    p_payment_method
  );

  v_order_id := (v_result->>'order_id')::uuid;

  SELECT COALESCE(sum(subtotal), 0), count(*)
  INTO v_merchandise_subtotal, v_store_count
  FROM public.seller_orders
  WHERE parent_order_id = v_order_id;

  SELECT shipping_amount, total_amount
  INTO v_shipping, v_total
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  v_code := upper(btrim(COALESCE(p_promotion_code, '')));
  IF v_code = '' THEN
    RETURN v_result || jsonb_build_object(
      'discount_amount', 0,
      'promotion_code', NULL
    );
  END IF;

  SELECT *
  INTO v_promo
  FROM public.promotions
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF v_promo.id IS NULL
     OR v_promo.is_active IS NOT TRUE
     OR (v_promo.starts_at IS NOT NULL AND v_promo.starts_at > now())
     OR (v_promo.ends_at IS NOT NULL AND v_promo.ends_at < now()) THEN
    RAISE EXCEPTION 'Promotion code is invalid or not currently active';
  END IF;

  IF v_merchandise_subtotal < v_promo.min_order_amount THEN
    RAISE EXCEPTION 'Order subtotal must be at least % to use promotion %',
      v_promo.min_order_amount, v_promo.code;
  END IF;

  SELECT count(*)::integer INTO v_active_uses
  FROM public.promotion_redemptions
  WHERE promotion_id = v_promo.id
    AND (
      status = 'committed'
      OR (status = 'reserved' AND expires_at > now())
    );

  IF v_promo.usage_limit IS NOT NULL AND v_active_uses >= v_promo.usage_limit THEN
    RAISE EXCEPTION 'Promotion usage limit has been reached';
  END IF;

  SELECT count(*)::integer INTO v_user_uses
  FROM public.promotion_redemptions
  WHERE promotion_id = v_promo.id
    AND user_id = v_buyer_id
    AND (
      status = 'committed'
      OR (status = 'reserved' AND expires_at > now())
    );

  IF v_user_uses >= v_promo.per_user_limit THEN
    RAISE EXCEPTION 'You have reached the usage limit for this promotion';
  END IF;

  IF v_promo.discount_type = 'percentage' THEN
    v_discount_before_cap := round(v_merchandise_subtotal * (v_promo.discount_value / 100.0), 2);
  ELSE
    v_discount_before_cap := LEAST(v_promo.discount_value, v_merchandise_subtotal);
  END IF;

  v_discount := LEAST(
    v_merchandise_subtotal,
    CASE
      WHEN v_promo.max_discount_amount IS NULL THEN v_discount_before_cap
      ELSE LEAST(v_discount_before_cap, v_promo.max_discount_amount)
    END
  );

  IF v_discount <= 0 THEN
    RAISE EXCEPTION 'Promotion produced no discount';
  END IF;

  -- Seller-funded allocation keeps payment, seller wallets and marketplace
  -- commission mathematically balanced. Each seller receives its proportional
  -- share of the promotion, with the final store absorbing rounding residue.
  FOR v_so IN
    SELECT id, subtotal, shipping_fee, platform_commission_rate
    FROM public.seller_orders
    WHERE parent_order_id = v_order_id
    ORDER BY id
    FOR UPDATE
  LOOP
    v_store_index := v_store_index + 1;

    IF v_store_index = v_store_count THEN
      v_store_discount := v_discount - v_allocated;
    ELSE
      v_store_discount := round(
        v_discount * (v_so.subtotal / NULLIF(v_merchandise_subtotal, 0)),
        2
      );
      v_allocated := v_allocated + v_store_discount;
    END IF;

    v_store_discount := GREATEST(0, LEAST(v_store_discount, v_so.subtotal));
    v_net_subtotal := v_so.subtotal - v_store_discount;
    v_commission := round(v_net_subtotal * v_so.platform_commission_rate, 2);

    UPDATE public.seller_orders
    SET discount_amount = v_store_discount,
        platform_commission_amount = v_commission,
        seller_proceeds = v_net_subtotal - v_commission + v_so.shipping_fee,
        updated_at = now()
    WHERE id = v_so.id;
  END LOOP;

  v_total := GREATEST(0, v_merchandise_subtotal - v_discount + COALESCE(v_shipping, 0));

  UPDATE public.orders
  SET discount_amount = v_discount,
      total_amount = v_total,
      promotion_id = v_promo.id,
      promotion_code = v_promo.code,
      updated_at = now()
  WHERE id = v_order_id;

  v_expiry := COALESCE((v_result->>'reservation_expires_at')::timestamptz, now() + interval '30 minutes');

  INSERT INTO public.promotion_redemptions (
    promotion_id,
    order_id,
    user_id,
    discount_amount,
    status,
    expires_at
  ) VALUES (
    v_promo.id,
    v_order_id,
    v_buyer_id,
    v_discount,
    'reserved',
    v_expiry
  );

  RETURN v_result || jsonb_build_object(
    'total_amount', v_total,
    'discount_amount', v_discount,
    'promotion_code', v_promo.code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_server_checkout_with_promotion(jsonb,jsonb,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_server_checkout_with_promotion(jsonb,jsonb,text,text,text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_promotion_redemption_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    UPDATE public.promotion_redemptions
    SET status = 'committed', updated_at = now()
    WHERE order_id = NEW.id AND status = 'reserved';
  ELSIF NEW.status = 'cancelled'
        AND COALESCE(NEW.payment_status, '') <> 'paid'
        AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.promotion_redemptions
    SET status = 'released', updated_at = now()
    WHERE order_id = NEW.id AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_promotion_redemption_status ON public.orders;
CREATE TRIGGER trg_sync_promotion_redemption_status
AFTER UPDATE OF payment_status, status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_promotion_redemption_status();

NOTIFY pgrst, 'reload schema';

COMMIT;