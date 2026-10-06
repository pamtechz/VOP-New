-- Migration: 20261005100003_rbac_profile_protection_and_addresses
-- Description: Implement platform staff RBAC, protect profile roles, normalize addresses, and create safe public platform config

BEGIN;

-- 1. Helper function: has_capability
CREATE OR REPLACE FUNCTION public.has_capability(p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff_roles
    WHERE user_id = (SELECT auth.uid())
      AND (role = 'super_admin' OR p_cap = ANY(capabilities))
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  );
$$;

-- 2. Helper function: is_staff
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff_roles
    WHERE user_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

-- 3. Seed initial super_admin into platform_staff_roles
INSERT INTO public.platform_staff_roles (user_id, role, capabilities, granted_at)
VALUES (
  '4773f9fa-4661-4ff2-b3b6-523e26f40b6a',
  'super_admin',
  ARRAY[
    'products.manage',
    'stores.moderate',
    'users.moderate',
    'disputes.manage',
    'payouts.approve',
    'finance.view',
    'advertising.manage',
    'settings.manage',
    'staff.manage'
  ],
  NOW()
)
ON CONFLICT (user_id, role) DO UPDATE
SET capabilities = EXCLUDED.capabilities;

-- 4. RLS for platform_staff_roles
ALTER TABLE public.platform_staff_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_view_roles" ON public.platform_staff_roles;
CREATE POLICY "staff_view_roles"
  ON public.platform_staff_roles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id OR public.has_capability('staff.manage'));

DROP POLICY IF EXISTS "super_admin_manage_staff" ON public.platform_staff_roles;
CREATE POLICY "super_admin_manage_staff"
  ON public.platform_staff_roles
  FOR ALL
  TO authenticated
  USING (public.has_capability('staff.manage'))
  WITH CHECK (public.has_capability('staff.manage'));

-- 5. Trigger to prevent profile role escalation
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role) THEN
    IF NOT public.has_capability('staff.manage') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only authorized staff can modify roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 6. Protect profiles table and create safe public_profiles view
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  full_name,
  avatar_url,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

DROP POLICY IF EXISTS "profiles_read_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own_or_staff"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id OR public.has_capability('users.moderate'));

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 7. Normalized addresses table (Phase 22)
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  street text NOT NULL,
  area text NOT NULL,
  city text NOT NULL,
  province text NOT NULL,
  phone text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_unique_default_per_user 
  ON public.addresses(user_id) WHERE is_default = true;

DROP POLICY IF EXISTS "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own"
  ON public.addresses FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "addresses_insert_own" ON public.addresses;
CREATE POLICY "addresses_insert_own"
  ON public.addresses FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "addresses_update_own" ON public.addresses;
CREATE POLICY "addresses_update_own"
  ON public.addresses FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "addresses_delete_own" ON public.addresses;
CREATE POLICY "addresses_delete_own"
  ON public.addresses FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 8. Platform settings security and public_platform_config view (Phase 44)
-- Seed standard config keys
INSERT INTO public.platform_settings (key, value, description)
VALUES 
  ('default_currency', '"ZMW"'::jsonb, 'Marketplace ISO 4217 base currency code'),
  ('currency_symbol', '"K"'::jsonb, 'Marketplace base currency display symbol'),
  ('marketplace_commission_bps', '500'::jsonb, 'Default marketplace commission in basis points (500 = 5.00%)'),
  ('minimum_payout_amount', '100.00'::jsonb, 'Minimum wallet balance required for seller payout in ZMW'),
  ('settlement_period_days', '2'::jsonb, 'Default settlement period in days for seller proceeds')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

CREATE OR REPLACE VIEW public.public_platform_config AS
SELECT
  key,
  value,
  description
FROM public.platform_settings
WHERE key IN (
  'default_currency',
  'currency_symbol',
  'marketplace_commission_bps',
  'minimum_payout_amount',
  'settlement_period_days',
  'short_link_domain',
  'resource_mode',
  'max_images_per_product_free',
  'inactivity_period_months'
);

GRANT SELECT ON public.public_platform_config TO anon, authenticated;

-- Restrict direct access to platform_settings to staff with settings.manage
DROP POLICY IF EXISTS "platform_settings_public_read" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_staff_read" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_staff_modify" ON public.platform_settings;

CREATE POLICY "platform_settings_staff_read"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.has_capability('settings.manage'));

CREATE POLICY "platform_settings_staff_modify"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (public.has_capability('settings.manage'))
  WITH CHECK (public.has_capability('settings.manage'));

-- Track migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261005100003',
  'rbac_profile_protection_and_addresses',
  ARRAY['rbac', 'profile_role_trigger', 'public_profiles', 'addresses', 'public_platform_config']
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
