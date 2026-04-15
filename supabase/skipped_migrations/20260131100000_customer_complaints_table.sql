-- Customer Complaints Table for Sentiment Tracking (Improvement #2)
-- This table stores customer complaints logged by AI for sentiment tracking

CREATE TABLE IF NOT EXISTS public.customer_complaints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    complaint_type TEXT NOT NULL CHECK (complaint_type IN ('product_quality', 'delivery', 'service', 'price', 'other')),
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;

-- Simple RLS: Allow all operations for authenticated service role
-- The actual authorization is handled at the application level
CREATE POLICY "Allow all for service role"
ON public.customer_complaints
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_customer_complaints_shop_id ON public.customer_complaints(shop_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_customer_id ON public.customer_complaints(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_status ON public.customer_complaints(status);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_severity ON public.customer_complaints(severity);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_created_at ON public.customer_complaints(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_customer_complaints_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_customer_complaints_updated_at
    BEFORE UPDATE ON public.customer_complaints
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_complaints_updated_at();

-- Comment
COMMENT ON TABLE public.customer_complaints IS 'Stores customer complaints logged by AI chatbot for sentiment tracking and analysis';
