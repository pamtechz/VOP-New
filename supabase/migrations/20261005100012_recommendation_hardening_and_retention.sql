-- ============================================================================
-- Migration: 20261005100012_recommendation_hardening_and_retention.sql
-- Description: Recommendation & Ranking System Hardening
--              - Event type check constraint
--              - Anti-spoofing insert policy
--              - Duplicate signal throttling
--              - Safe text escaping on search
--              - 90-day retention purge function for Supabase Free plan storage
-- ============================================================================

DO $$
BEGIN
  -- Event type whitelist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_interactions_event_type_check') THEN
    ALTER TABLE public.user_interactions ADD CONSTRAINT user_interactions_event_type_check
      CHECK (event_type IN ('view','click','search','add_to_cart','wishlist','purchase'));
  END IF;

  -- Anti-spoofing: a caller can only write events for itself (or anonymously)
  DROP POLICY IF EXISTS user_interactions_insert ON public.user_interactions;
  CREATE POLICY user_interactions_insert ON public.user_interactions FOR INSERT WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

  -- Retention index for purge
  CREATE INDEX IF NOT EXISTS idx_user_interactions_created_at ON public.user_interactions(created_at);
END $$;

-- record_interaction: SECURITY INVOKER, validated, throttled (dedupe within 30 min)
CREATE OR REPLACE FUNCTION public.record_interaction(
  p_event_type text,
  p_product_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_search_term text DEFAULT NULL,
  p_session_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $body$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_cat_id uuid := p_category_id;
  v_store_id uuid := p_store_id;
  v_term text := NULLIF(left(btrim(COALESCE(p_search_term, '')), 100), '');
BEGIN
  IF p_event_type NOT IN ('view','click','search','add_to_cart','wishlist','purchase') THEN
    RETURN;
  END IF;

  -- Anonymous events carry no personalization value and only consume storage
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT category_id, store_id INTO v_cat_id, v_store_id
    FROM public.products WHERE id = p_product_id AND status = 'active';
    IF NOT FOUND THEN RETURN; END IF;
  END IF;

  -- Throttle duplicate signals (same user/event/product/term within 30 minutes)
  IF EXISTS (
    SELECT 1 FROM public.user_interactions ui
    WHERE ui.user_id = v_uid
      AND ui.event_type = p_event_type
      AND ui.product_id IS NOT DISTINCT FROM p_product_id
      AND ui.search_term IS NOT DISTINCT FROM v_term
      AND ui.created_at >= now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_interactions (user_id, session_id, event_type, product_id, category_id, store_id, search_term)
  VALUES (v_uid, p_session_id, p_event_type, p_product_id, v_cat_id, v_store_id, v_term);
END;
$body$;

-- Feed: identity from auth.uid() only (p_user_id retained for signature compatibility and ignored)
CREATE OR REPLACE FUNCTION public.get_personalized_marketplace_feed(
  p_user_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_max_per_store int DEFAULT 2,
  p_explore_ratio float DEFAULT 0.20
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $body$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_cap int := LEAST(GREATEST(COALESCE(p_max_per_store, 2), 1), 10);
  v_explore float := LEAST(GREATEST(COALESCE(p_explore_ratio, 0.2), 0), 1);
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_pattern text;
  v_feed jsonb;
BEGIN
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH affinities AS (
    -- Weighted, time-decayed intent signals (content-based on category)
    SELECT ui.category_id,
      LEAST(100.0, SUM(
        CASE ui.event_type
          WHEN 'purchase' THEN 40 WHEN 'add_to_cart' THEN 25 WHEN 'wishlist' THEN 20
          WHEN 'click' THEN 8 WHEN 'view' THEN 5 ELSE 3 END
        * EXP(-0.1 * EXTRACT(EPOCH FROM (now() - ui.created_at)) / 86400.0)
      )) AS affinity_score
    FROM public.user_interactions ui
    WHERE v_uid IS NOT NULL
      AND ui.user_id = v_uid
      AND ui.category_id IS NOT NULL
      AND ui.created_at >= now() - interval '30 days'
    GROUP BY ui.category_id
  ),
  scored AS (
    SELECT p.id, p.title, p.price, p.compare_at_price, p.store_id, s.name AS store_name,
      COALESCE(s.rating_avg, 0) AS store_rating, p.category_id, p.is_featured, p.is_sponsored, p.created_at,
      GREATEST(10.0, 100.0 * EXP(-0.03 * EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0)) AS freshness_score,
      (COALESCE(s.rating_avg, 3.5) * 15.0 + LEAST(25.0, COALESCE(s.rating_count, 0) * 2.5)) AS quality_score,
      COALESCE(a.affinity_score, 0.0) AS affinity_score,
      CASE WHEN v_pattern IS NULL THEN 50.0
           WHEN p.title ILIKE v_pattern THEN 150.0
           ELSE 75.0 END AS relevance_score,
      RANDOM() * 30.0 * v_explore AS jitter
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
    LEFT JOIN affinities a ON a.category_id = p.category_id
    WHERE p.status = 'active' AND s.status = 'active'
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (v_pattern IS NULL OR p.title ILIKE v_pattern OR p.description ILIKE v_pattern)
  ),
  ranked AS (
    SELECT sc.*,
      (0.35*freshness_score + 0.25*quality_score + 0.20*affinity_score + 0.20*relevance_score + jitter) AS base_score
    FROM scored sc
  ),
  capped AS (
    SELECT r.*,
      r.base_score + CASE WHEN r.is_featured THEN 25 ELSE 0 END + CASE WHEN r.is_sponsored THEN 15 ELSE 0 END AS final_score,
      ROW_NUMBER() OVER (PARTITION BY r.store_id ORDER BY r.base_score DESC) AS store_rank
    FROM ranked r
  ),
  page AS (
    SELECT c.*,
      CASE WHEN c.affinity_score >= 40 THEN 'Best Match'
           WHEN c.freshness_score >= 80 THEN 'Fresh Drop'
           WHEN c.quality_score >= 80 THEN 'Top Rated Seller'
           WHEN c.is_featured THEN 'Featured'
           ELSE NULL END AS badge_label
    FROM capped c
    WHERE c.store_rank <= v_cap
    ORDER BY c.final_score DESC, c.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id', pg.id, 'title', pg.title, 'price', pg.price, 'compare_at_price', pg.compare_at_price,
    'store_id', pg.store_id, 'store_name', pg.store_name, 'store_rating', pg.store_rating,
    'category_id', pg.category_id, 'is_featured', pg.is_featured, 'is_sponsored', pg.is_sponsored,
    'badge_label', pg.badge_label, 'final_score', ROUND(pg.final_score::numeric, 2), 'created_at', pg.created_at,
    'images', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'display_order', pi.display_order) ORDER BY pi.display_order)
                        FROM public.product_images pi WHERE pi.product_id = pg.id), '[]'::jsonb)
  ) ORDER BY pg.final_score DESC, pg.id) INTO v_feed
  FROM page pg;

  RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$body$;

-- Retention: keep 90 days of signals (Free-plan storage budget)
CREATE OR REPLACE FUNCTION private.purge_old_user_interactions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $body$
DECLARE v_count integer;
BEGIN
  WITH d AS (
    DELETE FROM public.user_interactions WHERE created_at < now() - interval '90 days' RETURNING 1
  ) SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$body$;
REVOKE ALL ON FUNCTION private.purge_old_user_interactions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_interaction(text, uuid, uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_personalized_marketplace_feed(uuid, uuid, text, int, int, int, float) TO anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20261005100012') ON CONFLICT (version) DO NOTHING;
