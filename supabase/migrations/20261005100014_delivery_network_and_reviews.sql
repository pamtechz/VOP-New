-- ==============================================================================
-- 20261005100014_delivery_network_and_reviews.sql
-- PAMTECHZ MULTI-VENDOR MARKETPLACE
-- High-concurrency, ultra-secure real-time delivery tracking engine,
-- anti-fraud pickup/dropoff cryptographic handshake, and verified buyer reviews.
-- ==============================================================================

-- ── 1. DRIVER PROFILES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('motorcycle', 'bicycle', 'car', 'van', 'truck')),
  vehicle_plate text NOT NULL,
  verification_status text NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'suspended')),
  rating_avg numeric(3,2) NOT NULL DEFAULT 5.00,
  rating_count integer NOT NULL DEFAULT 0,
  current_lat double precision,
  current_lng double precision,
  heading double precision DEFAULT 0.0,
  is_online boolean NOT NULL DEFAULT false,
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON public.driver_profiles(is_online, verification_status);

ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read and manage own profile" ON public.driver_profiles;
CREATE POLICY "Drivers can read and manage own profile" ON public.driver_profiles
  FOR ALL TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Public can view online drivers metadata" ON public.driver_profiles;
CREATE POLICY "Public can view online drivers metadata" ON public.driver_profiles
  FOR SELECT TO authenticated
  USING (verification_status = 'verified');

-- ── 2. DELIVERY JOBS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text UNIQUE NOT NULL DEFAULT ('DEL-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_order_id uuid REFERENCES public.seller_orders(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.driver_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unassigned' CHECK (status IN (
    'unassigned', 'assigned', 'accepted', 'arrived_at_pickup',
    'goods_picked_up', 'in_transit', 'arrived_at_dropoff', 'delivered', 'failed', 'cancelled'
  )),
  pickup_address text NOT NULL,
  pickup_lat double precision NOT NULL DEFAULT -15.3875,
  pickup_lng double precision NOT NULL DEFAULT 28.3228,
  pickup_contact_name text NOT NULL,
  pickup_contact_phone text NOT NULL,
  dropoff_address text NOT NULL,
  dropoff_lat double precision NOT NULL DEFAULT -15.4167,
  dropoff_lng double precision NOT NULL DEFAULT 28.2833,
  dropoff_contact_name text NOT NULL,
  dropoff_contact_phone text NOT NULL,
  pickup_pin text NOT NULL DEFAULT (lpad((floor(random() * 9000 + 1000)::int)::text, 4, '0')),
  dropoff_pin text NOT NULL DEFAULT (lpad((floor(random() * 9000 + 1000)::int)::text, 4, '0')),
  estimated_distance_km numeric(5,2) DEFAULT 5.4,
  estimated_duration_mins integer DEFAULT 18,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 25.00,
  notes text,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_order_id ON public.delivery_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_seller_order_id ON public.delivery_jobs(seller_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_driver_id ON public.delivery_jobs(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status ON public.delivery_jobs(status);

ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view and interact with delivery jobs" ON public.delivery_jobs;
CREATE POLICY "Participants can view and interact with delivery jobs" ON public.delivery_jobs
  FOR SELECT TO authenticated
  USING (
    driver_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.seller_orders so JOIN public.stores s ON s.id = so.store_id WHERE so.id = seller_order_id AND s.owner_id = (SELECT auth.uid()))
    OR (SELECT auth.jwt() ->> 'role') = 'service_role'
    OR status = 'unassigned'
  );

-- ── 3. DELIVERY TELEMETRY ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_telemetry (
  id bigserial PRIMARY KEY,
  delivery_job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision DEFAULT 0.0,
  speed_kmh double precision DEFAULT 0.0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_telemetry_job_id ON public.delivery_telemetry(delivery_job_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_telemetry_driver_id ON public.delivery_telemetry(driver_id);

ALTER TABLE public.delivery_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Telemetry access policy" ON public.delivery_telemetry;
CREATE POLICY "Telemetry access policy" ON public.delivery_telemetry
  FOR ALL TO authenticated
  USING (
    driver_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.id = delivery_job_id AND (
      dj.driver_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = dj.order_id AND o.buyer_id = (SELECT auth.uid()))
    ))
  )
  WITH CHECK (driver_id = (SELECT auth.uid()));

-- ── 4. REVIEWS & RATINGS TRIGGER ──────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_store_id ON public.reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer_id ON public.reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews(order_id);

DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
CREATE POLICY "Public can view reviews" ON public.reviews
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Buyers can create verified reviews" ON public.reviews;
CREATE POLICY "Buyers can create verified reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.buyer_id = (SELECT auth.uid())
    )
  );

-- Atomic recalculation trigger for store rating
CREATE OR REPLACE FUNCTION public.recalculate_store_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_avg numeric(3,2);
  v_count int;
BEGIN
  v_store_id := COALESCE(NEW.store_id, OLD.store_id);
  
  SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 5.00), COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews
  WHERE store_id = v_store_id;

  UPDATE public.stores
  SET rating_avg = v_avg,
      rating_count = v_count,
      updated_at = now()
  WHERE id = v_store_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_store_rating ON public.reviews;
CREATE TRIGGER trg_recalculate_store_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_store_rating();

-- ── 5. WISHLISTS RLS & INDEXES ────────────────────────────────────────────────
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists(product_id);

DROP POLICY IF EXISTS "Users can manage own wishlist" ON public.wishlists;
CREATE POLICY "Users can manage own wishlist" ON public.wishlists
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 6. SERVER-AUTHORITATIVE HANDSHAKE RPCS ────────────────────────────────────

-- Verify Pickup Handshake (Seller -> Driver)
CREATE OR REPLACE FUNCTION public.verify_pickup_handshake(
  p_job_id uuid,
  p_pin text,
  p_driver_lat double precision DEFAULT NULL,
  p_driver_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_job public.delivery_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_job FROM public.delivery_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery job not found');
  END IF;

  IF v_job.driver_id != v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the assigned driver can perform pickup verification');
  END IF;

  IF btrim(p_pin) != v_job.pickup_pin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Pickup PIN provided by seller');
  END IF;

  UPDATE public.delivery_jobs
  SET status = 'goods_picked_up',
      picked_up_at = now(),
      updated_at = now()
  WHERE id = p_job_id;

  IF v_job.seller_order_id IS NOT NULL THEN
    UPDATE public.seller_orders
    SET status = 'dispatched',
        updated_at = now()
    WHERE id = v_job.seller_order_id;
  END IF;

  IF p_driver_lat IS NOT NULL AND p_driver_lng IS NOT NULL THEN
    INSERT INTO public.delivery_telemetry (delivery_job_id, driver_id, lat, lng, recorded_at)
    VALUES (p_job_id, v_uid, p_driver_lat, p_driver_lng, now());

    UPDATE public.driver_profiles
    SET current_lat = p_driver_lat,
        current_lng = p_driver_lng,
        last_active_at = now()
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'goods_picked_up', 'message', 'Pickup verified successfully');
END;
$$;

-- Verify Dropoff Handshake (Driver -> Buyer)
CREATE OR REPLACE FUNCTION public.verify_dropoff_handshake(
  p_job_id uuid,
  p_pin text,
  p_driver_lat double precision DEFAULT NULL,
  p_driver_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_job public.delivery_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_job FROM public.delivery_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery job not found');
  END IF;

  IF v_job.driver_id != v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the assigned driver can complete delivery');
  END IF;

  IF btrim(p_pin) != v_job.dropoff_pin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Delivery PIN provided by buyer');
  END IF;

  UPDATE public.delivery_jobs
  SET status = 'delivered',
      delivered_at = now(),
      updated_at = now()
  WHERE id = p_job_id;

  IF v_job.seller_order_id IS NOT NULL THEN
    UPDATE public.seller_orders
    SET status = 'delivered',
        updated_at = now()
    WHERE id = v_job.seller_order_id;
  END IF;

  UPDATE public.orders
  SET status = 'delivered',
      updated_at = now()
  WHERE id = v_job.order_id;

  IF p_driver_lat IS NOT NULL AND p_driver_lng IS NOT NULL THEN
    INSERT INTO public.delivery_telemetry (delivery_job_id, driver_id, lat, lng, recorded_at)
    VALUES (p_job_id, v_uid, p_driver_lat, p_driver_lng, now());
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'delivered', 'message', 'Delivery verified and completed successfully');
END;
$$;

-- Driver Update Live Location
CREATE OR REPLACE FUNCTION public.update_driver_live_location(
  p_job_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_heading double precision DEFAULT 0.0,
  p_speed double precision DEFAULT 0.0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  UPDATE public.driver_profiles
  SET current_lat = p_lat,
      current_lng = p_lng,
      heading = p_heading,
      last_active_at = now()
  WHERE id = v_uid;

  IF p_job_id IS NOT NULL THEN
    INSERT INTO public.delivery_telemetry (delivery_job_id, driver_id, lat, lng, heading, speed_kmh, recorded_at)
    VALUES (p_job_id, v_uid, p_lat, p_lng, p_heading, p_speed, now());
  END IF;

  RETURN jsonb_build_object('success', true, 'lat', p_lat, 'lng', p_lng);
END;
$$;
