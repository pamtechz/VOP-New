-- Migration: production admin delivery controls
BEGIN;

DROP POLICY IF EXISTS driver_profiles_admin_select ON public.driver_profiles;
DROP POLICY IF EXISTS driver_profiles_admin_update ON public.driver_profiles;
DROP POLICY IF EXISTS delivery_jobs_admin_select ON public.delivery_jobs;
DROP POLICY IF EXISTS delivery_jobs_admin_update ON public.delivery_jobs;

CREATE POLICY driver_profiles_admin_select ON public.driver_profiles
FOR SELECT TO authenticated
USING (public.has_capability('deliveries.manage'));

CREATE POLICY driver_profiles_admin_update ON public.driver_profiles
FOR UPDATE TO authenticated
USING (public.has_capability('deliveries.manage'))
WITH CHECK (public.has_capability('deliveries.manage'));

CREATE POLICY delivery_jobs_admin_select ON public.delivery_jobs
FOR SELECT TO authenticated
USING (public.has_capability('deliveries.manage'));

CREATE POLICY delivery_jobs_admin_update ON public.delivery_jobs
FOR UPDATE TO authenticated
USING (public.has_capability('deliveries.manage'))
WITH CHECK (public.has_capability('deliveries.manage'));

NOTIFY pgrst, 'reload schema';
COMMIT;
