-- ============================================
-- survey_responses: online + offline эх үүсвэрийг ялгах
-- ============================================

ALTER TABLE public.survey_responses
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'online'
        CHECK (source IN ('online', 'offline')),
    ADD COLUMN IF NOT EXISTS respondent_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS respondent_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_source
    ON public.survey_responses(survey_id, source);
