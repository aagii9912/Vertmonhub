-- Owner request 2026-11-27 (Mandala Garden only): there a plan is always named with its area («A 96.53 м²»),
-- because the same letter is another plan in the next block and its area changes by floor. A per-project
-- display switch: where it is on, the meeting interest picker and the price page show a model together with
-- its register area. It changes no price, no stored value and no other project (default false).
-- Additive and idempotent.

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS model_with_area boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.model_with_area IS
    'Display only: show a model together with its register area (м²) in the meeting picker and on the price page.';
