-- Migration: 20261005000005_shortened_links_schema.sql
-- Description: Create shortened_links tracking table and atomic collision-safe RPC helper for media link interception.

CREATE TABLE IF NOT EXISTS public.shortened_links (
    id BIGSERIAL PRIMARY KEY,
    short_code VARCHAR(10) UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    source_platform VARCHAR(30) NOT NULL CHECK (source_platform IN ('google_drive', 'dropbox', 'cloudinary', 'custom')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on short_code for high performance lookups
CREATE INDEX IF NOT EXISTS idx_shortened_links_short_code ON public.shortened_links (short_code);
CREATE INDEX IF NOT EXISTS idx_shortened_links_source_platform ON public.shortened_links (source_platform);

-- Enable RLS
ALTER TABLE public.shortened_links ENABLE ROW LEVEL SECURITY;

-- Policies for shortened_links:
-- 1. Anyone (public & auth) can resolve short codes
DROP POLICY IF EXISTS shortened_links_read_policy ON public.shortened_links;
CREATE POLICY shortened_links_read_policy ON public.shortened_links
    FOR SELECT USING (true);

-- 2. Authenticated users can insert/upsert new media links
DROP POLICY IF EXISTS shortened_links_insert_policy ON public.shortened_links;
CREATE POLICY shortened_links_insert_policy ON public.shortened_links
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS shortened_links_update_policy ON public.shortened_links;
CREATE POLICY shortened_links_update_policy ON public.shortened_links
    FOR UPDATE TO authenticated USING (true);

-- 3. Admins have full CRUD
DROP POLICY IF EXISTS admin_full_crud_shortened_links ON public.shortened_links;
CREATE POLICY admin_full_crud_shortened_links ON public.shortened_links
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RPC: register_shortened_media_link
-- Performs atomic collision-safe registration of intercepted media links.
CREATE OR REPLACE FUNCTION public.register_shortened_media_link(
    p_short_code      VARCHAR(10),
    p_long_url        TEXT,
    p_source_platform VARCHAR(30)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
BEGIN
    INSERT INTO public.shortened_links (short_code, long_url, source_platform, created_at)
    VALUES (p_short_code, p_long_url, p_source_platform, NOW())
    ON CONFLICT (short_code) DO UPDATE
    SET long_url = EXCLUDED.long_url,
        source_platform = EXCLUDED.source_platform
    RETURNING id, short_code, long_url, source_platform, created_at INTO v_record;

    RETURN jsonb_build_object(
        'id', v_record.id,
        'short_code', v_record.short_code,
        'long_url', v_record.long_url,
        'source_platform', v_record.source_platform,
        'created_at', v_record.created_at
    );
END;
$$;
