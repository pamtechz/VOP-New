-- Migration: 20261004000003_idempotent_upgrade.sql
-- Description: Safe upgrade migration (run after 000001). Uses IF NOT EXISTS guards
-- throughout so it is safe to re-run. Adds external URL shortening support for
-- product images and message attachments.

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: idempotent policy creation
-- Wraps CREATE POLICY in a DO block so it does not error if already exists.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._create_policy_if_not_exists(
    p_table TEXT,
    p_policy TEXT,
    p_sql   TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = p_table
          AND policyname = p_policy
    ) THEN
        EXECUTE p_sql;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PRODUCT IMAGES — add url_type column to distinguish storage vs shortened
-- ─────────────────────────────────────────────────────────────────────────────
-- url_type:
--   'storage'   — file was uploaded to Supabase Storage (full path stored)
--   'shortened' — user pasted an external URL; stored as a short code reference
ALTER TABLE public.product_images
    ADD COLUMN IF NOT EXISTS url_type TEXT NOT NULL DEFAULT 'storage'
        CHECK (url_type IN ('storage', 'shortened')),
    ADD COLUMN IF NOT EXISTS short_link_id UUID
        REFERENCES public.short_links(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product_images.url_type IS
    'storage = Supabase Storage object; shortened = external URL stored as Base62 short link';
COMMENT ON COLUMN public.product_images.short_link_id IS
    'FK to short_links when url_type = shortened. Resolved URL is short_links.external_url.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MESSAGES — add url_type column for chat attachments
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS attachment_url_type TEXT NOT NULL DEFAULT 'storage'
        CHECK (attachment_url_type IN ('storage', 'shortened')),
    ADD COLUMN IF NOT EXISTS attachment_short_link_id UUID
        REFERENCES public.short_links(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.attachment_url_type IS
    'storage = Supabase Storage; shortened = external URL referenced via Base62 short link';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SHORT_LINKS — ensure url validation column exists
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.short_links
    ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'safe', 'blocked'));

COMMENT ON COLUMN public.short_links.validation_status IS
    'pending = not yet checked; safe = allowed; blocked = malicious/disallowed URL';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEX — fast lookup of short_link_id on product_images
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_images_short_link
    ON public.product_images (short_link_id)
    WHERE short_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_short_link
    ON public.messages (attachment_short_link_id)
    WHERE attachment_short_link_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: shorten_external_url
--    Takes an external URL (e.g. a Google Drive share link), validates it is
--    safe (http/https only, no javascript: etc.), creates a canonical short
--    link record, and returns the short code plus the full short URL.
--
--    Used by Flutter and Admin when a user pastes an image/file URL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shorten_external_url(
    p_external_url   TEXT,
    p_destination_type TEXT DEFAULT 'external',  -- 'external' for pasted URLs
    p_created_by     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_domain       TEXT;
    v_code         TEXT;
    v_link_id      UUID;
    v_short_domain TEXT;
    v_result       JSONB;
BEGIN
    -- ── Security validation ──────────────────────────────────────────────────
    -- Only allow http:// or https:// schemes.
    IF p_external_url !~ '^https?://' THEN
        RAISE EXCEPTION 'URL_SCHEME_BLOCKED: Only http and https URLs are permitted. Got: %',
            LEFT(p_external_url, 80);
    END IF;

    -- Block known dangerous patterns.
    IF p_external_url ~* 'javascript:|data:|vbscript:|file:|ftp:' THEN
        RAISE EXCEPTION 'URL_SCHEME_BLOCKED: Unsafe URL scheme detected.';
    END IF;

    -- Sanity length check — real image URLs should not be absurdly long.
    IF LENGTH(p_external_url) > 2048 THEN
        RAISE EXCEPTION 'URL_TOO_LONG: Maximum allowed URL length is 2048 characters.';
    END IF;

    -- ── Canonical reuse: check if this exact external URL already has a code ─
    SELECT id, code
    INTO   v_link_id, v_code
    FROM   public.short_links
    WHERE  external_url     = p_external_url
      AND  destination_type = 'external'
      AND  is_active        = TRUE
    LIMIT 1;

    IF v_code IS NOT NULL THEN
        -- Reuse the existing canonical code — no new row created.
        SELECT TRIM(BOTH '"' FROM value::text) INTO v_short_domain
        FROM   public.platform_settings
        WHERE  key = 'short_link_domain';

        RETURN jsonb_build_object(
            'id',         v_link_id,
            'code',       v_code,
            'short_url',  CASE WHEN v_short_domain IS NOT NULL AND v_short_domain <> '' THEN 'https://' || v_short_domain || '/s/' || v_code ELSE '/s/' || v_code END,
            'reused',     TRUE
        );
    END IF;

    -- ── Generate a new Base62 6-character code ───────────────────────────────
    DECLARE
        v_chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        i       INT;
    BEGIN
        v_code := '';
        FOR i IN 1..6 LOOP
            v_code := v_code || SUBSTRING(v_chars FROM (FLOOR(RANDOM() * 62)::INT + 1) FOR 1);
        END LOOP;
    END;

    INSERT INTO public.short_links (
        code, destination_type, destination_id,
        external_url, created_by,
        validation_status, is_active
    ) VALUES (
        v_code, 'external', NULL,
        p_external_url, p_created_by,
        'pending', TRUE
    ) RETURNING id INTO v_link_id;

    SELECT TRIM(BOTH '"' FROM value::text) INTO v_short_domain
    FROM   public.platform_settings
    WHERE  key = 'short_link_domain';

    RETURN jsonb_build_object(
        'id',         v_link_id,
        'code',       v_code,
        'short_url',  CASE WHEN v_short_domain IS NOT NULL AND v_short_domain <> '' THEN 'https://' || v_short_domain || '/s/' || v_code ELSE '/s/' || v_code END,
        'reused',     FALSE
    );
END;
$$;

COMMENT ON FUNCTION public.shorten_external_url IS
    'Validates and shortens a pasted external image/file URL using the first-party Base62 '
    'short link system. Reuses existing canonical codes. Safe: blocks non-http(s) schemes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: attach_shortened_url_to_product_image
--    Atomically shortens an external URL and records it as a product image.
--    Called from Flutter when the user selects "Paste image URL" instead of
--    uploading a file from their device.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attach_shortened_url_to_product_image(
    p_product_id    UUID,
    p_external_url  TEXT,
    p_display_order INT DEFAULT 0,
    p_created_by    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link_result   JSONB;
    v_image_id      UUID;
    v_plan_limit    INT;
    v_current_count INT;
    v_plan_code     TEXT;
BEGIN
    -- ── Plan image-count guard ──────────────────────────────────────────────
    -- Resolve the store's current subscription plan code.
    SELECT sp.code INTO v_plan_code
    FROM   public.products p
    JOIN   public.stores   s  ON p.store_id  = s.id
    JOIN   public.subscriptions sub ON sub.store_id = s.id AND sub.status = 'active'
    JOIN   public.subscription_plans sp ON sp.id = sub.plan_id
    WHERE  p.id = p_product_id
    LIMIT  1;

    v_plan_code := COALESCE(v_plan_code, 'free');

    -- Read the per-plan image limit from platform_settings.
    SELECT (value->v_plan_code)::int INTO v_plan_limit
    FROM   public.platform_settings
    WHERE  key = 'plan_image_limits';
    v_plan_limit := COALESCE(v_plan_limit, 2);

    SELECT COUNT(*) INTO v_current_count
    FROM   public.product_images
    WHERE  product_id = p_product_id;

    IF v_current_count >= v_plan_limit THEN
        RAISE EXCEPTION 'IMAGE_LIMIT_REACHED: Plan "%" allows % images. Product already has %.',
            v_plan_code, v_plan_limit, v_current_count;
    END IF;

    -- ── Shorten the URL ─────────────────────────────────────────────────────
    v_link_result := public.shorten_external_url(p_external_url, 'external', p_created_by);

    -- ── Insert product_image record ─────────────────────────────────────────
    INSERT INTO public.product_images (
        product_id, url, url_type,
        short_link_id, display_order, file_size_bytes
    ) VALUES (
        p_product_id,
        v_link_result->>'short_url',   -- store the short URL, not the original
        'shortened',
        (v_link_result->>'id')::UUID,
        p_display_order,
        0                              -- no file size for external URLs
    ) RETURNING id INTO v_image_id;

    RETURN jsonb_build_object(
        'image_id',  v_image_id,
        'short_url', v_link_result->>'short_url',
        'code',      v_link_result->>'code',
        'reused',    v_link_result->'reused'
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: attach_shortened_url_to_message
--    Shortens an external URL and attaches it as a chat message attachment.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attach_shortened_url_to_message(
    p_message_id    UUID,
    p_external_url  TEXT,
    p_created_by    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link_result JSONB;
BEGIN
    v_link_result := public.shorten_external_url(p_external_url, 'external', p_created_by);

    UPDATE public.messages
    SET    attachment_url              = v_link_result->>'short_url',
           attachment_url_type        = 'shortened',
           attachment_short_link_id   = (v_link_result->>'id')::UUID
    WHERE  id = p_message_id;

    RETURN v_link_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ENSURE ALL EXISTING RLS POLICIES ARE INTACT (idempotent checks)
-- ─────────────────────────────────────────────────────────────────────────────
-- short_links — allow authenticated users to call shorten RPC indirectly;
-- direct row insert remains server-side only.
SELECT public._create_policy_if_not_exists(
    'short_links', 'short_links_read',
    'CREATE POLICY short_links_read ON public.short_links
     FOR SELECT USING (is_active = true)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ENSURE platform_settings has plan_image_limits key
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, description)
VALUES (
    'plan_image_limits',
    '{"free": 2, "business": 4, "pro": 8}',
    'Maximum product images allowed per subscription plan'
)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CLEANUP: drop the helper function (no longer needed at runtime)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public._create_policy_if_not_exists(TEXT, TEXT, TEXT);
