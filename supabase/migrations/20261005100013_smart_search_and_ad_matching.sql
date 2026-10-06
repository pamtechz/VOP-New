-- ==============================================================================
-- 20261005100013_smart_search_and_ad_matching.sql
-- PAMTECHZ MULTI-VENDOR MARKETPLACE
-- Hardens search matching across titles, descriptions, categories, stores,
-- word-stems/plurals, and semantic synonyms for promoted ad campaigns.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_personalized_marketplace_feed(
  p_user_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_max_per_store integer DEFAULT 2,
  p_explore_ratio double precision DEFAULT 0.20
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_cap int := LEAST(GREATEST(COALESCE(p_max_per_store, 2), 1), 10);
  v_explore float := LEAST(GREATEST(COALESCE(p_explore_ratio, 0.2), 0), 1);
  v_raw_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search text;
  v_stem text;
  v_pattern text;
  v_stem_pattern text;
  v_feed jsonb;
BEGIN
  IF v_raw_search IS NOT NULL THEN
    v_search := left(v_raw_search, 100);
    -- Safe escape for LIKE queries
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    
    -- Strip common trailing plural/verb suffixes for fuzzy stem matching
    v_stem := v_search;
    IF length(v_stem) > 4 AND v_stem ILIKE '%ies' THEN
      v_stem := left(v_stem, length(v_stem) - 3) || 'y';
    ELSIF length(v_stem) > 4 AND v_stem ILIKE '%es' THEN
      v_stem := left(v_stem, length(v_stem) - 2);
    ELSIF length(v_stem) > 3 AND v_stem ILIKE '%s' AND NOT v_stem ILIKE '%ss' THEN
      v_stem := left(v_stem, length(v_stem) - 1);
    END IF;
    v_stem_pattern := '%' || replace(replace(replace(v_stem, '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
           WHEN p.title ILIKE v_stem_pattern THEN 130.0
           WHEN c.name ILIKE v_pattern OR c.slug ILIKE v_pattern THEN 110.0
           WHEN s.name ILIKE v_pattern THEN 90.0
           WHEN p.description ILIKE v_pattern OR p.description ILIKE v_stem_pattern THEN 75.0
           ELSE 60.0 END AS relevance_score,
      RANDOM() * 30.0 * v_explore AS jitter
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN affinities a ON a.category_id = p.category_id
    WHERE p.status = 'active' AND s.status = 'active'
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
        v_pattern IS NULL
        OR p.title ILIKE v_pattern
        OR p.title ILIKE v_stem_pattern
        OR p.description ILIKE v_pattern
        OR p.description ILIKE v_stem_pattern
        OR c.name ILIKE v_pattern
        OR c.slug ILIKE v_pattern
        OR c.slug ILIKE v_stem_pattern
        OR s.name ILIKE v_pattern
        OR s.name ILIKE v_stem_pattern
        -- Semantic / synonym mapping
        OR (
          v_search ILIKE ANY(ARRAY['%tech%', '%electron%', '%gadget%', '%device%', '%phone%', '%comput%', '%charg%'])
          AND (c.slug IN ('electronics', 'gadgets') OR p.title ILIKE ANY(ARRAY['%wireless%', '%smart%', '%charger%', '%watch%', '%anc%', '%pro%', '%earbuds%']))
        )
        OR (
          v_search ILIKE ANY(ARRAY['%craft%', '%artisan%', '%hand%', '%leather%', '%decor%', '%art%'])
          AND (c.slug IN ('fashion', 'home-garden') OR p.title ILIKE ANY(ARRAY['%handcrafted%', '%leather%', '%bag%', '%artisan%']))
        )
      )
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
$function$;
