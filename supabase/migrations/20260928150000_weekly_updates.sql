-- Хурлын шинэчлэл: хувийн user_tasks-ийг багт ил болгохгүй.
-- Бүх унших/бичих үйлдэл dashboard модуль, байгууллага, хэрэглэгчийг API дээр шалгана.
CREATE TABLE public.weekly_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meeting_date date NOT NULL CHECK (extract(isodow FROM meeting_date) = 3),
    author_name text NOT NULL,
    achievements text NOT NULL DEFAULT '' CHECK (char_length(achievements) <= 4000),
    blockers text NOT NULL DEFAULT '' CHECK (char_length(blockers) <= 4000),
    next_steps text NOT NULL DEFAULT '' CHECK (char_length(next_steps) <= 4000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT weekly_updates_nonempty CHECK (length(trim(achievements) || trim(blockers) || trim(next_steps)) > 0),
    UNIQUE (shop_id, user_id, meeting_date)
);
CREATE INDEX weekly_updates_meeting_idx ON public.weekly_updates (shop_id, meeting_date, id);
ALTER TABLE public.weekly_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.weekly_updates TO service_role;
COMMENT ON TABLE public.weekly_updates IS 'Лхагва гарагийн хуралд ажилтан өөрөө оруулсан шинэчлэл. Reports эрхтэй хүн багийн шинэчлэлийг харна.';
