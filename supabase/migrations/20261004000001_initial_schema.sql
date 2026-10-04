-- Migration: 20261004000001_initial_schema.sql
-- Description: Core schema, tables, indexes, RPCs, RLS policies for Local Multi-Vendor Marketplace

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1. PLATFORM SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
);

-- Default system settings
INSERT INTO public.platform_settings (key, value, description) VALUES
('resource_mode', '"constrained"', 'Platform mode: constrained (Free Tier rules) or standard'),
('default_commission_rate', '0.05', 'Default marketplace commission rate (5%)'),
('inactivity_policy', '{"period_days": 60, "warning_schedule": [14, 7, 3, 2, 1, 0]}', 'Account inactivity deletion policy'),
('media_limits', '{"max_image_bytes": 153600, "max_dimension": 1280, "target_format": "webp"}', 'Media upload compression rules'),
('short_link_domain', '"go.marketplace.com"', 'Canonical short link domain'),
('plan_image_limits', '{"free": 2, "business": 4, "pro": 8}', 'Max product images by subscription plan')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. PROFILES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'seller', 'support_agent', 'advertising_manager', 'finance_admin', 'marketplace_admin', 'super_admin')),
    province TEXT,
    city TEXT,
    area TEXT,
    data_saver_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. SUBSCRIPTION PLANS & SUBSCRIPTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL, -- 'free', 'business', 'pro'
    price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    max_products INT NOT NULL DEFAULT 10,
    max_images_per_product INT NOT NULL DEFAULT 2,
    featured_badge BOOLEAN DEFAULT FALSE,
    commission_discount NUMERIC(5, 4) DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.subscription_plans (name, code, price_monthly, max_products, max_images_per_product, featured_badge) VALUES
('Freemium Seller', 'free', 0.00, 15, 2, FALSE),
('Business Seller', 'business', 150.00, 100, 4, TRUE),
('Pro Marketplace', 'pro', 450.00, 1000, 8, TRUE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('STORE-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6))),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    cover_url TEXT,
    description TEXT,
    province TEXT,
    city TEXT,
    area TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended', 'closed')),
    total_sales NUMERIC(14, 2) DEFAULT 0.00,
    rating_avg NUMERIC(3, 2) DEFAULT 0.00,
    rating_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. CATEGORIES & PRODUCTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    icon_url TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO public.categories (name, slug, display_order) VALUES
('Electronics & Gadgets', 'electronics', 1),
('Fashion & Clothing', 'fashion', 2),
('Home & Garden', 'home-garden', 3),
('Fresh Food & Produce', 'fresh-food', 4),
('Beauty & Wellness', 'beauty-wellness', 5),
('Services & Crafts', 'services-crafts', 6)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    compare_at_price NUMERIC(12, 2) CHECK (compare_at_price >= price),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'out_of_stock')),
    is_featured BOOLEAN DEFAULT FALSE,
    is_sponsored BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    display_order INT DEFAULT 0,
    file_size_bytes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sku TEXT,
    title TEXT NOT NULL, -- e.g. "Size L, Red"
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- 5. CARTS & CHECKOUT
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cart_id, product_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- 6. ORDERS, COMMISSIONS & IMMUTABLE HISTORICAL SNAPSHOTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('ORD-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5))),
    buyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    shipping_address JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'disputed')),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
    discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    shipping_amount NUMERIC(14, 2) DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'authorized', 'paid', 'refunded', 'partially_refunded')),
    payment_method TEXT NOT NULL DEFAULT 'card',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.seller_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('SORD-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5))),
    parent_order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'disputed')),
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    shipping_fee NUMERIC(14, 2) DEFAULT 0.00,
    -- Immutably snapshot commission rate applied at time of purchase
    platform_commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,
    platform_commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    seller_proceeds NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_order_id UUID NOT NULL REFERENCES public.seller_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name_at_purchase TEXT NOT NULL,
    variant_name_at_purchase TEXT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    commission_rate_applied NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. FINANCIAL LEDGER, WALLETS & PAYOUTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('PAY-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5))),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'stripe',
    transaction_id TEXT UNIQUE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZMW',
    status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('initiated', 'succeeded', 'failed', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    provider_event_id TEXT UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID UNIQUE NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    balance_available NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_pending NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_account_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('seller_order', 'payout', 'refund', 'adjustment')),
    reference_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit_proceeds', 'debit_payout', 'debit_refund', 'credit_adjustment', 'debit_adjustment')),
    amount NUMERIC(14, 2) NOT NULL,
    balance_after NUMERIC(14, 2) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('POUT-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5))),
    store_id UUID NOT NULL REFERENCES public.stores(id),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected')),
    destination_info JSONB NOT NULL,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. DIRECT ADVERTISING SYSTEM & AGGREGATED METRICS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID REFERENCES public.advertisers(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    placement TEXT NOT NULL CHECK (placement IN ('home_hero', 'home_inline', 'explore_inline', 'category_banner', 'sponsored_search', 'native_card')),
    target_category_id UUID REFERENCES public.categories(id),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'approved', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'rejected')),
    budget NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    body_text TEXT,
    image_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    cta_text TEXT DEFAULT 'Learn More',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily aggregated performance stats to avoid record explosion
CREATE TABLE IF NOT EXISTS public.ad_metrics_daily (
    campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    impressions INT DEFAULT 0,
    unique_impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    unique_clicks INT DEFAULT 0,
    conversions INT DEFAULT 0,
    PRIMARY KEY(campaign_id, date)
);

-- -----------------------------------------------------------------------------
-- 9. FIRST-PARTY BASE62 SHORT LINKS & AGGREGATED STATS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.short_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g. 'A7kP31'
    destination_type TEXT NOT NULL CHECK (destination_type IN ('product', 'store', 'category', 'campaign', 'external')),
    destination_id UUID,
    external_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.short_link_metrics_daily (
    short_link_id UUID NOT NULL REFERENCES public.short_links(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    clicks INT DEFAULT 0,
    unique_click_estimate INT DEFAULT 0,
    PRIMARY KEY(short_link_id, date)
);

-- -----------------------------------------------------------------------------
-- 10. MESSAGING, REVIEWS & DISPUTES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(buyer_id, store_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id),
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_type TEXT CHECK (attachment_type IN ('image', 'document')),
    attachment_expires_at TIMESTAMPTZ,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id),
    order_id UUID NOT NULL REFERENCES public.orders(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, buyer_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.wishlists (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref TEXT UNIQUE NOT NULL DEFAULT ('DISP-' || TO_CHAR(NOW(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5))),
    seller_order_id UUID NOT NULL REFERENCES public.seller_orders(id),
    buyer_id UUID NOT NULL REFERENCES public.profiles(id),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_refunded', 'resolved_rejected', 'cancelled')),
    resolution_notes TEXT,
    refund_amount NUMERIC(14, 2) DEFAULT 0.00,
    evidence_bucket_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 11. NOTIFICATIONS & AUDIT LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '45 days'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 12. ACCOUNT LIFECYCLE & INACTIVITY AUTOMATION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_lifecycle (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deletion_due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 days'),
    next_action_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '46 days'), -- T-14 days warning
    warning_stage INT DEFAULT 0 CHECK (warning_stage BETWEEN 0 AND 6), -- 0=none, 1=T-14, 2=T-7, 3=T-3, 4=T-2, 5=T-1, 6=T-0
    deletion_hold BOOLEAN DEFAULT FALSE,
    deletion_hold_reason TEXT,
    exempt BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 13. INDEXES FOR HIGH-TRAFFIC & CONSTRAINED USAGE
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_active_category ON public.products (category_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products (store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_trgm_title ON public.products USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_seller_orders_store ON public.seller_orders (store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders (buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_short_links_code ON public.short_links (code) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active ON public.ad_campaigns (placement, status, start_date, end_date) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_account_lifecycle_next_action ON public.account_lifecycle (next_action_at) WHERE exempt = FALSE AND deletion_hold = FALSE;

-- -----------------------------------------------------------------------------
-- 14. DATABASE FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------------------

-- Trigger: Automatically create Profile & Account Lifecycle record on Auth User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Marketplace User'),
        NEW.raw_user_meta_data->>'avatar_url',
        'user'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.account_lifecycle (user_id, last_active_at, deletion_due_at, next_action_at)
    VALUES (
        NEW.id,
        NOW(),
        NOW() + INTERVAL '60 days',
        NOW() + INTERVAL '46 days' -- T-14 days warning
    ) ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- RPC: Record Activity (Throttled update to prevent write explosion)
CREATE OR REPLACE FUNCTION public.touch_user_activity(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_last_active TIMESTAMPTZ;
BEGIN
    SELECT last_active_at INTO v_last_active
    FROM public.account_lifecycle
    WHERE user_id = p_user_id;

    -- Only update if last active was more than 1 day ago
    IF v_last_active IS NULL OR v_last_active < (NOW() - INTERVAL '1 day') THEN
        UPDATE public.account_lifecycle
        SET last_active_at = NOW(),
            deletion_due_at = NOW() + INTERVAL '60 days',
            next_action_at = NOW() + INTERVAL '46 days',
            warning_stage = 0,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Increment Ad Impression / Click (Aggregated Daily)
CREATE OR REPLACE FUNCTION public.track_ad_event(
    p_campaign_id UUID,
    p_is_click BOOLEAN DEFAULT FALSE,
    p_is_unique BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.ad_metrics_daily (campaign_id, date, impressions, unique_impressions, clicks, unique_clicks)
    VALUES (
        p_campaign_id,
        CURRENT_DATE,
        CASE WHEN NOT p_is_click THEN 1 ELSE 0 END,
        CASE WHEN NOT p_is_click AND p_is_unique THEN 1 ELSE 0 END,
        CASE WHEN p_is_click THEN 1 ELSE 0 END,
        CASE WHEN p_is_click AND p_is_unique THEN 1 ELSE 0 END
    )
    ON CONFLICT (campaign_id, date) DO UPDATE SET
        impressions = ad_metrics_daily.impressions + CASE WHEN NOT p_is_click THEN 1 ELSE 0 END,
        unique_impressions = ad_metrics_daily.unique_impressions + CASE WHEN NOT p_is_click AND p_is_unique THEN 1 ELSE 0 END,
        clicks = ad_metrics_daily.clicks + CASE WHEN p_is_click THEN 1 ELSE 0 END,
        unique_clicks = ad_metrics_daily.unique_clicks + CASE WHEN p_is_click AND p_is_unique THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Increment Short Link Click (Aggregated Daily)
CREATE OR REPLACE FUNCTION public.track_short_link_click(
    p_short_link_id UUID,
    p_is_unique BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.short_link_metrics_daily (short_link_id, date, clicks, unique_click_estimate)
    VALUES (
        p_short_link_id,
        CURRENT_DATE,
        1,
        CASE WHEN p_is_unique THEN 1 ELSE 0 END
    )
    ON CONFLICT (short_link_id, date) DO UPDATE SET
        clicks = short_link_metrics_daily.clicks + 1,
        unique_click_estimate = short_link_metrics_daily.unique_click_estimate + CASE WHEN p_is_unique THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY (RLS) POLICIES ON ALL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_link_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lifecycle ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can view basic profiles; Users edit own profile
DROP POLICY IF EXISTS profiles_read_policy ON public.profiles;
CREATE POLICY profiles_read_policy ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
CREATE POLICY profiles_update_policy ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Categories & Subscription Plans: Public read
DROP POLICY IF EXISTS categories_read_policy ON public.categories;
CREATE POLICY categories_read_policy ON public.categories FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS sub_plans_read_policy ON public.subscription_plans;
CREATE POLICY sub_plans_read_policy ON public.subscription_plans FOR SELECT USING (is_active = true);

-- Stores: Public read active stores; Owners edit
DROP POLICY IF EXISTS stores_read_policy ON public.stores;
CREATE POLICY stores_read_policy ON public.stores FOR SELECT USING (status = 'active' OR owner_id = auth.uid());
DROP POLICY IF EXISTS stores_write_policy ON public.stores;
CREATE POLICY stores_write_policy ON public.stores FOR ALL USING (owner_id = auth.uid());

-- Products: Public read active; Store members edit
DROP POLICY IF EXISTS products_read_policy ON public.products;
CREATE POLICY products_read_policy ON public.products FOR SELECT USING (status = 'active' OR EXISTS (
    SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.owner_id = auth.uid()
));
DROP POLICY IF EXISTS products_write_policy ON public.products;
CREATE POLICY products_write_policy ON public.products FOR ALL USING (EXISTS (
    SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.owner_id = auth.uid()
));

-- Product Images & Variants: Inherit product access
DROP POLICY IF EXISTS product_images_read ON public.product_images;
CREATE POLICY product_images_read ON public.product_images FOR SELECT USING (true);
DROP POLICY IF EXISTS product_images_write ON public.product_images;
CREATE POLICY product_images_write ON public.product_images FOR ALL USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.stores s ON p.store_id = s.id
    WHERE p.id = product_images.product_id AND s.owner_id = auth.uid()
));

-- Carts & Cart Items: Users manage own carts
DROP POLICY IF EXISTS carts_owner ON public.carts;
CREATE POLICY carts_owner ON public.carts FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS cart_items_owner ON public.cart_items;
CREATE POLICY cart_items_owner ON public.cart_items FOR ALL USING (EXISTS (
    SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
));

-- Orders & Seller Orders: Buyers read own orders; Sellers read store sub-orders
DROP POLICY IF EXISTS orders_buyer_read ON public.orders;
CREATE POLICY orders_buyer_read ON public.orders FOR SELECT USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS seller_orders_seller_read ON public.seller_orders;
CREATE POLICY seller_orders_seller_read ON public.seller_orders FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.stores WHERE stores.id = seller_orders.store_id AND stores.owner_id = auth.uid()
));
DROP POLICY IF EXISTS order_items_read ON public.order_items;
CREATE POLICY order_items_read ON public.order_items FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.seller_orders so JOIN public.stores s ON so.store_id = s.id
    WHERE so.id = order_items.seller_order_id AND (s.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = so.parent_order_id AND o.buyer_id = auth.uid()
    ))
));

-- Conversations & Messages: Participants read & write
DROP POLICY IF EXISTS convos_participant ON public.conversations;
CREATE POLICY convos_participant ON public.conversations FOR ALL USING (
    buyer_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.stores WHERE stores.id = conversations.store_id AND stores.owner_id = auth.uid()
    )
);
DROP POLICY IF EXISTS messages_participant ON public.messages;
CREATE POLICY messages_participant ON public.messages FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (
            c.buyer_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid()
            )
        )
    )
);

-- Notifications: User reads own
DROP POLICY IF EXISTS notifications_owner ON public.notifications;
CREATE POLICY notifications_owner ON public.notifications FOR ALL USING (user_id = auth.uid());

-- Wishlists: Owner reads & writes
DROP POLICY IF EXISTS wishlists_owner ON public.wishlists;
CREATE POLICY wishlists_owner ON public.wishlists FOR ALL USING (user_id = auth.uid());

-- Short Links: Public read active
DROP POLICY IF EXISTS short_links_read ON public.short_links;
CREATE POLICY short_links_read ON public.short_links FOR SELECT USING (is_active = true);

-- Ads: Public read active campaigns
DROP POLICY IF EXISTS ad_campaigns_read ON public.ad_campaigns;
CREATE POLICY ad_campaigns_read ON public.ad_campaigns FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS ad_creatives_read ON public.ad_creatives;
CREATE POLICY ad_creatives_read ON public.ad_creatives FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns c WHERE c.id = ad_creatives.campaign_id AND c.status = 'active'
));

-- Account Lifecycle: User reads own lifecycle status
DROP POLICY IF EXISTS lifecycle_owner ON public.account_lifecycle;
CREATE POLICY lifecycle_owner ON public.account_lifecycle FOR SELECT USING (user_id = auth.uid());
