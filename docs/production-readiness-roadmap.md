# Vertmon Hub — Production-Readiness: Бүх модулийн аудит ба гүнзгий сайжруулалтын төлөвлөгөө

> **Үр дүн:** зөвхөн замын зураг (roadmap) баримт — энэ удаад код бичихгүй.
> Өмнөх roadmap-ууд `docs/{crm-audit,erp,marketing,metrics-reference,ai-assistant-security-audit}.md`-д хэвээр.

## Context (Яагаад)

CRM/ERP/Marketing/AI-г сайжруулсан. Одоо **үлдсэн бүх модулийг** (Inbox, Viewings, Properties,
Customer-service, Surveys, Reports, Settings, Admin, Push) болон **cross-cutting production-readiness**-ийг
3 агентаар аудитлав. Гол дүгнэлт: **feature-complete ч production-ready биш.**

**Батлагдсан CRITICAL эрсдэлүүд:**
- **`surveys`/`survey_responses`-д `shop_id` БАЙХГҮЙ** → бүх shop-ийн судалгаа бүгдэд ил (multi-tenant leak). `api/surveys` shop-оор шүүдэггүй.
- **`property_viewings`-д `shop_id` БАЙХГҮЙ** → client query `.eq('shop_id')` алдаа өгнө, зөвхөн RLS (leads-join)-д найдсан; viewings UI эвдэрхий магадлалтай.
- **8 шинэ хүснэгт RLS-тэй ч policy-гүй** (`shop_members`, `finance_*`, `procurement`, `project_budgets`, `social_insights`, `lead_attribution_events`, `ai_audit_log`) — service-role-д л найдсан.
- **FB/IG токен plaintext** (`shops.facebook_page_access_token`); `admin/setup` нь GET + secret.
- **Inbox `smarthub_active_shop_id` localStorage түлхүүр** ашигладаг (бусад нь `vertmonhub_active_shop_id`) — буруу key bug.

**Production-ийн гол дутагдал:** CI байхгүй; **аппыг нэг ч удаа ажиллуулж үзээгүй** (sandbox-д fonts блок); унасан 12 тест; хуучин e-commerce e2e spec-ууд; RBAC write/delete enforcement тогтворгүй; `.env.example` алга.

## Зарчим
- **Multi-tenant:** хүснэгт бүр `shop_id` + RLS policy.
- **RBAC:** write/delete-ийг `canWrite`/`canDelete`-ээр (AI assistant-д хэрэгжүүлсэн загвар дахин ашиглах).
- **Бодит QA:** staging дээр ажиллуулж турших (код нь typecheck л дамьсан).
- multi-tenant биш (нэг компани, нэг дундын shop) — backfill нэг shop таамаглана.

---

## Phase 0 — Production Gate (🔴 БЛОКЕР, эхэнд)
1. **Staging deploy + гараар QA.** Preview-д гаргаж, ~24 migration дарааллаар ажиллуулж, гол flow-уудыг (онбординг, харилцагч, гэрээ, санхүү, маркетинг, AI) бодитоор турших. *Хамгийн чухал — кодыг ажиллуулж үзээгүй.*
2. **CI/CD** — `.github/workflows/ci.yml`: `typecheck + lint + test + build` PR бүрд (одоо CI огт алга).
3. **Унасан 12 тест засах** (Button/Card/StatsCard design-token drift) + **хуучин e-commerce e2e устгах** (`e2e/{login_checkout,orders-bulk,product-variants}.spec.ts`).
4. **`.env.example`** + **zod env validation** (startup-д шаардлагатай env-үүдийг шалгаж унагах).

## Phase 1 — Multi-tenant security (🔴 CRITICAL)
1. **Surveys shop scoping** — `surveys`/`survey_responses`-д `shop_id` багана + backfill + RLS policy; `api/surveys` GET/POST-ийг `getUserShop`-оор шүүх. (`20260220110000_add_surveys.sql`, `src/app/api/surveys/**`.)
2. **Viewings shop scoping** — `property_viewings`-д `shop_id` багана + backfill (`leads.shop_id`-ээс) + index; `dashboard/viewings/page.tsx` query засах; AI `schedule_viewing` (`ToolExecutor.ts:336`) insert-д `shop_id`.
3. **RLS policy-ууд** — RLS-тэй ч policy-гүй шинэ хүснэгтүүдэд shop-scoped policy нэмэх (эсвэл service-role-only загварыг тодорхой баримтжуулж, CI-д **RLS audit script**: "RLS enabled → policy байх ёстой").
4. **Токен шифрлэлт** — FB/IG access token-ыг AES-GCM-ээр encrypt (env key); helper `lib/security/secret-box.ts`; бүх уншигч (`marketing/facebook/*`, `connect-instagram`, `messenger.ts`, `sync-social`, leadgen) шинэчлэх.
5. **`admin/setup` хатууруулах** — GET→POST, rate-limit, баримт (`api/admin/setup/route.ts`).

## Phase 2 — RBAC enforcement (бүх write/delete зам)
- AI-д хэрэгжүүлсэн **`canWrite`/`canDelete` загварыг** (`fetchRolePermissions` + gate) дундын helper болгож (`lib/auth/require-permission.ts`), дараах POST/PATCH/DELETE-д хэрэглэх: **properties, leads, viewings, service-logs, surveys, customers, finance/procurement**. viewer бичиж/устгаж чадахгүй болно.
- **Inbox reply** (`conversations/reply`), **push subscribe** зэрэгт бичих эрх шалгах.
- Soft-delete стандарт (`deleted_at`) — properties (одоо hard delete), бусад чухал хүснэгтэд.

## Phase 3 — Модуль дуусгах / алдаа засах
- **Inbox:** `aiPauseMode` параметрийг хүлээж авах (pause/off — одоо үргэлж 30мин); **localStorage түлхүүр засах** (`smarthub_`→`vertmonhub_`); **Supabase realtime** subscription (60сек polling-ийг солих); reply rate-limit. Файлууд: `conversations/reply/route.ts`, `inbox/messages/page.tsx`, `useConversations.ts`.
- **Viewings:** create/edit UI (`viewings/new`, `[id]/edit`) + `api/viewings` CRUD; **сануулга cron** (push, үзлэгийн өмнө); feedback/interest_level бүртгэх UI; календарь харагдац.
- **Properties:** **зураг upload урсгал засах** (property эхэлж үүсгээд дараа нь зураг — "unassigned" orphan арилгах, `PropertyForm.tsx:173`); soft-delete; `views_count`/`inquiries_count` логик; status workflow хязгаарлалт.
- **Customer-service:** `service_logs`-д **`customer_id` FK** + Zod validation; **satisfaction survey workflow** (handover дараа auto-trigger + хариу цуглуулах endpoint + `customer_id`); NPS босгыг тохируулдаг болгох.
- **Reports:** **хугацааны шүүлт бодитоор** (`created_at` BETWEEN — одоо үл тоодог); **server-side aggregation** (browser биш); pagination/limit. Файлууд: `reports/{leads,properties}/page.tsx`.
- **Settings:** email/address/website/**notification prefs**/AI instructions хадгалах (одоо read-only, зөвхөн name/owner/phone хадгалдаг). `dashboard/settings/page.tsx`, `api/shop/route.ts`.
- **Admin:** **`audit_logs`** (user/role/import үйлдэл); `admin/landing` хэрэгжүүлэх эсвэл устгах; `admins.permissions` JSONB-г бүтэцлэх.

## Phase 4 — Quality & ops (бэхжүүлэлт)
- **Хуучин e-commerce код устгах** — `products`/`orders`/`cart` routes, `data-assistant/functions.ts` дахь product query, хуучин email темплейт (CLAUDE.md: "буцааж оруулахгүй").
- **Error handling нэгтгэх** — `console.error` → `safeErrorResponse`; request-id tracing; **Sentry alerting** босго.
- **Тест өргөтгөх** — API contract, RLS, webhook/cron, security smoke; coverage босго.
- **Push** — retry, stale subscription цэвэрлэх, quiet hours; service worker `notificationclick`.
- **Токен refresh**; **next/image** optimization; load/security тест.

---

## Дахин ашиглах (одоо байгаа)
- RBAC: `fetchRolePermissions`, `canAccessModule`, `ROLE_PERMISSIONS` (`src/lib/rbac.ts`); AI-д хэрэгжүүлсэн `canWrite`/`canDelete` gate (`lib/ai/data-assistant/index.ts`).
- Shop scoping: `getUserShop` (`lib/auth/supabase-auth.ts`).
- Audit: `logAiAudit`, `logFinanceAudit`, `logAttributionEvent` загвар → ерөнхий `audit_logs`.
- Cron+push: `cron/overdue-check`, `sendPushNotification` (`lib/notifications.ts`); CRON_SECRET хэв маяг.
- Validation: Zod + `validateBody` (`lib/validations/schemas.ts`).
- Excel: `xlsx`; migration хэв маяг `supabase/migrations/`.

## Verification (фаз тус бүрд)
- `npm run typecheck && npm run lint && npm run test && npm run build` ногоон; CI-д автомат.
- **Cross-tenant тест:** өөр shop-ийн `shopId`-аар хандах → 403/хоосон (surveys, viewings, AI).
- **RBAC тест:** viewer/marketing role write/delete оролдоход блоклогдох.
- **Staging smoke:** гол flow гараар + migration дарааллаар ажиллана.
- RLS audit script: RLS-enabled хүснэгт бүр policy-тэй (эсвэл service-role-only гэж тэмдэглэгдсэн).

## Эрсдэл / тэмдэглэл
- Багана/policy нэмэх нь ихэвчлэн **деструктив бус**; `shop_id` backfill нэг shop таамаглана (олон shop бол гар зураглал).
- Орчин тогтворгүй (session reset) — commit/push тухай бүр, origin-оос сэргээх.
- **Дараалал:** Security (P0/P1) → RBAC (P2) → module completion (P3) → ops (P4). P0/P1-ийг production-оос өмнө заавал.
- Хэмжээ том — фаз бүрийг тусдаа PR/commit-аар хийвэл review хялбар.
