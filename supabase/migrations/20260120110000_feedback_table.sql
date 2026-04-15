-- ============================================
-- Feedback table for user bug reports and suggestions
-- ============================================

CREATE TABLE IF NOT EXISTS feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL DEFAULT 'bug', -- bug, feature, support
    message TEXT NOT NULL,
    email VARCHAR(255),
    shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'new', -- new, reviewed, resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback
CREATE POLICY "Anyone can submit feedback" ON feedback
    FOR INSERT WITH CHECK (true);

-- Only admins can read/update feedback
CREATE POLICY "Admins can read feedback" ON feedback
    FOR SELECT USING (false);

CREATE POLICY "Admins can update feedback" ON feedback
    FOR UPDATE USING (false);

SELECT 'Feedback table created successfully!' as result;
