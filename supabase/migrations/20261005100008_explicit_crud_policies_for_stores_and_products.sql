-- Migration: 20261005100008_explicit_crud_policies_for_stores_and_products.sql
-- Description: Replace broad ALL write policies with explicit INSERT, UPDATE, DELETE policies to prevent multiple permissive evaluation overhead

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS stores_write_policy ON public.stores';
  EXECUTE 'DROP POLICY IF EXISTS products_write_policy ON public.products';
  EXECUTE 'DROP POLICY IF EXISTS product_images_write ON public.product_images';
END $$;

CREATE POLICY stores_insert_owner ON public.stores
FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()) OR has_capability('stores.moderate'));

CREATE POLICY stores_update_owner ON public.stores
FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid()) OR has_capability('stores.moderate'))
WITH CHECK (owner_id = (SELECT auth.uid()) OR has_capability('stores.moderate'));

CREATE POLICY stores_delete_owner ON public.stores
FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid()) OR has_capability('stores.moderate'));

CREATE POLICY products_insert_owner ON public.products
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.stores s 
  WHERE s.id = products.store_id 
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));

CREATE POLICY products_update_owner ON public.products
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stores s 
  WHERE s.id = products.store_id 
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.stores s 
  WHERE s.id = products.store_id 
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));

CREATE POLICY products_delete_owner ON public.products
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stores s 
  WHERE s.id = products.store_id 
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));

CREATE POLICY product_images_insert_owner ON public.product_images
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.id = product_images.product_id
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));

CREATE POLICY product_images_update_owner ON public.product_images
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.id = product_images.product_id
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.id = product_images.product_id
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));

CREATE POLICY product_images_delete_owner ON public.product_images
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.id = product_images.product_id
    AND (s.owner_id = (SELECT auth.uid()) OR has_capability('products.manage'))
));
