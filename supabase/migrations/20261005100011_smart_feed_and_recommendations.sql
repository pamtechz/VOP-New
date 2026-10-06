-- ============================================================================
-- Migration: 20261005100011_smart_feed_and_recommendations.sql
-- Description: Intelligent E-Commerce Marketplace Ranking & Recommendation Engine
--              (Cassini / "Best Match" multi-factor ranking, user interactions,
--              listing freshness decay, seller quality weighting, exploration jitter,
--              and per-store frequency capping / de-duplication).
-- ============================================================================

DO $$
BEGIN
  -- 1. Create user_interactions table
  CREATE TABLE IF NOT EXISTS public.user_interactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text,
    event_type text NOT NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
    search_term text,
    created_at timestamptz DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_user_interactions_user_created 
    ON public.user_interactions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_interactions_category 
    ON public.user_interactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_user_interactions_product 
    ON public.user_interactions(product_id);
  CREATE INDEX IF NOT EXISTS idx_user_interactions_store_id 
    ON public.user_interactions(store_id);

  ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS user_interactions_insert ON public.user_interactions;
  CREATE POLICY user_interactions_insert ON public.user_interactions FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS user_interactions_select ON public.user_interactions;
  CREATE POLICY user_interactions_select ON public.user_interactions FOR SELECT USING (
    ((SELECT auth.uid()) = user_id) OR public.has_capability('analytics.manage')
  );

  -- 2. Lightweight interaction recording function
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
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $body$
  DECLARE
    v_cat_id uuid := p_category_id;
    v_store_id uuid := p_store_id;
  BEGIN
    IF p_product_id IS NOT NULL AND (v_cat_id IS NULL OR v_store_id IS NULL) THEN
      SELECT category_id, store_id INTO v_cat_id, v_store_id
      FROM public.products
      WHERE id = p_product_id;
    END IF;

    INSERT INTO public.user_interactions (
      user_id,
      session_id,
      event_type,
      product_id,
      category_id,
      store_id,
      search_term
    ) VALUES (
      (SELECT auth.uid()),
      p_session_id,
      p_event_type,
      p_product_id,
      v_cat_id,
      v_store_id,
      p_search_term
    );
  END;
  $body$;

  -- 3. Personalized & Diversified "Best Match" Feed Function
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
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $body$
  DECLARE
    v_feed jsonb;
  BEGIN
    WITH user_category_affinities AS (
      SELECT 
        category_id,
        LEAST(100.0, COUNT(*) * 20.0) as affinity_score
      FROM public.user_interactions
      WHERE (user_id = p_user_id OR (p_user_id IS NULL AND session_id IS NOT NULL))
        AND category_id IS NOT NULL
        AND created_at >= (now() - interval '14 days')
      GROUP BY category_id
    ),
    scored_products AS (
      SELECT 
        p.id,
        p.title,
        p.price,
        p.compare_at_price,
        p.store_id,
        s.name as store_name,
        COALESCE(s.rating_avg, 4.0) as store_rating,
        COALESCE(s.rating_count, 0) as store_rating_count,
        p.category_id,
        p.is_featured,
        p.is_sponsored,
        p.created_at,
        -- Freshness Score (0 - 100): Recency decay
        GREATEST(10.0, 100.0 * EXP(-0.03 * (EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0))) as freshness_score,
        -- Seller Quality Score (0 - 100): Rating average + volume confidence
        (COALESCE(s.rating_avg, 4.0) * 15.0 + LEAST(25.0, COALESCE(s.rating_count, 0) * 2.5)) as quality_score,
        -- User Category Affinity (0 - 100)
        COALESCE(uca.affinity_score, 0.0) as affinity_score,
        -- Text Search Relevance (0 - 150)
        CASE 
          WHEN p_search IS NOT NULL AND p_search <> '' THEN
            CASE 
              WHEN p.title ILIKE '%' || p_search || '%' THEN 150.0
              WHEN p.description ILIKE '%' || p_search || '%' THEN 75.0
              ELSE 0.0
            END
          ELSE 50.0
        END as relevance_score,
        -- Bandit Exploration Jitter (random exploration signal)
        (RANDOM() * 30.0 * p_explore_ratio) as exploration_jitter
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      LEFT JOIN user_category_affinities uca ON uca.category_id = p.category_id
      WHERE p.status = 'active'
        AND s.status = 'active'
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          p_search IS NULL 
          OR p_search = '' 
          OR p.title ILIKE '%' || p_search || '%' 
          OR p.description ILIKE '%' || p_search || '%'
        )
    ),
    ranked_products AS (
      SELECT 
        sp.*,
        -- Total Composite Score (Cassini Multi-Factor)
        (
          (0.35 * sp.freshness_score) +
          (0.25 * sp.quality_score) +
          (0.20 * sp.affinity_score) +
          (0.20 * sp.relevance_score) +
          sp.exploration_jitter +
          (CASE WHEN sp.is_featured THEN 25.0 ELSE 0.0 END) +
          (CASE WHEN sp.is_sponsored THEN 15.0 ELSE 0.0 END)
        ) as final_score,
        -- Store Frequency Capping Window (De-duplication)
        ROW_NUMBER() OVER (
          PARTITION BY sp.store_id 
          ORDER BY (
            (0.35 * sp.freshness_score) +
            (0.25 * sp.quality_score) +
            (0.20 * sp.affinity_score) +
            (0.20 * sp.relevance_score) +
            sp.exploration_jitter
          ) DESC
        ) as store_frequency_rank
      FROM scored_products sp
    ),
    curated_feed AS (
      SELECT 
        rp.*,
        CASE 
          WHEN rp.affinity_score >= 40.0 THEN 'Best Match'
          WHEN rp.freshness_score >= 80.0 THEN 'Fresh Drop'
          WHEN rp.quality_score >= 80.0 THEN 'Top Rated Seller'
          WHEN rp.is_featured THEN 'Featured'
          ELSE 'Trending'
        END as badge_label
      FROM ranked_products rp
      -- Enforce Diversity: Max N items per store in the viewport
      WHERE rp.store_frequency_rank <= p_max_per_store
      ORDER BY rp.final_score DESC
      LIMIT p_limit OFFSET p_offset
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', cf.id,
        'title', cf.title,
        'price', cf.price,
        'compare_at_price', cf.compare_at_price,
        'store_id', cf.store_id,
        'store_name', cf.store_name,
        'store_rating', cf.store_rating,
        'category_id', cf.category_id,
        'is_featured', cf.is_featured,
        'is_sponsored', cf.is_sponsored,
        'badge_label', cf.badge_label,
        'final_score', ROUND(cf.final_score::numeric, 2),
        'created_at', cf.created_at,
        'images', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pi.id,
              'url', pi.url,
              'display_order', pi.display_order
            ) ORDER BY pi.display_order ASC
          )
          FROM public.product_images pi
          WHERE pi.product_id = cf.id
        ), '[]'::jsonb)
      )
    ) INTO v_feed
    FROM curated_feed cf;

    RETURN COALESCE(v_feed, '[]'::jsonb);
  END;
  $body$;

  GRANT EXECUTE ON FUNCTION public.record_interaction(text, uuid, uuid, uuid, text, text) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.get_personalized_marketplace_feed(uuid, uuid, text, int, int, int, float) TO anon, authenticated;

  INSERT INTO supabase_migrations.schema_migrations(version)
  VALUES ('20261005100011')
  ON CONFLICT (version) DO NOTHING;
END $$;
