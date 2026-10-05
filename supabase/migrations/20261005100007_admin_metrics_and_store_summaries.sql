-- Migration: 20261005100007_admin_metrics_and_store_summaries.sql
-- Description: Server-side aggregation for Admin Dashboard and Store Summaries with real metrics

CREATE OR REPLACE VIEW public.admin_store_summaries
WITH (security_invoker = true)
AS
SELECT s.id, s.name, s.slug, s.status, s.created_at,
       COUNT(DISTINCT p.id)::integer as product_count,
       COALESCE(sp.name, 'Free Plan') as plan_name
FROM public.stores s
LEFT JOIN public.products p ON p.store_id = s.id
LEFT JOIN public.subscriptions sub ON sub.store_id = s.id AND sub.status = 'active'
LEFT JOIN public.subscription_plans sp ON sp.id = sub.plan_id
GROUP BY s.id, s.name, s.slug, s.status, s.created_at, sp.name;

GRANT SELECT ON public.admin_store_summaries TO authenticated;
REVOKE SELECT ON public.admin_store_summaries FROM anon;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users_count integer;
  v_stores_count integer;
  v_products_count integer;
  v_orders_count integer;
  v_revenue numeric;
  v_withdrawals numeric;
  v_active_ads integer;
  v_short_links integer;
  v_messages_count integer;
BEGIN
  IF NOT has_capability('finance.view') THEN
    RAISE EXCEPTION 'Unauthorized: finance.view capability required';
  END IF;

  SELECT count(*) INTO v_users_count FROM public.profiles;
  SELECT count(*) INTO v_stores_count FROM public.stores WHERE status = 'active';
  SELECT count(*) INTO v_products_count FROM public.products WHERE status = 'active';
  SELECT count(*) INTO v_orders_count FROM public.orders;
  SELECT COALESCE(sum(total_amount), 0) INTO v_revenue FROM public.orders WHERE payment_status = 'paid';
  SELECT COALESCE(sum(amount), 0) INTO v_withdrawals FROM public.payouts WHERE status = 'pending';
  SELECT count(*) INTO v_active_ads FROM public.ad_campaigns WHERE status = 'active';
  SELECT count(*) INTO v_short_links FROM public.short_links;
  SELECT count(*) INTO v_messages_count FROM public.messages;

  RETURN jsonb_build_object(
    'total_users', v_users_count,
    'active_stores', v_stores_count,
    'total_products', v_products_count,
    'total_orders', v_orders_count,
    'total_revenue', v_revenue,
    'pending_withdrawals', v_withdrawals,
    'active_ads', v_active_ads,
    'short_links_created', v_short_links,
    'total_messages', v_messages_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() FROM anon;
