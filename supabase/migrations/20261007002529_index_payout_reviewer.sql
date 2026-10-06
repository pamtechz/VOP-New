-- Migration: index payout reviewer foreign key
BEGIN;

CREATE INDEX IF NOT EXISTS idx_payouts_reviewed_by
  ON public.payouts(reviewed_by);

COMMIT;