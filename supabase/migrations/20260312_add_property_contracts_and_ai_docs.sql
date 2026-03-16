-- ============================================
-- Vertmon Hub: Property Contracts, HubSpot Contacts Sync & AI Documents
-- Migration: 20260312_add_property_contracts_and_ai_docs.sql
-- Энэ migration нь:
--   1. property_contracts - Гэрээний мэдээлэл (Excel-ээс)
--   2. hubspot_contacts - HubSpot CRM sync table
--   3. ai_documents - AI assistant-д зориулсан баримт бичгийн сан
--   4. ai_knowledge_base - Мэдлэгийн сан (JSON)
-- ============================================

-- ============================================
-- 1. PROPERTY CONTRACTS TABLE
-- Бүх гэрээний мэдээлэл (Property Wrong Info Excel-ээс)
-- ============================================
CREATE TABLE IF NOT EXISTS property_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,

    -- Бүтээгдэхүүний мэдээлэл
    product_type VARCHAR(20) NOT NULL DEFAULT 'residential',  -- residential, parking, industry, commercial
    block_name VARCHAR(255),
    floor VARCHAR(20),
    unit_number VARCHAR(50),
    model VARCHAR(50),
    rooms INTEGER,
    contracted_area DECIMAL(10, 2),

    -- Үнийн мэдээлэл
    price_per_sqm DECIMAL(15, 2),
    total_price DECIMAL(18, 2),
    paid_amount DECIMAL(18, 2) DEFAULT 0,
    balance DECIMAL(18, 2) DEFAULT 0,
    penalty_amount DECIMAL(18, 2) DEFAULT 0,
    overdue_days INTEGER DEFAULT 0,

    -- Гэрээний мэдээлэл
    contract_number VARCHAR(100),
    contract_date DATE,
    order_date DATE,
    payment_condition VARCHAR(50),  -- 'Тусгай', 'Энгийн'
    prepayment_condition VARCHAR(20),
    remaining_payment_condition VARCHAR(100),

    -- Борлуулалтын мэдээлэл
    sales_channel VARCHAR(50),  -- ПРОПЕРТИС, БАРТЕР, БУСАД, ТҮРЭЭС, etc
    sales_manager VARCHAR(255),
    bank_status VARCHAR(100),
    barter_status VARCHAR(100),
    barter_type VARCHAR(100),

    -- Үлдэгдэл төлбөрийн нөхцөл
    balance_payment_method VARCHAR(100),  -- Банк 6% ипотек, Бэлэн, etc

    -- Хэрэглэгчийн мэдээлэл
    customer_name VARCHAR(255),
    customer_first_name VARCHAR(100),
    customer_last_name VARCHAR(100),
    customer_registration VARCHAR(50),
    customer_phone VARCHAR(50),
    customer_mobile VARCHAR(50),

    -- Огноо
    commissioning_date DATE,  -- Ашиглалтад орох огноо

    -- HubSpot холбоос
    hubspot_contact_id VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prop_contracts_shop ON property_contracts(shop_id);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_type ON property_contracts(product_type);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_block ON property_contracts(block_name);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_customer_reg ON property_contracts(customer_registration);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_customer_phone ON property_contracts(customer_phone);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_sales_channel ON property_contracts(sales_channel);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_sales_manager ON property_contracts(sales_manager);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_bank_status ON property_contracts(bank_status);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_contract_date ON property_contracts(contract_date);

-- ============================================
-- 2. HUBSPOT CONTACTS TABLE
-- HubSpot CRM-тэй sync хийх хүснэгт
-- ============================================
CREATE TABLE IF NOT EXISTS hubspot_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,

    -- HubSpot мэдээлэл
    hubspot_record_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile_phone VARCHAR(50),

    -- CRM мэдээлэл
    lifecycle_stage VARCHAR(50),  -- Lead, MQL, SQL, Customer
    lead_status VARCHAR(50),
    contact_owner VARCHAR(255),

    -- Traffic Source
    original_source VARCHAR(100),
    original_source_drill VARCHAR(255),
    latest_source VARCHAR(100),
    lead_source VARCHAR(100),

    -- Байршил
    city VARCHAR(100),
    country VARCHAR(100),

    -- Гэрээний холбоос
    has_property_contract BOOLEAN DEFAULT false,
    assigned_manager VARCHAR(255),

    -- Meta
    hubspot_created_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hub_contacts_shop ON hubspot_contacts(shop_id);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_hubspot_id ON hubspot_contacts(hubspot_record_id);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_lifecycle ON hubspot_contacts(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_lead_status ON hubspot_contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_has_contract ON hubspot_contacts(has_property_contract);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_phone ON hubspot_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_hub_contacts_source ON hubspot_contacts(original_source);

-- ============================================
-- 3. AI DOCUMENTS TABLE
-- AI assistant-д зориулсан баримт бичгийн сан
-- Vector embeddings-тэй (pgvector ашиглана)
-- ============================================

-- Enable pgvector extension (if available)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,

    -- Баримт бичгийн мэдээлэл
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    source VARCHAR(50) NOT NULL,  -- 'property_contracts', 'hubspot_contacts', 'hubspot_segments', 'manual'
    document_type VARCHAR(50),  -- 'contract', 'contact', 'segment', 'faq', 'policy'

    -- Vector embedding (1536 dimensions for OpenAI / 768 for smaller models)
    embedding vector(1536),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_docs_shop ON ai_documents(shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_docs_source ON ai_documents(source);
CREATE INDEX IF NOT EXISTS idx_ai_docs_type ON ai_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_ai_docs_metadata ON ai_documents USING gin(metadata);

-- Vector similarity search index (IVFFlat for performance)
-- CREATE INDEX IF NOT EXISTS idx_ai_docs_embedding ON ai_documents 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Note: Uncomment above after inserting enough documents (>1000)

-- ============================================
-- 4. AI KNOWLEDGE BASE TABLE
-- Бүтэцлэгдсэн мэдлэгийн сан
-- ============================================
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,

    -- Мэдлэгийн ангилал
    category VARCHAR(50) NOT NULL,  -- 'company', 'sales', 'crm', 'managers', 'projects', 'payment'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(shop_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_ai_kb_shop ON ai_knowledge_base(shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_kb_category ON ai_knowledge_base(category);

-- ============================================
-- 5. VECTOR SEARCH FUNCTION
-- AI документуудаас хайх функц
-- ============================================
CREATE OR REPLACE FUNCTION match_ai_documents(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.78,
    match_count INT DEFAULT 5,
    p_shop_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    source VARCHAR(50),
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ai_documents.id,
        ai_documents.content,
        ai_documents.metadata,
        ai_documents.source,
        1 - (ai_documents.embedding <=> query_embedding) AS similarity
    FROM ai_documents
    WHERE
        (p_shop_id IS NULL OR ai_documents.shop_id = p_shop_id)
        AND ai_documents.embedding IS NOT NULL
        AND 1 - (ai_documents.embedding <=> query_embedding) > match_threshold
    ORDER BY ai_documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- 6. CONTRACT STATISTICS VIEW
-- Борлуулалтын статистикийн view
-- ============================================
CREATE OR REPLACE VIEW contract_statistics AS
SELECT
    shop_id,
    product_type,
    sales_channel,
    COUNT(*) as contract_count,
    SUM(total_price) as total_sales,
    SUM(paid_amount) as total_paid,
    SUM(balance) as total_balance,
    CASE 
        WHEN SUM(total_price) > 0 
        THEN ROUND((SUM(paid_amount) / SUM(total_price) * 100)::numeric, 1)
        ELSE 0 
    END as collection_rate_pct,
    AVG(contracted_area) as avg_area_sqm,
    AVG(price_per_sqm) as avg_price_per_sqm
FROM property_contracts
GROUP BY shop_id, product_type, sales_channel;

-- ============================================
-- 7. MANAGER PERFORMANCE VIEW
-- Менежерийн гүйцэтгэлийн view
-- ============================================
CREATE OR REPLACE VIEW manager_performance AS
SELECT
    shop_id,
    sales_manager,
    COUNT(*) as contract_count,
    SUM(total_price) as total_sales,
    SUM(paid_amount) as total_collected,
    SUM(balance) as total_outstanding,
    CASE 
        WHEN SUM(total_price) > 0 
        THEN ROUND((SUM(paid_amount) / SUM(total_price) * 100)::numeric, 1)
        ELSE 0 
    END as collection_rate_pct,
    COUNT(DISTINCT customer_registration) as unique_customers
FROM property_contracts
WHERE sales_manager IS NOT NULL
GROUP BY shop_id, sales_manager;

-- ============================================
-- 8. LEAD FUNNEL VIEW (HubSpot)
-- Lead conversion funnel view
-- ============================================
CREATE OR REPLACE VIEW lead_funnel AS
SELECT
    shop_id,
    lifecycle_stage,
    lead_status,
    original_source,
    has_property_contract,
    COUNT(*) as contact_count,
    COUNT(*) FILTER (WHERE has_property_contract = true) as converted_count
FROM hubspot_contacts
GROUP BY shop_id, lifecycle_stage, lead_status, original_source, has_property_contract;

-- ============================================
-- 9. TRIGGERS
-- ============================================

-- Auto-update timestamp for property_contracts
CREATE OR REPLACE FUNCTION update_contract_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contract_updated_at ON property_contracts;
CREATE TRIGGER contract_updated_at
    BEFORE UPDATE ON property_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_timestamp();

-- Auto-update timestamp for hubspot_contacts
DROP TRIGGER IF EXISTS hubspot_contact_updated_at ON hubspot_contacts;
CREATE TRIGGER hubspot_contact_updated_at
    BEFORE UPDATE ON hubspot_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_timestamp();

-- ============================================
-- 10. RLS POLICIES
-- ============================================
ALTER TABLE property_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Property Contracts: Shop owners only
CREATE POLICY "shop_owners_manage_contracts"
    ON property_contracts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shops 
            WHERE shops.id = property_contracts.shop_id 
            AND shops.user_id = auth.uid()
        )
    );

-- HubSpot Contacts: Shop owners only
CREATE POLICY "shop_owners_manage_hubspot"
    ON hubspot_contacts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shops 
            WHERE shops.id = hubspot_contacts.shop_id 
            AND shops.user_id = auth.uid()
        )
    );

-- AI Documents: Shop owners only
CREATE POLICY "shop_owners_manage_ai_docs"
    ON ai_documents FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shops 
            WHERE shops.id = ai_documents.shop_id 
            AND shops.user_id = auth.uid()
        )
    );

-- AI Knowledge Base: Shop owners only
CREATE POLICY "shop_owners_manage_ai_kb"
    ON ai_knowledge_base FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shops 
            WHERE shops.id = ai_knowledge_base.shop_id 
            AND shops.user_id = auth.uid()
        )
    );

-- Service role can access all (for API/seeding)
CREATE POLICY "service_role_all_contracts"
    ON property_contracts FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "service_role_all_hubspot"
    ON hubspot_contacts FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "service_role_all_ai_docs"
    ON ai_documents FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "service_role_all_ai_kb"
    ON ai_knowledge_base FOR ALL
    TO service_role
    USING (true);

-- ============================================
-- SUCCESS
-- ============================================
SELECT 'Property Contracts, HubSpot Contacts, AI Documents & Knowledge Base tables created ✅' as result;
