-- Migration: 20261005000004_admin_full_crud_and_settings.sql
-- Description: Grants admins (role = 'admin' OR 'super_admin') full CRUD access across all database tables,
-- ensures admin-owned stores are exempt from subscription quota limits, and seeds rich platform settings.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper function: is_admin()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Returns true if authenticated user has admin or super_admin role';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Master Admin RLS Policies (Full CRUD for Admins on ALL Tables)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper for safe policy creation
CREATE OR REPLACE FUNCTION public._ensure_admin_policy(p_table TEXT, p_policy TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_policy, p_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', p_policy, p_table);
END;
$$;

SELECT public._ensure_admin_policy('profiles', 'admin_full_crud_profiles');
SELECT public._ensure_admin_policy('stores', 'admin_full_crud_stores');
SELECT public._ensure_admin_policy('store_members', 'admin_full_crud_store_members');
SELECT public._ensure_admin_policy('subscription_plans', 'admin_full_crud_subscription_plans');
SELECT public._ensure_admin_policy('subscriptions', 'admin_full_crud_subscriptions');
SELECT public._ensure_admin_policy('categories', 'admin_full_crud_categories');
SELECT public._ensure_admin_policy('products', 'admin_full_crud_products');
SELECT public._ensure_admin_policy('product_images', 'admin_full_crud_product_images');
SELECT public._ensure_admin_policy('product_variants', 'admin_full_crud_product_variants');
SELECT public._ensure_admin_policy('inventory', 'admin_full_crud_inventory');
SELECT public._ensure_admin_policy('carts', 'admin_full_crud_carts');
SELECT public._ensure_admin_policy('cart_items', 'admin_full_crud_cart_items');
SELECT public._ensure_admin_policy('orders', 'admin_full_crud_orders');
SELECT public._ensure_admin_policy('seller_orders', 'admin_full_crud_seller_orders');
SELECT public._ensure_admin_policy('order_items', 'admin_full_crud_order_items');
SELECT public._ensure_admin_policy('payments', 'admin_full_crud_payments');
SELECT public._ensure_admin_policy('payment_events', 'admin_full_crud_payment_events');
SELECT public._ensure_admin_policy('wallet_accounts', 'admin_full_crud_wallet_accounts');
SELECT public._ensure_admin_policy('wallet_ledger', 'admin_full_crud_wallet_ledger');
SELECT public._ensure_admin_policy('payouts', 'admin_full_crud_payouts');
SELECT public._ensure_admin_policy('ad_campaigns', 'admin_full_crud_ad_campaigns');
SELECT public._ensure_admin_policy('ad_creatives', 'admin_full_crud_ad_creatives');
SELECT public._ensure_admin_policy('ad_metrics_daily', 'admin_full_crud_ad_metrics_daily');
SELECT public._ensure_admin_policy('short_links', 'admin_full_crud_short_links');
SELECT public._ensure_admin_policy('short_link_metrics_daily', 'admin_full_crud_short_link_metrics_daily');
SELECT public._ensure_admin_policy('conversations', 'admin_full_crud_conversations');
SELECT public._ensure_admin_policy('messages', 'admin_full_crud_messages');
SELECT public._ensure_admin_policy('reviews', 'admin_full_crud_reviews');
SELECT public._ensure_admin_policy('wishlists', 'admin_full_crud_wishlists');
SELECT public._ensure_admin_policy('disputes', 'admin_full_crud_disputes');
SELECT public._ensure_admin_policy('notifications', 'admin_full_crud_notifications');
SELECT public._ensure_admin_policy('audit_logs', 'admin_full_crud_audit_logs');
SELECT public._ensure_admin_policy('account_lifecycle', 'admin_full_crud_account_lifecycle');
SELECT public._ensure_admin_policy('platform_settings', 'admin_full_crud_platform_settings');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Exclude Admins from Subscription / Store Limits Trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_product_subscription_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_owner_role TEXT;
    v_plan_max INT;
    v_current_count INT;
BEGIN
    -- Check owner role
    SELECT p.role INTO v_owner_role
    FROM public.stores s
    JOIN public.profiles p ON s.owner_id = p.id
    WHERE s.id = NEW.store_id;

    -- Admins have UNLIMITED products & images
    IF v_owner_role IN ('admin', 'super_admin') THEN
        RETURN NEW;
    END IF;

    -- Get active plan max_products
    SELECT sp.max_products INTO v_plan_max
    FROM public.subscriptions sub
    JOIN public.subscription_plans sp ON sub.plan_id = sp.id
    WHERE sub.store_id = NEW.store_id AND sub.status = 'active'
    ORDER BY sp.max_products DESC
    LIMIT 1;

    IF v_plan_max IS NULL THEN
        -- Default to free plan limit (15)
        v_plan_max := 15;
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.products
    WHERE store_id = NEW.store_id AND status != 'archived';

    IF v_current_count >= v_plan_max THEN
        RAISE EXCEPTION 'Product limit reached for your subscription plan (%)', v_plan_max
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_limits ON public.products;
CREATE TRIGGER trg_enforce_product_limits
    BEFORE INSERT ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.check_product_subscription_limits();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed Rich Platform Settings
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, description) VALUES
('marketplace_commission_percent', '5.0'::jsonb, 'Platform commission deducted from seller orders (%)'),
('minimum_payout_amount', '100.0'::jsonb, 'Minimum wallet balance required to request a seller payout (ZMW)'),
('default_currency', '"ZMW"'::jsonb, 'Default operating currency code for the marketplace (Zambian Kwacha)'),
('currency_symbol', '"K"'::jsonb, 'Currency display symbol (Kwacha)'),
('cloudinary_cloud_name', '"ubuy-store"'::jsonb, 'Cloudinary cloud name for direct external media delivery'),
('allowed_image_hosts', '["res.cloudinary.com", "cloudinary.com", "drive.google.com", "lh3.googleusercontent.com", "images.unsplash.com", "i.imgur.com"]'::jsonb, 'Whitelisted CDN and external cloud storage domains'),
('maintenance_mode', 'false'::jsonb, 'Global maintenance mode switch (locks non-admin checkout and writes)'),
('auto_purge_days', '60'::jsonb, 'Days of inactivity before an unverified account enters deletion queue'),
('enable_direct_external_images', 'true'::jsonb, 'Allow users to link images hosted on Cloudinary or Google Drive')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW();

-- RPC for updating platform settings (Admin only)
CREATE OR REPLACE FUNCTION public.set_platform_setting(
    p_key TEXT,
    p_value JSONB,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform administrators can modify settings'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.platform_settings (key, value, description, updated_at)
    VALUES (p_key, p_value, COALESCE(p_description, 'Custom setting'), NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = COALESCE(p_description, public.platform_settings.description),
        updated_at = NOW()
    RETURNING jsonb_build_object('key', key, 'value', value, 'updated_at', updated_at) INTO v_result;

    RETURN v_result;
END;
$$;
