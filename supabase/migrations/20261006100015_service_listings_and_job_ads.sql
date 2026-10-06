-- Migration: Service Listings, Housekeeper Ads & Job Advertisements with Interview Expiration
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('cleaning', 'maid_housekeeper', 'caretaker_keeper', 'general_job', 'maintenance', 'other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    provider_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    location TEXT,
    pay_rate TEXT,
    interview_date TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performant querying of active non-expired listings
CREATE INDEX IF NOT EXISTS idx_service_listings_active_expiry 
ON public.service_listings(is_active, interview_date);

-- Enable RLS
ALTER TABLE public.service_listings ENABLE ROW LEVEL SECURITY;

-- Public can view active non-expired listings
CREATE POLICY "Public can view active non-expired service listings"
ON public.service_listings FOR SELECT
USING (
    is_active = true 
    AND interview_date >= NOW() 
    AND expires_at >= NOW()
);

-- Users can insert their own listings
CREATE POLICY "Users can insert own service listings"
ON public.service_listings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own listings
CREATE POLICY "Users can update own service listings"
ON public.service_listings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own service listings"
ON public.service_listings FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all service listings
CREATE POLICY "Admins full access to service listings"
ON public.service_listings FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
);

-- Ensure backward schema compatibility for messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS skip_broadcast BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_url_type TEXT DEFAULT 'none';

-- Function to purge/deactivate expired listings past their interview date
CREATE OR REPLACE FUNCTION public.purge_expired_service_listings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Soft delete or hard delete listings past interview_date or expires_at
    DELETE FROM public.service_listings
    WHERE interview_date < NOW() OR expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
