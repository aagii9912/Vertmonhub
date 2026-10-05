-- Ажилтны утас: Админ → Хэрэглэгчид хэсгээс (хэрэглэгч нэмэх, урих, «Засах») хадгална.
-- Багана 002_auth_and_oauth.sql-д байсан ч код уншиж/бичдэггүй байсан тул production-д
-- байгаа эсэхийг баталгаажуулна. Утга нь сервер талд нормчилсон 8 оронтой дугаар.
-- Additive, idempotent: багана, формат шалгалт, тайлбар. Хуучин утгад алдаа өгөхгүйн тулд
-- CHECK нь NOT VALID (зөвхөн шинэ/өөрчилсөн мөрөнд үйлчилнэ). Өгөгдөл өөрчлөхгүй.
-- Эрх: user_profiles нь өмнөх self RLS-ээ хадгална; бусад ажилтны утсыг зөвхөн
-- super_admin API (service_role) уншина.

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_phone_format'
          AND conrelid = 'public.user_profiles'::regclass
    ) THEN
        ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_phone_format
            CHECK (phone IS NULL OR phone ~ '^[0-9]{8}$') NOT VALID;
    END IF;
END $$;

COMMENT ON COLUMN public.user_profiles.phone IS
    'Ажилтны утас (8 оронтой, нормчилсон; Админ → Хэрэглэгчид хэсгээс удирдана)';
