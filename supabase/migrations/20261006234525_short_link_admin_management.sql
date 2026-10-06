-- Migration: short-link administration without breaking existing shared URLs
BEGIN;

ALTER TABLE public.short_links
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS short_links_read ON public.short_links;
DROP POLICY IF EXISTS short_links_update_admin ON public.short_links;
DROP POLICY IF EXISTS short_links_delete_admin ON public.short_links;

CREATE POLICY short_links_read ON public.short_links
FOR SELECT TO public
USING (
  (is_active = true AND (expires_at IS NULL OR expires_at > now()))
  OR public.has_capability('settings.manage')
  OR public.has_capability('advertising.manage')
);

CREATE POLICY short_links_update_admin ON public.short_links
FOR UPDATE TO authenticated
USING (
  public.has_capability('settings.manage')
  OR public.has_capability('advertising.manage')
)
WITH CHECK (
  public.has_capability('settings.manage')
  OR public.has_capability('advertising.manage')
);

-- Shared links are intentionally not hard-deleted from the admin UI. Deactivation
-- preserves references and lets previously distributed URLs fail safely.
NOTIFY pgrst, 'reload schema';
COMMIT;