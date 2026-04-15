-- Vertmon Hub: Real Estate Platform Migration
-- This migration adds properties and leads tables for real estate CRM

-- Create property_type enum
DO $$ BEGIN
    CREATE TYPE property_type AS ENUM ('apartment', 'house', 'office', 'land', 'commercial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create property_status enum
DO $$ BEGIN
    CREATE TYPE property_status AS ENUM ('available', 'reserved', 'sold', 'rented');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create lead_status enum
DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- PROPERTIES TABLE (replaces products for real estate)
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type property_type NOT NULL DEFAULT 'apartment',
    
    -- Pricing
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    price_per_sqm DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'MNT',
    
    -- Specifications
    size_sqm DECIMAL(10, 2),
    rooms INTEGER,
    bedrooms INTEGER,
    bathrooms INTEGER,
    floor VARCHAR(20),  -- e.g., "5/12" or "Ground"
    year_built INTEGER,
    
    -- Location
    address TEXT,
    district VARCHAR(100),
    city VARCHAR(100) DEFAULT 'Ulaanbaatar',
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    
    -- Status
    status property_status NOT NULL DEFAULT 'available',
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    
    -- Media
    images TEXT[] DEFAULT '{}',
    video_url TEXT,
    virtual_tour_url TEXT,
    
    -- Features (JSONB for flexibility)
    features JSONB DEFAULT '[]',
    amenities JSONB DEFAULT '[]',
    
    -- Meta
    views_count INTEGER DEFAULT 0,
    inquiries_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for properties
CREATE INDEX IF NOT EXISTS idx_properties_shop_id ON properties(shop_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_district ON properties(district);
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON properties(is_active);

-- ============================================
-- LEADS TABLE (replaces orders for real estate CRM)
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    
    -- Lead Info
    status lead_status NOT NULL DEFAULT 'new',
    source VARCHAR(50) DEFAULT 'messenger',  -- messenger, instagram, website, referral
    
    -- Customer Info (denormalized for quick access)
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    
    -- Requirements
    budget_min DECIMAL(15, 2),
    budget_max DECIMAL(15, 2),
    preferred_type property_type,
    preferred_district VARCHAR(100),
    preferred_rooms INTEGER,
    preferred_size_min DECIMAL(10, 2),
    preferred_size_max DECIMAL(10, 2),
    
    -- Timeline
    move_in_date DATE,
    urgency VARCHAR(20) DEFAULT 'normal',  -- urgent, normal, flexible
    
    -- CRM Integration
    hubspot_deal_id VARCHAR(100),
    hubspot_contact_id VARCHAR(100),
    
    -- Activity
    last_contact_at TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,
    viewing_scheduled_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Assignment
    assigned_to UUID,  -- staff member
    
    -- Conversion
    converted_at TIMESTAMPTZ,
    conversion_value DECIMAL(15, 2),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for leads
CREATE INDEX IF NOT EXISTS idx_leads_shop_id ON leads(shop_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_property_id ON leads(property_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- ============================================
-- PROPERTY VIEWINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS property_viewings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled',  -- scheduled, completed, cancelled, no_show
    
    -- Feedback
    customer_feedback TEXT,
    agent_notes TEXT,
    interest_level INTEGER,  -- 1-5 rating
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_viewings_lead_id ON property_viewings(lead_id);
CREATE INDEX IF NOT EXISTS idx_viewings_property_id ON property_viewings(property_id);
CREATE INDEX IF NOT EXISTS idx_viewings_scheduled_at ON property_viewings(scheduled_at);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger for properties
CREATE OR REPLACE FUNCTION update_property_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_updated_at ON properties;
CREATE TRIGGER properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION update_property_timestamp();

-- Update timestamp trigger for leads
CREATE OR REPLACE FUNCTION update_lead_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_lead_timestamp();

-- Increment property inquiry count when lead is created
CREATE OR REPLACE FUNCTION increment_property_inquiries()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.property_id IS NOT NULL THEN
        UPDATE properties 
        SET inquiries_count = inquiries_count + 1 
        WHERE id = NEW.property_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_increment_inquiries ON leads;
CREATE TRIGGER leads_increment_inquiries
    AFTER INSERT ON leads
    FOR EACH ROW
    EXECUTE FUNCTION increment_property_inquiries();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_viewings ENABLE ROW LEVEL SECURITY;

-- Properties policies
CREATE POLICY "Authenticated users can view active properties"
    ON properties FOR SELECT
    USING (is_active = true);

CREATE POLICY "Shop owners can manage their properties"
    ON properties FOR ALL
    USING (shop_id = get_user_shop_id());

-- Leads policies
CREATE POLICY "Shop owners can view their leads"
    ON leads FOR SELECT
    USING (shop_id = get_user_shop_id());

CREATE POLICY "Shop owners can manage their leads"
    ON leads FOR ALL
    USING (shop_id = get_user_shop_id());

-- Viewings policies
CREATE POLICY "Shop owners can manage viewings"
    ON property_viewings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = property_viewings.lead_id
            AND leads.shop_id = get_user_shop_id()
        )
    );
