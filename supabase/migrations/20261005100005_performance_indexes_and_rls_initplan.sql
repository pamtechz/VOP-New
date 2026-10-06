-- Migration: 20261005100005_performance_indexes_and_rls_initplan
-- Description: Create foreign key covering indexes and optimize RLS policies for initplan evaluation

BEGIN;

-- 1. Covering indexes for all 37 unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser_id ON public.ad_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_store_id ON public.ad_campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_target_category_id ON public.ad_campaigns(target_category_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_id ON public.ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON public.conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_product_id ON public.conversations(product_id);
CREATE INDEX IF NOT EXISTS idx_conversations_store_id ON public.conversations(store_id);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer_id ON public.disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_seller_order_id ON public.disputes(seller_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON public.inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product_id ON public.inventory_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant_id ON public.inventory_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_order_id ON public.order_items(seller_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payouts_approved_by ON public.payouts(approved_by);
CREATE INDEX IF NOT EXISTS idx_payouts_store_id ON public.payouts(store_id);
CREATE INDEX IF NOT EXISTS idx_platform_staff_roles_granted_by ON public.platform_staff_roles(granted_by);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer_id ON public.reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_store_id ON public.reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_parent_order_id ON public.seller_orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_short_links_created_by ON public.short_links(created_by);
CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_account_id ON public.wallet_ledger(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists(product_id);

-- 2. Refactor STORES RLS (replace FOR ALL with explicit actions and (select auth.uid()))
ALTER POLICY "stores_write_policy" ON public.stores
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = owner_id OR public.has_capability('stores.moderate'))
  WITH CHECK ((select auth.uid()) = owner_id OR public.has_capability('stores.moderate'));

CREATE POLICY "stores_insert_owner"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY "stores_delete_owner"
  ON public.stores FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = owner_id OR public.has_capability('stores.moderate'));

-- 3. Refactor PRODUCTS RLS (replace FOR ALL with explicit actions)
ALTER POLICY "products_write_policy" ON public.products
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

CREATE POLICY "products_insert_owner"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = store_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

CREATE POLICY "products_delete_owner"
  ON public.products FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s 
    WHERE s.id = products.store_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

-- 4. Refactor PRODUCT_IMAGES RLS (replace FOR ALL with explicit actions)
ALTER POLICY "product_images_write" ON public.product_images
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_images.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_images.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

CREATE POLICY "product_images_insert_owner"
  ON public.product_images FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

CREATE POLICY "product_images_delete_owner"
  ON public.product_images FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p 
    JOIN public.stores s ON s.id = p.store_id 
    WHERE p.id = product_images.product_id 
      AND (s.owner_id = (select auth.uid()) OR public.has_capability('products.manage'))
  ));

-- 5. Optimize CARTS & CART_ITEMS RLS with (select auth.uid())
ALTER POLICY "carts_owner" ON public.carts
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "cart_items_owner" ON public.cart_items
  USING (EXISTS (
    SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = (select auth.uid())
  ));

-- 6. Optimize ORDERS & SELLER_ORDERS RLS with (select auth.uid())
ALTER POLICY "orders_buyer_read" ON public.orders
  USING ((select auth.uid()) = buyer_id OR public.has_capability('finance.view'));

ALTER POLICY "seller_orders_seller_read" ON public.seller_orders
  USING (EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = seller_orders.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('finance.view'));

ALTER POLICY "order_items_read" ON public.order_items
  USING (EXISTS (
    SELECT 1 FROM public.seller_orders so 
    JOIN public.stores s ON s.id = so.store_id 
    WHERE so.id = order_items.seller_order_id AND (s.owner_id = (select auth.uid()) OR public.has_capability('finance.view'))
  ) OR EXISTS (
    SELECT 1 FROM public.seller_orders so 
    JOIN public.orders o ON o.id = so.parent_order_id 
    WHERE so.id = order_items.seller_order_id AND o.buyer_id = (select auth.uid())
  ));

-- 7. Optimize CONVERSATIONS & MESSAGES RLS with (select auth.uid())
ALTER POLICY "convos_participant" ON public.conversations
  USING ((select auth.uid()) = buyer_id OR EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = conversations.store_id AND s.owner_id = (select auth.uid())
  ) OR public.has_capability('stores.moderate'));

ALTER POLICY "messages_participant" ON public.messages
  USING (EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = messages.conversation_id 
      AND (c.buyer_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = (select auth.uid())
      ) OR public.has_capability('stores.moderate'))
  ));

-- 8. Optimize NOTIFICATIONS, WISHLISTS, ACCOUNT_LIFECYCLE RLS
ALTER POLICY "notifications_owner" ON public.notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "wishlists_owner" ON public.wishlists
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "lifecycle_owner" ON public.account_lifecycle
  USING ((select auth.uid()) = user_id OR public.is_staff());

-- 9. Fix ad_metrics_daily & short_link_metrics_daily multiple permissive SELECT
ALTER POLICY "ad_metrics_upsert" ON public.ad_metrics_daily
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "ad_metrics_update"
  ON public.ad_metrics_daily FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

ALTER POLICY "short_link_metrics_upsert" ON public.short_link_metrics_daily
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "short_link_metrics_update"
  ON public.short_link_metrics_daily FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Track migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261005100005',
  'performance_indexes_and_rls_initplan',
  ARRAY['covering_indexes', 'rls_initplan_optimization', 'multiple_permissive_policies_elimination']
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
