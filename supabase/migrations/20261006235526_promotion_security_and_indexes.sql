-- Migration: close promotion linter findings
BEGIN;

REVOKE ALL ON FUNCTION public.sync_promotion_redemption_status()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_promotion_redemption_status()
TO service_role;

CREATE INDEX IF NOT EXISTS idx_orders_promotion_id
  ON public.orders(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_user_id
  ON public.promotion_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promotions_created_by
  ON public.promotions(created_by);

COMMIT;