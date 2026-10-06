-- Migration: Fix product_images file_size_bytes null constraint & message editing columns

-- 1. Default file_size_bytes to 0 on product_images table to prevent insert failures
ALTER TABLE public.product_images 
ALTER COLUMN file_size_bytes SET DEFAULT 0;

-- 2. Allow NULL on file_size_bytes if needed for external image URLs
ALTER TABLE public.product_images 
ALTER COLUMN file_size_bytes DROP NOT NULL;

-- 3. Message editing columns
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
