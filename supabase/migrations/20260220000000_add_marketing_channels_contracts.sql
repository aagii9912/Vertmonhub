-- Migration: Phase 8 - Marketing Channels & Contracts
-- Creates tables to manage marketing sources (channels) and their associated contracts/budgets

-- Ensure trigger function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Marketing Channels table
CREATE TABLE public.marketing_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL, -- e.g., 'Facebook Ads', 'Google Ads', 'Influencer A'
    type VARCHAR(100) NOT NULL, -- e.g., 'social', 'search', 'affiliate', 'direct'
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Channel Contracts & Setup table
CREATE TABLE public.channel_contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID REFERENCES public.marketing_channels(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    budget DECIMAL(15, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'MNT',
    terms TEXT, -- Contract terms or conditions
    kpi_target VARCHAR(255), -- e.g., '100 leads/month', 'CPA < 5000 MNT'
    contract_document_url TEXT, -- Link to signed contract if any
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_contracts ENABLE ROW LEVEL SECURITY;

-- Policies for marketing_channels
CREATE POLICY "Enable read access for all users" ON public.marketing_channels
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.marketing_channels
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.marketing_channels
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON public.marketing_channels
    FOR DELETE USING (auth.role() = 'authenticated');

-- Policies for channel_contracts
CREATE POLICY "Enable read access for all users" ON public.channel_contracts
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.channel_contracts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.channel_contracts
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON public.channel_contracts
    FOR DELETE USING (auth.role() = 'authenticated');

-- Auto-update updated_at triggers
CREATE TRIGGER update_marketing_channels_updated_at
    BEFORE UPDATE ON public.marketing_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channel_contracts_updated_at
    BEFORE UPDATE ON public.channel_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
