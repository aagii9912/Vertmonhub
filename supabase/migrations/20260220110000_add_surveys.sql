-- supabase/migrations/20260220_add_surveys.sql
-- Description: Adds surveys table to store survey metadata and questions

CREATE TABLE IF NOT EXISTS public.surveys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    questions JSONB NOT NULL DEFAULT '[]', -- Array of question objects { id, type, text, options, required }
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Survey Responses table
CREATE TABLE IF NOT EXISTS public.survey_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL, -- Optional if anonymous
    answers JSONB NOT NULL DEFAULT '{}', -- Key-value pairs of question_id: answer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS policies for surveys
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Allow read access to all for active surveys (so customers can view them)
CREATE POLICY "Enable read access for all on active surveys" ON public.surveys
    FOR SELECT
    USING (is_active = true);

-- Allow full access to authenticated users (admins) for surveys
CREATE POLICY "Enable full access for authenticated users on surveys" ON public.surveys
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Allow insert access to authenticated users for survey responses
CREATE POLICY "Enable insert for authenticated users on survey responses" ON public.survey_responses
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Allow full access to authenticated users (admins) for survey responses
CREATE POLICY "Enable full access for authenticated users on survey responses" ON public.survey_responses
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Add function and trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_surveys_updated_at ON public.surveys;
CREATE TRIGGER set_surveys_updated_at
    BEFORE UPDATE ON public.surveys
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
