# Vertmon Hub — Гүнзгий Аудит ба CRM-төвтэй Сайжруулалтын Замын Зураг

> **Төлөв:** Phase 1 (багийн хэрэглэгч үүсгэлт) ба Phase 2 (цэвэр, dedup харилцагчийн сан)
> хэрэгжсэн. Phase 3–5 нь хүлээгдэж буй замын зураг.
> Дараалал: **эхэлж app хэрэглэгчийн онбординг**, дараа нь харилцагчийн сан, эцэст нь
> **бүрэн чанарын скоринг + автоматжуулалтын engine**.

---

## Агуулга (Context)

Vertmon Hub бол AI-д суурилсан үл хөдлөх хөрөнгийн борлуулалт & CRM платформ
(Next.js 16 / React 19 / Supabase). Эзэмшигч нь бүх логик, үйлдэл, "хүн хийх ёстой"
цэгүүдийг гүнзгий аудит хийж, **бүх тоолуур/метрикийг** бүлэглэн, нэг бүрчлэн
сайжруулах төлөвлөгөө гаргахыг хүссэн. **CRM-ээс эхэлнэ**, учир нь бүтээгдэхүүний үнэ
цэнэ нь (1) хэрэглэгчийг цэвэр бүртгэж **чанартай харилцагчийн сан босгох**, дараа нь
(2) **чанартай харилцагчийг арчилж** борлуулалт хүртэл хүргэхэд оршино.

Гурван зэрэгцээ Explore + шууд шалгалт хийсэн. Хоёр агентын дүгнэлтийг **шалгаж засав**:
- `schedule_viewing` нь **бүрэн хэрэгжсэн** (`src/lib/ai/services/ToolExecutor.ts:236`,
  switch `:787`) — дутуу биш.
- `POST /api/leads` нь **Vertmon-ы өөрийн маркетингийн/холбоо барих форм** (AI prompt-д
  "Vertmon компани"/"Odoo ERP" гэж байгаа), tenant-ийн худалдан авагчийн форм **биш**.
  `shop_id`/`customer_id` байхгүй нь зориуд боловч `leads` хүснэгтийг in-app CRM lead-тэй
  хуваалцдаг нь Phase 5-д засах ёстой дизайны асуудал.

Хамгийн ноцтой батлагдсан алдаа: **онбординг эвдэрхий**. Шинэ хэрэглэгч бүртгүүлэхэд
`auth.users` + `user_profiles` мөр үүснэ ч **`shops` мөр, `user_roles` мөр үүсэхгүй**,
тиймээс хоосон/эвдэрхий dashboard-руу ордог. Энэ нь яг `claude/user-registration-setup-aij4y5`
branch-ийн зорилго бөгөөд **Phase 1**.

---

## A хэсэг — Аудитын олдворууд (бүлэглэсэн)

### A1. App хэрэглэгчийн онбординг / бүртгэл — 🔴 ЭВДЭРХИЙ (хамгийн чухал)
- `src/app/auth/callback/route.ts:33-36` — код солилцоод **болзолгүйгээр `/dashboard`-руу
  чиглүүлдэг**. Register page-ийн илгээдэг `redirect_url=/setup` параметрийг
  (`src/app/auth/register/page.tsx:41,60`) үл тоодог, бас `/setup` устгагдсан.
- **Shop автоматаар үүсэхгүй.** `POST /api/shop` (`src/app/api/shop/route.ts:33-93`) зөв
  байгаа ч эхний нэвтрэлтэд дуудагддаггүй.
- **Role оноогддоггүй.** `user_roles`-ийн default нь `viewer`
  (`supabase/migrations/20260309110000_add_user_roles.sql`), trigger ч seed хийдэггүй —
  тиймээс shop байсан ч шинэ эзэмшигч property/lead удирдаж чадахгүй.
- `AuthContext` (`src/contexts/AuthContext.tsx:74-88,159-169`) shop байхгүй үед
  `activeShop = null` болгож dashboard замаа алддаг.
- `shops` RLS зөв (`002_auth_and_oauth.sql:107-114`); асуудал нь зөвхөн **дата
  үүсгэдэггүйд** оршино, эрхэнд биш.

### A2. Харилцагч цуглуулалт ба датаны чанар — 🟡 ХАГАС
- DM ирэхэд авто-үүсгэлт ажилладаг: `WebhookService.getOrCreateCustomer` (`:168-215`),
  Instagram хувилбар (`:220-272`). `facebook_id`/`instagram_id`, нэр, `source:*` tag авдаг.
- **Утас/имэйл dedup байхгүй.** Цорын ганц unique түлхүүр нь `(shop_id, facebook_id)`
  (`001_initial_schema_safe.sql:53`). Нэг хүн FB + IG + гар + import-аар орвол олон мөр
  үүснэ, нэгтгэх зам алга.
- **Сул утас таних**: `(\d{8})` regex
  (`WebhookService.updateCustomerInfo:317-353`) — мессеж бүрд ажиллана, баталгаажуулалтгүй.
- **Validation цоорхой**: `CreateCustomerSchema` бий (`src/lib/validations/schemas.ts:71`)
  боловч PATCH зам (`api/dashboard/customers/route.ts:110-161`) хэрэгжүүлдэггүй.
- **TS/DB зөрүү**: `Customer` type (`src/types/database.ts:20-33`) дотор `ai_memory`,
  `instagram_id`, `platform`, `ai_paused_until`, `message_count_reset_at` дутуу.
- Скорингийн түүхий эд болох AI write tool-ууд аль хэдийн байна:
  `collect_contact_info`, `remember_preference` (→ `ai_memory` JSONB),
  `tag_customer_behavior`, `append_customer_note`, `log_service_request`,
  `request_human_support`.

### A3. "Чанартай харилцагч" гэдэг ойлголт — ❌ БАЙХГҮЙ
- **Lifecycle шат байхгүй**, **скор байхгүй**, **албан ёсны сегмент байхгүй**. Чанар нь
  зөвхөн чөлөөт `tags`-аар (ж: `stage:hot_lead`) далд илэрхийлэгддэг — эмзэг, тогтворгүй.
- `is_vip` бий ч e-commerce-ийн үхмэл үлдэгдэл.
- Скор тэжээх боломжтой дохиолол аль хэдийн байна, гэхдээ хамт ашиглагдаагүй:
  `message_count`, `last_contact_at`, `ai_memory` (төсөв/өрөө/дүүрэг),
  холбоотой `leads.status`, `property_viewings.interest_level` (1–5),
  `satisfaction_surveys` (NPS/CSAT), `service_logs`.

### A4. Юүлүүрийн холболт — 🟡 ХОЛИМОГ
- DM → customer → `create_lead` (`ToolExecutor.ts:390+`) → `schedule_viewing` (`:236`)
  холбогдсон; lead insert нь `increment_property_inquiries` trigger асаадаг.
- **Lead ↔ contract салангид.** `property_contracts` (`20260312100000_*.sql`) нь
  Excel/HubSpot import-оор дүүрдэг, `leads`-тэй **FK байхгүй**, close болоход
  хувиргах зам ч алга → борлуулалтын "сүүлчийн миль" харагдахгүй.
- `leads.status` зарим insert замд NULL байж болзошгүй (app талд default албадаагүй).

### A5. Хуучин үлдэгдэл (буцааж оруулахгүй, устгахаар төлөвлөх)
- `customers.total_orders`, `total_spent`, `is_vip` (+ `idx_customers_vip`) — үхмэл.
- `api/dashboard/customers/[id]/route.ts` нь detail харагдацад `orders` (e-commerce
  хүснэгт) join хийсээр байгаа — хуучирсан.
- `/api/leads` AI prompt дотор "Odoo ERP" гэсэн хуучин template текст.

### A6. Метрикийн тооллого (~70 тоолуур, 13 бүлэг)

| Бүлэг | Жишээ | Эх сурвалж / тэмдэглэл |
|---|---|---|
| CRM үндсэн | totalProperties, totalLeads, monthlyViewings, pendingContracts, totalCustomers | `api/dashboard/stats/route.ts:44-73` — `monthlyViewings` буруу нэрлэгдсэн (сар биш, сонгосон хугацаа) |
| Борлуулалтын юүлүүр | new/in-progress/won/lost, conversionRate, by-source, monthly trend, bestSource | `dashboard/leads/page.tsx`, `marketing-roi/page.tsx:160-191` |
| Property сан | available/reserved/sold, нийт/дундаж үнэ, views, by-project, top-5 | `dashboard/reports/properties/page.tsx:70-122` |
| Маркетинг/зар | spend, impressions, clicks, CTR, CPC, conversions, campaign count | `marketing-roi/page.tsx:398-416` (FB Ads sync) |
| Үзлэг | total/scheduled/completed/cancelled/no_show/today/upcoming | `dashboard/viewings/page.tsx:79-95` |
| Судалгаа | response/online/offline тоо, AI хураангуй | `dashboard/surveys/[id]/page.tsx:44-46` |
| Гэрээ/цуглуулалт | total/active/closed, total_sales, collected, collection_rate, overdue | `api/dashboard/contracts/stats/service/route.ts:27-110` |
| Үйлчилгээ/дэмжлэг | total/open/resolved, avg_resolution_hours, avg_rating, by type/priority | `api/dashboard/service-logs/route.ts` |
| Төлбөр | overdue_payments, upcoming_payments_7d | service route `:89-96` |
| Сэтгэл ханамж | nps_score, avg_csat, surveys_collected | service route `:68-79` |
| Export | properties/leads/customers мөрийн тоо (≤500) | `api/dashboard/export/excel/route.ts` |
| AI analytics | events, success/fail, avg_response_ms, top_tools | хүснэгт бий (`20260120100000_*`), **UI-д харагддаггүй** |
| Үхмэл | total_orders, total_spent, is_vip | `customers` хүснэгт — устгах |

Нийтлэг асуудлууд: **түүхэн snapshot байхгүй** (бүгд live тооцоологддог, trend зөрүү алга),
**нэр буруу** (`monthlyViewings`), **CRM чанарын метрик дутуу** (lead насжилт, хөрвөх
хугацаа, property зах зээл дээрх хоног, эх сурвалж тус бүрийн lead өртөг), **AI analytics
харагддаггүй**.

---

## B хэсэг — Замын Зураг (Фазууд)

Фаз бүр бие даан ачаалж болно. Дараалал хэрэглэгчийн зорилгыг дагана:
**бүртгэлийг бат болгох → цэвэр чанартай харилцагчийн сан босгох → борлуулалт хүргэх.**

### Phase 1 — Admin-аар удирдах багийн хэрэглэгч үүсгэлт (self-serve онбординг ҮГҮЙ) 🔴 ЭХНИЙ
**Шийдвэр (хэрэглэгч):** Энэ нь ~15-16 хүнтэй **нэг компанийн дотоод систем**. Self-serve
бүртгэл/онбординг хэрэггүй — **1-2 super admin** ажилтнуудад профайл үүсгэж, role + shop
хуваарилна.

**Гол асуудал:** `/api/user/shops/route.ts:15-18` shop-ийг зөвхөн
`shops.user_id = auth.uid()`-ээр олдог. Багийн/гишүүнчлэлийн ойлголт байхгүй тул admin-ийн
үүсгэсэн ажилтан (shop-ийн "эзэн" биш) хоосон dashboard руу ордог. Засвар нь **багийн
гишүүнчлэлийн загвар**.

**Аль хэдийн байгаа (дахин ашиглах):**
- `POST /api/admin/users` (`src/app/api/admin/users/route.ts:92-170`) — super_admin
  Supabase Admin API-аар хэрэглэгч + `user_profiles` + `user_roles` үүсгэдэг. ✅
- `admin/users/page.tsx` UI, `PATCH`/`DELETE` (role шинэчлэх/устгах). ✅
- `GET/PATCH /api/admin/roles` — RBAC дүр удирдлага. ✅
- `POST /api/admin/setup` (secret-ээр эхний super_admin bootstrap). ✅
- `admins` хүснэгт + super_admin gating. ✅

**Хийх (цоорхойнууд):**
1. **Гишүүнчлэлийн загвар (migration).** `shop_members(shop_id, user_id, role)` join хүснэгт
   нэмэх — нэг shop-д олон ажилтан хандах боломжтой болгоно. RLS: гишүүн өөрийн shop-ыг харна.
2. **Shop-ийг гишүүнчлэлээр resolve хийх.** `/api/user/shops/route.ts`-ийг засаж эзэн ЭСВЭЛ
   гишүүн байгаа shop-уудыг буцаах; `api/user/switch-shop/route.ts`, `AuthContext.tsx`,
   dashboard route-уудын `x-shop-id` шалгалтыг гишүүнчлэлийг хүндэтгэдэг болгох.
3. **Admin хэрэглэгч үүсгэлтийг өргөтгөх.** `POST /api/admin/users` болон `admin/users/page.tsx`
   форм дээр: хэрэглэгч үүсгэхдээ **shop-д гишүүнээр оноох** (`shop_members` insert) + role
   сонгох алхмыг нэмэх. Энэ нь "1-2 super admin профайл үүсгэдэг" урсгал.
4. **Self-serve бүртгэл хаах.** `/auth/register` middleware-д аль хэдийн `/auth/login`-руу
   чиглүүлдэг — зөвхөн login үлдээх; register page-ийг устгах/идэвхгүй болгох; setup wizard
   хэрэггүй. `auth/callback/route.ts` дээрх үхмэл `redirect_url=/setup` лавлагааг устгах.
5. **Эхлэл (нэг удаа).** super_admin-ийг `/api/admin/setup` (secret)-ээр тогтоож, тэр нэг
   компанийн shop-ыг үүсгэнэ; бусад ажилтнуудыг admin панелаас гишүүнээр нэмнэ.

Чухал файлууд: шинэ `shop_members` migration, `api/user/shops/route.ts`,
`api/user/switch-shop/route.ts`, `contexts/AuthContext.tsx`, `api/admin/users/route.ts`,
`app/admin/users/page.tsx`, `middleware.ts`.

### Phase 2 — Цэвэр, dedup хийсэн харилцагчийн сан
**Зорилго:** нэг хүн = нэг customer мөр, цэвэр, баяжуулсан.
1. **Identity & dedup.** `WebhookService.getOrCreate*` болон HubSpot import-д insert-ийн
   өмнө нормчилсон утас/имэйл тааруулах алхам нэмэх; **merge** API + dashboard үйлдэл
   (FB/IG/утас/имэйл-ийг нэгтгэх, `leads`/`service_logs`-ийг дахин холбох). Shop тус бүрд
   нормчилсон утсаар partial unique index авч үзэх.
2. **Validation хаа сайгүй.** PATCH замд `CreateCustomerSchema` албадах; нийтлэг утас
   нормчлогч нэмж `(\d{8})` regex-ийг солих; notes/tags урт хязгаарлах.
3. **Type/DB нийцүүлэх.** `Customer` TS type-д дутуу багануудыг нэмэх;
   `api/dashboard/customers/[id]/route.ts`-ийн хуучин `orders` join устгах.
4. **Tag taxonomy.** AI-ийн гаргадаг `category:value` (`source:*`, `interest:*`,
   `budget:*`, `stage:*`) конвенцийг албажуулж, GET route-д commented-out tag filter-ийг
   эргүүлэн идэвхжүүлэх.

### Phase 3 — Харилцагчийн чанарын скоринг + lifecycle + автоматжуулалтын engine ⭐ (бүрэн)
**Зорилго:** чанартай харилцагчийг автоматаар таниж арчлах.
1. **Lifecycle шат** — `customers.lifecycle_stage` enum нэмэх
   (`prospect → engaged → qualified → viewing → negotiating → won → lost/dormant`),
   `leads.status`, `property_viewings`, идэвхгүй хугацааны trigger-ээр зохицуулах.
2. **Чанарын скор (RFM маягийн)** — байгаа дохиоллоос харилцагч тус бүрийн скор:
   recency (`last_contact_at`), engagement (`message_count`, ирсэн үзлэг, `interest_level`),
   intent (`ai_memory` төсөв/өрөө + холбоотой lead/property), satisfaction (NPS/CSAT).
   `quality_score` + `score_breakdown` JSONB болгож хадгалах, scheduled job (эсвэл DB
   function)-оор шинэчилж, CRM жагсаалтад эрэмбэлэх/шүүх боломжтой болгох.
3. **Сегмент** — шат × скороос A/B/C tier + "халуун / арчилгаатай / dormant" гаргах;
   filter болон шинэ dashboard widget болгон харуулах.
4. **Автоматжуулалт** — дагах trigger: өндөр скортой харилцагч чимээгүй болоход
   (`next_followup_at` хэтэрсэн) эсвэл өндөр `interest_level`-тэй үзлэг дуусахад
   sales manager-т `/api/push` + `notifications.ts`-аар даалгавар/мэдэгдэл илгээх;
   шаардвал AI дахин холбогдолт төлөвлөх. `request_human_support`-ийн push замыг ашиглах.

### Phase 4 — Юүлүүрийн бүрэн бүтэн байдал (lead → viewing → contract)
**Зорилго:** борлуулалтын бүтэн замыг хэмжих боломжтой болгох.
1. `property_contracts`-ийг `leads`-тэй холбох (`lead_id` FK) ба **close дээр хувиргах**
   зам: lead `closed_won` болоход contract stub үүсгэх/холбох, `converted_at`/
   `conversion_value` тавих.
2. `leads.status` бүх insert замд `new` default байхыг баталгаажуулах.
3. Dashboard-д lead датагаар бөглөгдсөн "lead → contract хувиргах" үйлдэл нэмэх.

### Phase 5 — Метрик цэгцлэх ба хуучин үлдэгдэл цэвэрлэх
**Зорилго:** найдвартай, бүлэглэсэн, утга учиртай тоонууд.
1. `monthlyViewings`-ийг зөв нэрлэх; метрик бүрийн эх сурвалжийг баримтжуулах.
2. **Дутуу CRM метрик нэмэх**: шат тус бүрийн lead насжилт, хөрвөх хугацаа, property зах
   зээл дээрх хоног, эх сурвалж тус бүрийн lead өртөг (зар spend join), сангийн эрүүл мэнд
   (шинэ vs dormant, дундаж quality score).
3. **Түүхэн snapshot** — өдөр тутмын метрик snapshot хүснэгт → trend зөрүү ("lead ↑12%").
4. `ai_analytics` хүснэгтийн цуглуулсан AI метрикийг харуулах.
5. **Маркетингийн форм lead-ийг CRM lead-ээс салгах** (`/api/leads` insert-ийг tag/тусгаарлаж
   Vertmon-ы маркетинг юүлүүр tenant CRM метрикийг бохирдуулахгүй болгох).
6. **Устгах цэвэрлэгээ** (тусдаа migration): `total_orders`, `total_spent`, `is_vip` +
   `idx_customers_vip` устгах; хуучин `orders` join хасах; "Odoo ERP" текст засах.

---

## Баталгаажуулалт (фаз тус бүрийг хэрэгжүүлэхэд)
- **Phase 1:** super_admin admin панелаас шинэ ажилтан үүсгэх (email/нууц үг + role +
  shop) → тэр хэрэглэгчээр нэвтрэхэд `shop_members`-ээр дамжуулан компанийн shop харагдаж,
  ажиллах dashboard руу орохыг шалгах; self-serve `/auth/register` хаалттай эсэхийг батлах.
  `npm run build && npm run typecheck && npm run test`.
- **Phase 2:** нэг хүнийг FB DM + гар + import-аар → нэг нэгтгэсэн customer; буруу
  утас/имэйлтэй PATCH татгалзагдахыг шалгах.
- **Phase 3:** өөр өөр идэвхтэй customer seed → скор/шат тооцоологдох, жагсаалт чанараар
  эрэмбэлэгдэх, dormant өндөр скортой customer manager-т push асаах.
- **Phase 4:** lead-ийг `closed_won` болгох → conversion утгатай contract stub гарч ирэх.
- **Phase 5:** dashboard KPI гар тооцоотой таарах; хуучин баганууд устсан; build ногоон.
- Туршид: бүх хэрэглэгчийн текст Монгол; dev server порт 3001.

## Эрсдэл / тэмдэглэл
- Multi-tenant дахин зохион байгуулалт **хамрах хүрээнд биш** (CLAUDE.md note 8) — Phase 1
  нь **нэг компанийн нэг дундын shop**-д ~15-16 ажилтан `shop_members`-ээр хандана гэж үзнэ
  (нэг хэрэглэгч = нэг shop биш). Олон shop хэрэгтэй бол `shop_members` загвар дэмжинэ.
- Phase 3-ын скорингийн жинг тохируулдаг болгох (hard-code биш) — энгийнээр эхлээд сайжруулах.
- Устгах migration (Phase 5.6)-ийг тэр багануудыг юу ч уншихгүй болохыг батлаад л ажиллуулах;
  тусдаа review хийгдэх migration болгож гаргах.
