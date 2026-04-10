-- Landing Page CMS Content Table
-- Single-row config table storing all landing page sections as JSONB

CREATE TABLE IF NOT EXISTS landing_content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hero jsonb DEFAULT '{}',
    metrics jsonb DEFAULT '[]',
    features jsonb DEFAULT '{}',
    how_it_works jsonb DEFAULT '{}',
    social_proof jsonb DEFAULT '{}',
    pricing jsonb DEFAULT '{}',
    comparison jsonb DEFAULT '[]',
    faq jsonb DEFAULT '{}',
    cta jsonb DEFAULT '{}',
    footer jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now(),
    updated_by text
);

-- Enable RLS
ALTER TABLE landing_content ENABLE ROW LEVEL SECURITY;

-- Public read access (landing page needs to read this)
CREATE POLICY "Public can read landing content"
    ON landing_content FOR SELECT
    USING (true);

-- Only service role can insert/update (via API route with admin auth)
CREATE POLICY "Service role can manage landing content"
    ON landing_content FOR ALL
    USING (auth.role() = 'service_role');
