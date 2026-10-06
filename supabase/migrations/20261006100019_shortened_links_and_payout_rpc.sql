-- Migration: Fix shortened_links grants & request_payout parameter aliases
-- Fixes PostgREST 404/PGRST202 errors for shortened_links and request_payout

-- 1. Ensure shortened_links table grants & policies
GRANT ALL ON public.shortened_links TO authenticated;
GRANT SELECT, INSERT ON public.shortened_links TO anon;

DROP POLICY IF EXISTS shortened_links_anon_insert_policy ON public.shortened_links;
CREATE POLICY shortened_links_anon_insert_policy ON public.shortened_links
    FOR INSERT TO anon WITH CHECK (true);

-- 2. Ensure register_shortened_media_link grants
GRANT EXECUTE ON FUNCTION public.register_shortened_media_link(VARCHAR, TEXT, VARCHAR) TO authenticated, anon;

-- 3. Overloaded request_payout RPC supporting p_destination parameter alias
CREATE OR REPLACE FUNCTION public.request_payout(
  p_store_id UUID,
  p_amount NUMERIC(14,2),
  p_destination JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.request_payout(
    p_store_id := p_store_id,
    p_amount := p_amount,
    p_destination_info := p_destination
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, JSONB) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
