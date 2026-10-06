-- Migration: production advertising administration
BEGIN;

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.advertisers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS ad_campaigns_read ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_insert_admin ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_update_admin ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_delete_admin ON public.ad_campaigns;

CREATE POLICY ad_campaigns_read ON public.ad_campaigns
FOR SELECT TO public
USING (
  status = 'active'
  OR public.has_capability('advertising.manage')
);

CREATE POLICY ad_campaigns_insert_admin ON public.ad_campaigns
FOR INSERT TO authenticated
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY ad_campaigns_update_admin ON public.ad_campaigns
FOR UPDATE TO authenticated
USING (public.has_capability('advertising.manage'))
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY ad_campaigns_delete_admin ON public.ad_campaigns
FOR DELETE TO authenticated
USING (public.has_capability('advertising.manage'));

DROP POLICY IF EXISTS ad_creatives_read ON public.ad_creatives;
DROP POLICY IF EXISTS ad_creatives_insert_admin ON public.ad_creatives;
DROP POLICY IF EXISTS ad_creatives_update_admin ON public.ad_creatives;
DROP POLICY IF EXISTS ad_creatives_delete_admin ON public.ad_creatives;

CREATE POLICY ad_creatives_read ON public.ad_creatives
FOR SELECT TO public
USING (
  public.has_capability('advertising.manage')
  OR EXISTS (
    SELECT 1
    FROM public.ad_campaigns c
    WHERE c.id = ad_creatives.campaign_id
      AND c.status = 'active'
      AND c.start_date <= now()
      AND c.end_date >= now()
  )
);

CREATE POLICY ad_creatives_insert_admin ON public.ad_creatives
FOR INSERT TO authenticated
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY ad_creatives_update_admin ON public.ad_creatives
FOR UPDATE TO authenticated
USING (public.has_capability('advertising.manage'))
WITH CHECK (public.has_capability('advertising.manage'));

CREATE POLICY ad_creatives_delete_admin ON public.ad_creatives
FOR DELETE TO authenticated
USING (public.has_capability('advertising.manage'));

NOTIFY pgrst, 'reload schema';
COMMIT;