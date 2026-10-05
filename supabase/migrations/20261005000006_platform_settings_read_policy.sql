-- Migration: 20261005000006_platform_settings_read_policy.sql
-- Description: Allow public read of platform_settings so clients can dynamically resolve base currency, symbols, and platform configs.

DROP POLICY IF EXISTS platform_settings_public_read ON public.platform_settings;
CREATE POLICY platform_settings_public_read ON public.platform_settings
    FOR SELECT USING (true);
