-- Standalone newsletter rollout; does not enable or modify ERP features.
CREATE TABLE IF NOT EXISTS newsletter_settings (
  shop_id uuid PRIMARY KEY REFERENCES shops(id),
  segment_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletters (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 50000),
  broadcast_id text UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preparing','sending','queued','sent','failed','unknown')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newsletters_shop_idx ON newsletters(shop_id, created_at DESC);
ALTER TABLE newsletter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON newsletter_settings, newsletters FROM anon, authenticated;
GRANT ALL ON newsletter_settings, newsletters TO service_role;

-- Existing broadcasts retain the original renderer when design is NULL.
ALTER TABLE public.newsletters ADD COLUMN IF NOT EXISTS design jsonb;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletters_design_object' AND conrelid = 'public.newsletters'::regclass) THEN
        ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_design_object CHECK (design IS NULL OR jsonb_typeof(design) = 'object');
    END IF;
END $$;

-- Project-specific senders and audiences. Existing shop-wide drafts remain intact.
CREATE TABLE IF NOT EXISTS public.newsletter_project_settings (
    project_id uuid PRIMARY KEY REFERENCES public.projects(id),
    shop_id uuid NOT NULL REFERENCES public.shops(id),
    from_email text NOT NULL,
    from_name text NOT NULL,
    segment_id text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.newsletters ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
CREATE INDEX IF NOT EXISTS newsletters_project_idx ON public.newsletters(shop_id, project_id, created_at DESC);
ALTER TABLE public.newsletter_project_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_project_settings FROM anon, authenticated;
GRANT ALL ON public.newsletter_project_settings TO service_role;
