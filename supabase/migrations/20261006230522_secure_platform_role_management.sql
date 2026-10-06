-- Migration: secure platform user role administration
BEGIN;

CREATE OR REPLACE FUNCTION public.set_platform_user_role(
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_old_role text;
  v_caps text[] := ARRAY[]::text[];
  v_super_admin_count integer;
BEGIN
  IF v_actor IS NULL OR NOT public.has_capability('staff.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage platform roles';
  END IF;

  IF p_role IS NULL OR p_role <> ALL (ARRAY[
    'user',
    'seller',
    'support_agent',
    'advertising_manager',
    'finance_admin',
    'marketplace_admin',
    'super_admin'
  ]) THEN
    RAISE EXCEPTION 'Invalid platform role';
  END IF;

  SELECT role INTO v_old_role
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_old_role = 'super_admin' AND p_role <> 'super_admin' THEN
    SELECT count(*)::integer INTO v_super_admin_count
    FROM public.profiles
    WHERE role = 'super_admin';

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final super administrator cannot be demoted';
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      updated_at = now()
  WHERE id = p_user_id;

  v_caps := CASE p_role
    WHEN 'marketplace_admin' THEN ARRAY[
      'products.manage',
      'stores.moderate',
      'users.moderate',
      'disputes.manage',
      'advertising.manage',
      'settings.manage',
      'deliveries.manage',
      'services.manage',
      'finance.view'
    ]::text[]
    WHEN 'finance_admin' THEN ARRAY[
      'finance.view',
      'payouts.approve',
      'disputes.manage'
    ]::text[]
    WHEN 'support_agent' THEN ARRAY[
      'users.moderate',
      'disputes.manage'
    ]::text[]
    WHEN 'advertising_manager' THEN ARRAY[
      'advertising.manage'
    ]::text[]
    WHEN 'super_admin' THEN ARRAY[
      'products.manage',
      'stores.moderate',
      'users.moderate',
      'disputes.manage',
      'payouts.approve',
      'finance.view',
      'advertising.manage',
      'settings.manage',
      'staff.manage',
      'deliveries.manage',
      'services.manage'
    ]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF p_role IN ('support_agent','advertising_manager','finance_admin','marketplace_admin','super_admin') THEN
    INSERT INTO public.platform_staff_roles (user_id, role, capabilities, granted_by, granted_at)
    VALUES (p_user_id, p_role, v_caps, v_actor, now())
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role,
          capabilities = EXCLUDED.capabilities,
          granted_by = EXCLUDED.granted_by,
          granted_at = EXCLUDED.granted_at;
  ELSE
    DELETE FROM public.platform_staff_roles WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, action, target_type, target_id, details, created_at
  ) VALUES (
    v_actor,
    'user.role_changed',
    'profile',
    p_user_id,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_role),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_platform_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_platform_user_role(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;