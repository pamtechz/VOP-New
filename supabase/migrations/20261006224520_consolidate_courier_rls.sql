-- Migration: consolidate courier RLS and protect verification state
BEGIN;

DROP POLICY IF EXISTS "Drivers can manage own profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "Public can view online drivers metadata" ON public.driver_profiles;
DROP POLICY IF EXISTS driver_profiles_admin_select ON public.driver_profiles;
DROP POLICY IF EXISTS driver_profiles_admin_update ON public.driver_profiles;

CREATE POLICY driver_profiles_select ON public.driver_profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.has_capability('deliveries.manage')
  OR EXISTS (
    SELECT 1
    FROM public.delivery_jobs dj
    WHERE dj.driver_id = driver_profiles.id
      AND (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = dj.order_id AND o.buyer_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.seller_orders so
          JOIN public.stores s ON s.id = so.store_id
          WHERE so.id = dj.seller_order_id
            AND s.owner_id = (SELECT auth.uid())
        )
      )
  )
);

CREATE POLICY driver_profiles_insert ON public.driver_profiles
FOR INSERT TO authenticated
WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY driver_profiles_update ON public.driver_profiles
FOR UPDATE TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.has_capability('deliveries.manage')
)
WITH CHECK (
  id = (SELECT auth.uid())
  OR public.has_capability('deliveries.manage')
);

CREATE POLICY driver_profiles_delete ON public.driver_profiles
FOR DELETE TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.has_capability('deliveries.manage')
);

CREATE OR REPLACE FUNCTION public.protect_driver_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT public.has_capability('deliveries.manage') THEN
    RAISE EXCEPTION 'Only authorized delivery administrators may change courier verification status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_verification_status ON public.driver_profiles;
CREATE TRIGGER trg_protect_driver_verification_status
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_driver_verification_status();

DROP POLICY IF EXISTS "Participants view delivery jobs" ON public.delivery_jobs;
DROP POLICY IF EXISTS "Participants can view and interact with delivery jobs" ON public.delivery_jobs;
DROP POLICY IF EXISTS delivery_jobs_admin_select ON public.delivery_jobs;

CREATE POLICY delivery_jobs_select ON public.delivery_jobs
FOR SELECT TO authenticated
USING (
  public.has_capability('deliveries.manage')
  OR driver_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_jobs.order_id
      AND o.buyer_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.seller_orders so
    JOIN public.stores s ON s.id = so.store_id
    WHERE so.id = delivery_jobs.seller_order_id
      AND s.owner_id = (SELECT auth.uid())
  )
  OR status = 'unassigned'
);

DROP POLICY IF EXISTS delivery_jobs_admin_update ON public.delivery_jobs;
CREATE POLICY delivery_jobs_admin_update ON public.delivery_jobs
FOR UPDATE TO authenticated
USING (public.has_capability('deliveries.manage'))
WITH CHECK (public.has_capability('deliveries.manage'));

NOTIFY pgrst, 'reload schema';
COMMIT;