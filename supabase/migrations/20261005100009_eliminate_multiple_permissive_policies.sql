-- ============================================================================
-- Migration: 20261005100009_eliminate_multiple_permissive_policies.sql
-- Description: Replace broad FOR ALL write policies with explicit INSERT/UPDATE/DELETE
--              policies on ad_metrics_daily, short_link_metrics_daily, inventory,
--              product_variants, platform_settings, platform_staff_roles, and store_members
--              to eliminate duplicate permissive policy evaluations.
-- ============================================================================

DO $$
BEGIN
  -- 1. ad_metrics_daily
  DROP POLICY IF EXISTS ad_metrics_upsert ON public.ad_metrics_daily;
  DROP POLICY IF EXISTS ad_metrics_insert ON public.ad_metrics_daily;
  DROP POLICY IF EXISTS ad_metrics_update ON public.ad_metrics_daily;
  CREATE POLICY ad_metrics_insert ON public.ad_metrics_daily FOR INSERT WITH CHECK (true);
  CREATE POLICY ad_metrics_update ON public.ad_metrics_daily FOR UPDATE USING (true) WITH CHECK (true);

  -- 2. short_link_metrics_daily
  DROP POLICY IF EXISTS short_link_metrics_upsert ON public.short_link_metrics_daily;
  DROP POLICY IF EXISTS short_link_metrics_insert ON public.short_link_metrics_daily;
  DROP POLICY IF EXISTS short_link_metrics_update ON public.short_link_metrics_daily;
  CREATE POLICY short_link_metrics_insert ON public.short_link_metrics_daily FOR INSERT WITH CHECK (true);
  CREATE POLICY short_link_metrics_update ON public.short_link_metrics_daily FOR UPDATE USING (true) WITH CHECK (true);

  -- 3. inventory
  DROP POLICY IF EXISTS inventory_select_active_products ON public.inventory;
  DROP POLICY IF EXISTS inventory_store_owner_manage ON public.inventory;
  DROP POLICY IF EXISTS inventory_select ON public.inventory;
  DROP POLICY IF EXISTS inventory_insert ON public.inventory;
  DROP POLICY IF EXISTS inventory_update ON public.inventory;
  DROP POLICY IF EXISTS inventory_delete ON public.inventory;

  CREATE POLICY inventory_select ON public.inventory FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id
        AND (p.status = 'active' OR s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY inventory_insert ON public.inventory FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY inventory_update ON public.inventory FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY inventory_delete ON public.inventory FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  -- 4. product_variants
  DROP POLICY IF EXISTS variants_select_active ON public.product_variants;
  DROP POLICY IF EXISTS variants_store_owner_manage ON public.product_variants;
  DROP POLICY IF EXISTS variants_select ON public.product_variants;
  DROP POLICY IF EXISTS variants_insert ON public.product_variants;
  DROP POLICY IF EXISTS variants_update ON public.product_variants;
  DROP POLICY IF EXISTS variants_delete ON public.product_variants;

  CREATE POLICY variants_select ON public.product_variants FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND (p.status = 'active' OR s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY variants_insert ON public.product_variants FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY variants_update ON public.product_variants FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  CREATE POLICY variants_delete ON public.product_variants FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND (s.owner_id = (SELECT auth.uid()) OR public.has_capability('products.manage'))
    )
  );

  -- 5. platform_settings
  DROP POLICY IF EXISTS platform_settings_public_keys ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_public_read ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_staff_modify ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_select ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_insert ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_update ON public.platform_settings;
  DROP POLICY IF EXISTS platform_settings_delete ON public.platform_settings;

  CREATE POLICY platform_settings_select ON public.platform_settings FOR SELECT USING (
    (key = ANY (ARRAY['default_currency'::text, 'currency_symbol'::text, 'marketplace_commission_bps'::text, 'minimum_payout_amount'::text, 'settlement_period_days'::text, 'short_link_domain'::text, 'resource_mode'::text, 'max_images_per_product_free'::text, 'inactivity_period_months'::text]))
    OR public.has_capability('settings.manage'::text)
  );

  CREATE POLICY platform_settings_insert ON public.platform_settings FOR INSERT TO authenticated WITH CHECK (public.has_capability('settings.manage'::text));
  CREATE POLICY platform_settings_update ON public.platform_settings FOR UPDATE TO authenticated USING (public.has_capability('settings.manage'::text)) WITH CHECK (public.has_capability('settings.manage'::text));
  CREATE POLICY platform_settings_delete ON public.platform_settings FOR DELETE TO authenticated USING (public.has_capability('settings.manage'::text));

  -- 6. platform_staff_roles
  DROP POLICY IF EXISTS super_admin_manage_staff ON public.platform_staff_roles;
  DROP POLICY IF EXISTS staff_insert_roles ON public.platform_staff_roles;
  DROP POLICY IF EXISTS staff_update_roles ON public.platform_staff_roles;
  DROP POLICY IF EXISTS staff_delete_roles ON public.platform_staff_roles;

  CREATE POLICY staff_insert_roles ON public.platform_staff_roles FOR INSERT TO authenticated WITH CHECK (public.has_capability('staff.manage'::text));
  CREATE POLICY staff_update_roles ON public.platform_staff_roles FOR UPDATE TO authenticated USING (public.has_capability('staff.manage'::text)) WITH CHECK (public.has_capability('staff.manage'::text));
  CREATE POLICY staff_delete_roles ON public.platform_staff_roles FOR DELETE TO authenticated USING (public.has_capability('staff.manage'::text));

  -- 7. store_members
  DROP POLICY IF EXISTS store_members_owner_manage ON public.store_members;
  DROP POLICY IF EXISTS store_members_insert ON public.store_members;
  DROP POLICY IF EXISTS store_members_update ON public.store_members;
  DROP POLICY IF EXISTS store_members_delete ON public.store_members;

  CREATE POLICY store_members_insert ON public.store_members FOR INSERT TO authenticated WITH CHECK (
    (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (SELECT auth.uid()))) OR public.has_capability('stores.moderate'::text)
  );

  CREATE POLICY store_members_update ON public.store_members FOR UPDATE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (SELECT auth.uid()))) OR public.has_capability('stores.moderate'::text)
  ) WITH CHECK (
    (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (SELECT auth.uid()))) OR public.has_capability('stores.moderate'::text)
  );

  CREATE POLICY store_members_delete ON public.store_members FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = (SELECT auth.uid()))) OR public.has_capability('stores.moderate'::text)
  );

  INSERT INTO supabase_migrations.schema_migrations(version)
  VALUES ('20261005100009')
  ON CONFLICT (version) DO NOTHING;
END $$;
