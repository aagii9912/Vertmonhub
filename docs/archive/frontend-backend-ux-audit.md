# Vertmon Hub — Frontend↔Backend уялдаа ба UX/UI гүн audit

> **Огноо:** 2026-06-09  ·  **Хамрах хүрээ:** `main` branch (origin/main merge-ийн дараах төлөв)  
> **Арга зүй:** 21-агентын multi-agent audit (3 recon → 9 хэмжүүр зэрэгцээ → хэмжүүр бүрийн олдворыг adversarial verifier иш татсан кодыг дахин уншиж шалгасан).  
> **Кодын хэмжээ:** 99 API route · 28 dashboard + 9 marketing хуудас · ~53.6k LOC · 57 fetch call-site · 20 UI primitive.

Энэ баримт нь зөвхөн **баталгаажсан** (verifier-ээр иш татсан кодыг нь дахин уншиж нотолсон) олдворуудыг агуулна. 1 finding нь false-positive болж хасагдсан, 1 нь `uncertain` (доор тэмдэглэсэн).

## 1. Тоон дүгнэлт

| Severity | Тоо |
|---|---|
| 🔴 Критик | 5 |
| 🟠 Өндөр | 23 |
| 🟡 Дунд | 37 |
| 🔵 Бага | 20 |
| **Нийт (баталгаажсан)** | **85** |

Хэмжүүр тус бүрээр:

| Хэмжүүр | Бүлэг | 🔴 | 🟠 | 🟡 | 🔵 |
|---|---|---|---|---|---|
| API/контрактын тууштай байдал | INTEGRATION | 1 | 2 | 1 | 2 |
| Алдаа ба захын төлөв (error/edge-state) боловсруулалт | INTEGRATION | 0 | 4 | 5 | 1 |
| Authentication / RBAC / Multi-tenant холбоо | INTEGRATION | 1 | 3 | 4 | 1 |
| Type safety ба өгөгдлийн урсгал | INTEGRATION | 1 | 4 | 3 | 3 |
| Мэдээллийн архитектур ба навигаци | UX/UI | 0 | 3 | 5 | 2 |
| Визуал тууштай байдал ба дизайн систем | UX/UI | 0 | 1 | 5 | 3 |
| Хүртээмж — Accessibility (WCAG 2.1 AA) | UX/UI | 1 | 4 | 3 | 2 |
| Харилцан үйлдэл ба эргэх холбоо (interaction & feedback) | UX/UI | 1 | 1 | 5 | 3 |
| Контент ба нутагшуулалт (Монгол хэл) | UX/UI | 0 | 1 | 6 | 3 |

## 2. Удирдлагын хураангуй (Executive summary)

Платформ функцоор баялаг (CRM + ERP + Marketing + AI) боловч **frontend болон backend нь хоорондоо тэгширээгүй (drifted) хэд хэдэн газартай** — ялангуяа сүүлийн томоохон merge-ийн дараа. Гол санаа:

- **Хамгийн ноцтой нь schema-drift:** код нь өгөгдлийн санд **байхгүй хүснэгт/баганаас** уншиж/бичиж байна (`viewings`, `contracts`, `orders`, `properties.title`, `status='pending'`). Үр дүнд нь нүүр хуудасны KPI-ууд **чимээгүйгээр 0 харагдаж**, олон нийтийн вэб лийдийн бүртгэл **бүрэн унаж** байна. Эдгээр нь нэг үндэс шалтгаантай тул нэг дор засаж болно (Theme #1).
- **Multi-tenant аюулгүй байдлын цоорхой:** RLS-ийн `get_user_shop_id()` нь `shop_members`-ийг мэддэггүй тул browser-direct query-ууд эзэн биш ажилтанд хоосон/буруу ажиллана; зарим санхүүгийн API module RBAC шалгадаггүй (Theme #2).
- **Алдаа боловсруулалт сул:** олон fetch `res.ok` шалгахгүй, react-query хуудсуудад алдааны төлөв байхгүй, апп-д `error.tsx` boundary огт алга — алдаа чимээгүй залгигдаж хэрэглэгчид «хоосон» эсвэл «мөнхийн spinner» харагдана (Theme #3).
- **Хоёр зэрэгцээ data-access загвар** (browser-direct Supabase vs `x-shop-id` API) тууштай бус ажиллаж, алдаа болон аюулгүй байдлын эрсдэлийг үржүүлж байна (Theme #4).
- **UX/UI тал дээр:** дизайн систем (token, `Modal`/`Button` primitive) олон хуудсаар зөрчигдсөн, хоёр хуудас бүхэлдээ хатуу-кодлосон бараан загвартай; хүртээмж (zoom хориглосон, label холбоогүй, contrast унасан, focus-trap байхгүй) AA-д хүрэхгүй; зарим дэлгэц **demo/stub хэвээр** (шинэ лийдийн форм хадгалдаггүй, inbox карт дарахад юу ч болдоггүй); нэр томьёо/валют/огнооны формат хуудас болгонд зөрүүтэй (Theme #5–#7).

Доорх **§3 cross-cutting themes** болон **§4 эрэмбэлсэн төлөвлөгөө** нь юунаас эхлэхийг харуулна. **§5** дэх дэлгэрэнгүй жагсаалт бүх олдворыг файл:мөр түвшинд баримтжуулсан.

## 3. Хөндлөн огтлолын сэдвүүд (cross-cutting themes)

Тусдаа олдворууд ихэвчлэн цөөн хэдэн үндэс шалтгаанаас урган гарсан. Эдгээрийг засвал олон finding нэг дор шийдэгдэнэ.

### Theme #1 — Schema drift: байхгүй хүснэгт/баганад хандах (хамгийн өндөр ROI)
Frontend ба зарим backend код нь **бодит migration-д байхгүй** нэрсэд ханддаг:
- `viewings` → бодит нь **`property_viewings`**
- `contracts` → бодит нь **`property_contracts`**
- `orders` → энэ хүснэгт **устгагдсан** (e-commerce legacy)
- `properties.title` → бодит багана нь **`name`**
- `status='pending'` (гэрээнд) → бодит баганы нэр **`contract_status`**, утга нь `active/closed/cancelled`
- `/api/leads` INSERT → `name/phone/email/company/message/ai_response` гэсэн **байхгүй баганад** бичдэг (бодит нь `customer_name/customer_phone/customer_email`)

**Холбогдох finding:** `leads-insert-wrong-columns` (🔴), `dashboard-wrong-table-names`, `pending-contracts-wrong-status-field`, `usedashboard-wrong-table-names` (🔴), `stats-route-wrong-table-names`, `dashboard-property-title-mismatch`, `realtime-notifications-stale-and-crash`, `dashboard-wrong-table-silent-zero`.
**Засвар:** `src/hooks/useDashboard.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/leads/route.ts`, `src/hooks/useRealtimeNotifications.ts` дотрох нэрсийг canonical схемд тааруулах. Supabase `count` query throw хийдэггүй тул цаашид ийм drift-ийг integration тест + типжүүлсэн хүснэгтийн нэрээр барих.

### Theme #2 — Multi-tenant / RBAC цоорхой
- RLS `get_user_shop_id()` нь зөвхөн эзнийг (owner) мэддэг, **`shop_members`-ийг үл тоомсорлоно** → browser-direct query ажилтнуудад хоосон/буруу.
- `finance/procurement/contracts` зарим API module **RBAC шалгадаггүй** → `sales_manager` санхүүгийн нууц дата уншина.
- Гэрээ/төлбөрийн **mutating route-ууд `requireWrite/requireDelete` дуудахгүй**.
- **UI нь `canWrite/canDelete`-ийг шалгадаггүй** → viewer-т устгах/засах товч харагдаж, дараа нь backend 403 өгнө.

**Холбогдох finding:** `rls-get-user-shop-id-ignores-members` (🔴), `finance-api-no-module-rbac`, `contracts-payments-mutations-ungated`, `ui-no-rbac-action-gating`, `leads-status-not-shop-scoped`.

### Theme #3 — Алдаа ба захын төлөв чимээгүй залгигдана
`res.ok` шалгахгүй fetch-ууд, react-query хуудаст `isError` төлөв байхгүй, апп-д `error.tsx` boundary огт алга, `setLoading(false)`-г `try`-аас гадуур байрлуулсан → «мөнхийн spinner». Backend зарим route 401-ийн оронд 200+хоосон, эсвэл түүхий DB/Facebook алдааг client рүү цацна.

**Холбогдох finding:** `fetch-no-res-ok-check`, `no-error-state-react-query-pages`, `marketing-roi-no-error-infinite-spinner`, `no-error-boundary`, `raw-error-leak`, `backend-200-on-unauth`.

### Theme #4 — Хоёр зэрэгцээ data-access загвар
Зарим дата browser-аас **шууд Supabase**-аар (хэдэн hook), зарим нь **`x-shop-id` header-тэй `/api/*`**-аар татагддаг. Энэ хосолмол байдал нь RLS-ийн цоорхой (Theme #2), shop-switch үеийн stale дата, давхар логик (KPI-г hook болон route хоёул өөр өөр тооцоолох) үүсгэж байна.

**Холбогдох finding:** `usedashboard-wrong-table-names`, `service-kpi-duplicate-logic`, `switchshop-stale-data`, `browser-direct-write-no-validation`.

### Theme #5 — Дизайн систем мөрдөгдөхгүй
Token (`globals.css`-ийн Editorial system) байгаа атал хуудаснууд hardcoded hex, arbitrary Tailwind утга, raw `<button>`, гар хийцийн modal ашиглана. `customer-service` ба `inbox/messages` хоёр **бүхэлдээ хатуу-кодлосон бараан** загвартай (гэрэлт сэдэвт уншигдахгүй). `Modal`/`Dialog` primitive-ийг **нэг ч dashboard хуудас ашигладаггүй**.

**Холбогдох finding:** `hardcoded-dark-pages-customer-service-inbox`, `modal-primitive-unused`, `raw-button-overuse`, `non-brand-violet-spread`, `charts-hardcoded-colors`.

### Theme #6 — Хүртээмж (a11y) AA-д хүрэхгүй
`userScalable:false` (zoom хориглосон), форм label-ууд input-тай холбоогүй, брэнд терракотта/бүдэг текст contrast унасан, гар хийсэн modal-д focus-trap/`role=dialog`/Esc байхгүй, icon-only товч accessible name-гүй.

**Холбогдох finding:** `viewport-zoom-disabled` (🔴), `form-labels-not-associated`, `brand-muted-contrast-fail`, `custom-modals-no-a11y`, `icon-buttons-no-name`.

### Theme #7 — Дуусаагүй/stub UI ба нутагшуулалтын зөрүү
Зарим гол урсгал **бодитоор ажилладаггүй**: шинэ лийд нэмэх форм хадгалдаггүй (demo mode), inbox карт дарахад юу ч болдоггүй, dashboard дээр хуурамч «+18%» тоо хатуу бичсэн. Нэр томьёо (`лийд`/`сэжим`/`сонирхогч`, `байр`/`үл хөдлөх`/`орон сууц`), валют (`B₮/M₮` vs `сая₮/тэрбум₮`), огнооны формат хуудас бүрт зөрүүтэй; англи үг үлдсэн.

**Холбогдох finding:** `new-lead-form-demo-mode` (🔴), `inbox-card-click-noop`, `fake-stat-percentage`, `terminology-lead`, `currency-format-inconsistent`, `header-title-english-and-stale`.

## 4. Эрэмбэлсэн төлөвлөгөө

### P0 — Яаралтай (өгөгдөл алдагдах / эвдрэх / аюулгүй байдал)
1. **Вэб лийдийн INSERT-ийг засах** — `leads-insert-wrong-columns`. Маркетингийн landing-аас ирэх лийд бүр 500 өгч алдагдаж байна.
2. **Schema-drift нэрсийг засах** (Theme #1) — `useDashboard.ts`, `stats/route.ts`, `useRealtimeNotifications.ts`: `property_viewings`/`property_contracts`/`name`/`contract_status`. KPI-ууд худал 0 харуулж байна.
3. **RLS `get_user_shop_id()` → `shop_members`-ийг тооцох** — `rls-get-user-shop-id-ignores-members`. Ажилтнууд дата харахгүй/буруу tenant scope.
4. **Санхүү/гэрээний API-д RBAC + `requireWrite` нэмэх** — `finance-api-no-module-rbac`, `contracts-payments-mutations-ungated`. Нууц дата/санхүүгийн бичилт хамгаалалтгүй.

### P1 — Өндөр (бодит UX/бизнес эвдрэл)
5. **`error.tsx` boundary + fetch `res.ok` шалгалт + react-query `isError` төлөв** (Theme #3).
6. **Дуусаагүй урсгалуудыг бодитой болгох** — шинэ лийдийн форм хадгалах (`new-lead-form-demo-mode`), inbox карт дарах (`inbox-card-click-noop`), хуурамч stat арилгах.
7. **a11y критик/өндөр** — `userScalable` арилгах, форм label холбох, contrast засах, modal focus-trap (Theme #6).
8. **Навигацийн өнчин/үхмэл холбоос** — `/help` legacy линкүүд, өнчин хуудаснууд, MobileNav RBAC (Theme — ux-ia-nav).
9. **UI RBAC gating** — `canWrite/canDelete`-ээр товч нуух (`ui-no-rbac-action-gating`).

### P2 — Дунд/Бага (тууштай байдал, өнгөлгөө)
10. Дизайн систем рүү буцаах: `customer-service`/`inbox` хатуу-кодлосон загвар, `Modal`/`Button` primitive нэвтрүүлэх (Theme #5).
11. Нутагшуулалт: нэр томьёо/валют/огнооны формат нэгтгэх, англи үлдэгдэл арилгах (Theme #7).
12. Type safety: client/server хуваалцсан DTO, `any` багасгах, react-query `queryKey`/invalidation, `AbortController`.

---

## 5. Дэлгэрэнгүй олдворууд


---

## 🔌 Integration — INTEGRATION

### API/контрактын тууштай байдал

_Хэмжүүр: `int-contracts`_

#### int-contracts.1 — 🔴 КРИТИК Public /api/leads нь leads хүснэгтэд байхгүй багануудруу insert хийнэ (вэб лийд бүрэн эвдэрсэн)

`leads-insert-wrong-columns`

- **Файл:** `src/app/api/leads/route.ts:128-149`, `src/lib/validations/schemas.ts:10-30`, `supabase/migrations/20260128210000_add_real_estate_tables.sql:91-104`, `supabase/migrations/20260503110000_add_lead_attribution.sql:9-18`, `supabase/migrations/20260608150000_link_contracts_to_leads.sql:33`
- **Баримт (evidence):** route.ts:128-149 does supabase.from('leads').insert([{ name, phone, email, company, message, ai_response, fbclid, utm_*, facebook_* , source }]). The leads table (migration 20260128210000:91-142) defines customer_name/customer_phone/customer_email (lines 102-104) and notes/internal_notes, but NO name/phone/email/company/message/ai_response columns. The only ALTER TABLE leads adds are fbclid + utm_* + facebook_* (migration 20260503110000:9-18) — confirmed via grep across all migrations, no name/phone/email/message/company/ai_response ever added. The lead-won trigger (20260608150000:33) reads NEW.customer_name/NEW.customer_phone, confirming canonical columns. Postgres rejects insert of nonexistent columns with PGRST204 / 'column does not exist'; route then returns 500 at route.ts:151-157.
- **Нөлөө:** Маркетингийн landing page-ээс ирэх вэб лийд бүрийн INSERT нь 'column does not exist' алдаагаар унаж 500 буцаана. Вэбсайтын лийд бүртгэх гол урсгал бүрэн ажиллахгүй — орлогын суваг тасарч, лийд бүгд алдагдана.
- **Зөвлөмж:** route.ts:130-147 дэх insert-ийг DB баганад тааруулж name→customer_name, phone→customer_phone, email→customer_email болгож зас. company/message/ai_response-ийг notes эсвэл шинэ багана руу буулга, эсвэл хүснэгтэд багана нэм. CreateLeadSchema-г уялдуулж integration тест нэм.
- **Verifier тэмдэглэл:** Баталгаажсан. route.ts:130-146 дээр name/phone/email/company/message/ai_response-ийг шууд insert хийж байгаа нь нүдээр харагдсан. Бүх migration дотор grep хийхэд leads хүснэгтэд эдгээр багана хэзээ ч нэмэгдээгүй (зөвхөн customer_name/customer_phone/customer_email + fbclid/utm/facebook байна). Postgres-д байхгүй багана руу insert хийвэл алдаа шиднэ — critical severity зөв. File:line-г route.ts-д 128-149 болгож бага зэрэг тодотгов (insert блок жинхэнэ хязгаар).

#### int-contracts.2 — 🟠 ӨНДӨР useDashboard + /api/dashboard/stats нь байхгүй viewings/contracts хүснэгтээс query хийж KPI-г чимээгүй 0 болгоно

`dashboard-wrong-table-names`

- **Файл:** `src/hooks/useDashboard.ts:50-67`, `src/app/api/dashboard/stats/route.ts:56-67`, `src/app/dashboard/page.tsx:115-121`, `supabase/migrations/20260128210000_add_real_estate_tables.sql:155`, `supabase/migrations/20260312100000_add_property_contracts_and_ai_docs.sql:15`
- **Баримт (evidence):** useDashboard queries supabase.from('viewings') (lines 50,63) and supabase.from('contracts') (line 54); stats/route.ts does from('viewings') (line 57) and from('contracts') (line 64). The real tables are property_viewings (migration 20260128210000:155) and property_contracts (migration 20260312100000:15); every other file (contracts/route.ts:31, service/route.ts:22) uses these canonical names. No viewings/contracts table or view is created in any migration. dashboard/page.tsx:115 renders stats.monthlyViewings and :118 stats.pendingContracts; counts fall back to `|| 0` (useDashboard.ts:74-75, stats/route.ts:146-147) so a query error silently yields 0.
- **Нөлөө:** Нүүр хуудасны 'Үзлэг (сар)' болон 'Хүлээгдэж буй гэрээ' KPI карт үргэлж 0 харагдана. Supabase count query алдаа шиддэггүй (count→null→`|| 0`) тул чимээгүйгээр буруу мэдээлэл үзүүлж менежерүүдийг төөрөгдүүлнэ.
- **Зөвлөмж:** useDashboard.ts (50,54,63) ба stats/route.ts (57,64) дахь from('viewings')→from('property_viewings'), from('contracts')→from('property_contracts') болгож зас.
- **Verifier тэмдэглэл:** Баталгаажсан. useDashboard.ts:50/54/63 дээр from('viewings') ба from('contracts'), stats/route.ts:57/64 дээр мөн адил байгааг нүдээр харав. property_viewings (155-р мөр) ба property_contracts (15-р мөр) л жинхэнэ хүснэгт. Бусад route-ууд canonical нэр ашигладаг. Count алдаа throw хийдэггүй тул чимээгүй 0 — high severity зөв. page.tsx-ийн жинхэнэ render мөрийг 115-121 болгож зөв тохируулав.

#### int-contracts.3 — 🟠 ӨНДӨР pendingContracts нь property_contracts дээр байхгүй status='pending'-ээр шүүдэг

`pending-contracts-wrong-status-field`

- **Файл:** `src/hooks/useDashboard.ts:53-56`, `src/app/api/dashboard/stats/route.ts:62-67`, `src/app/api/dashboard/contracts/route.ts:35`, `src/app/api/dashboard/contracts/route.ts:184-189`, `supabase/migrations/20260415120000_extend_property_contracts.sql:38`
- **Баримт (evidence):** useDashboard.ts:54-56 does from('contracts').eq('status','pending'); stats/route.ts:63-67 does from('contracts').eq('status','pending'). property_contracts has no `status` column — it has contract_status VARCHAR(20) DEFAULT 'active' added in migration 20260415120000:38, with allowed values active/closed/cancelled (parseContractStatus in contracts/route.ts:184-189; filter eq('contract_status', status) at contracts/route.ts:35). There is no 'pending' value anywhere for contracts. Even after fixing the table name, both the column (status vs contract_status) and value ('pending' vs active/closed/cancelled) are wrong.
- **Нөлөө:** Хүснэгтийн нэрийг зассан ч 'Хүлээгдэж буй гэрээ' тоо буруу хэвээр — status багана/'pending' утга property_contracts дээр байхгүй тул KPI байнга 0 эсвэл алдаатай гарна.
- **Зөвлөмж:** Зорилгод тааруулж .eq('contract_status','active') (эсвэл balance>0 зэрэг бодит нөхцөл) болгож, баганын нэр/утгыг property_contracts-тай уялдуул.
- **Verifier тэмдэглэл:** Баталгаажсан. contract_status баганын тодорхойлолтыг migration 20260415120000:38 дээр олж (VARCHAR(20) DEFAULT 'active'), утгууд нь active/closed/cancelled гэдгийг parseContractStatus (contracts/route.ts:184-189) болон service/route.ts:27-28-аар нотлов. status='pending' гэсэн багана/утга огт байхгүй. Auditor-ийн заасан migration line (20260312:15) нь хүснэгт үүсгэдэг боловч contract_status тэнд биш — би жинхэнэ ALTER (20260415120000:38)-г нэмж тодотгов. High severity зөв.

#### int-contracts.4 — 🟡 ДУНД Гэрээний төлбөр бүртгэх POST нь Zod validation байхгүй, тодорхойлогдоогүй body.amount дээр тооцоо хийнэ

`contract-payments-post-no-validation`

- **Файл:** `src/app/api/dashboard/contracts/[id]/payments/route.ts:56-109`, `src/lib/validations/schemas.ts:142-146`
- **Баримт (evidence):** POST handler does const body = await request.json() (line 57) with no Zod schema and no requireWrite/permission gate (only getUserShop auth at 51-54). status is computed as body.paid_amount >= body.amount ? 'paid' : body.paid_amount > 0 ? 'partial' : 'pending' (line 84) using raw body fields; payment_schedules.amount uses body.amount || 0 (line 80) and finance_transactions.amount uses Number(body.paid_amount) (line 100). If amount/paid_amount are undefined or string, comparisons and Number() yield NaN or wrong status, persisting bad data to payment_schedules and finance_transactions. A PayBillSchema (schemas.ts:142-146) with positive-number amount already exists but is not used here.
- **Нөлөө:** Буруу/дутуу body ирвэл төлбөрийн статус буруу тооцоологдож, кассын дэвтэрт (finance_transactions) NaN эсвэл буруу дүн бичигдэж санхүүгийн өгөгдөл эвдэрч магадгүй. Контракт хамгаалалтгүй, гэхдээ одоо frontend энэ POST-ыг бичих урсгалд дуудахгүй тул бодит эрсдэл хязгаарлагдмал.
- **Зөвлөмж:** Зориулсан Zod schema (PayBillSchema маягийн) нэмж amount/paid_amount-ийг тоо гэж шалга, requireWrite() permission gate нэм, validateBody helper ашигла.
- **Verifier тэмдэглэл:** Баталгаажсан. payments/route.ts:57 дээр Zod байхгүй request.json(), line 84 дээр body.paid_amount>=body.amount тооцоо, line 100 дээр Number(body.paid_amount) санхүүд бичигдэж байгааг нүдээр харав. requireWrite gate байхгүй. PayBillSchema аль хэдийн байгаа боловч ашиглагдаагүй (schemas.ts:142-146 — auditor-ийн заасан 290 буруу, засав). Severity medium зөв — frontend одоо бичих POST дуудахгүй гэдгийг auditor өөрөө хүлээн зөвшөөрсөн тул critical биш.

#### int-contracts.5 — 🔵 БАГА Customers page-ийн health төрөл backend-ийн буцаадаг won талбарыг тусгаагүй (бага зэрэг drift)

`customer-health-type-missing-won`

- **Файл:** `src/app/dashboard/customers/page.tsx:133-141`, `src/app/dashboard/customers/page.tsx:212-224`, `src/app/api/dashboard/customer-health/route.ts:72-83`
- **Баримт (evidence):** customer-health route returns health: { total, newThisMonth, dormant, won, avgQualityScore, tiers, needFollowup, avgDaysToConvert } (route.ts:72-83, won at line 77). The page's local health state type (page.tsx:133-141) lists total/newThisMonth/dormant/avgQualityScore/tiers{A,B,C}/needFollowup/avgDaysToConvert but omits `won`, and fetchHealth (page.tsx:212-224) just stores data.health. All other fields match; won is simply never typed or read — an unused-field drift, not a runtime bug.
- **Нөлөө:** Ажиллагаанд алдаа гаргахгүй ч backend-аас тооцоолж буцааж буй won метрик frontend дээр огт ашиглагдахгүй — ирээдүйд contract drift үүсгэх эрсдэлтэй жижиг зөрүү.
- **Зөвлөмж:** Шаардлагатай бол health type-д won нэмж UI-д ашигла, эсвэл backend-аас хас. Хариултын бүтцийг нэг эх сурвалжаас type-share хийвэл зөрүү багасна.
- **Verifier тэмдэглэл:** Баталгаажсан. route.ts:77 дээр won буцааж, page.tsx:133-141 төрөлд won байхгүйг нүдээр харав. Бусад талбар бүгд таарч байна. Runtime алдаа биш, зөвхөн ашиглагдаагүй талбар — low severity бүрэн зөв.

#### int-contracts.6 — 🔵 БАГА Service KPI route нь property_contracts-ийн contract_status='active'-ийг зөв уншдаг — useDashboard-той зөрчилтэй давхар логик

`surveys-roi-payments-status-mismatch-note`

- **Файл:** `src/app/api/dashboard/contracts/stats/service/route.ts:21-32`, `src/app/dashboard/customer-service/page.tsx:110-123`, `src/hooks/useDashboard.ts:54`
- **Баримт (evidence):** service/route.ts:21-32 queries property_contracts and filters x.contract_status === 'active' (line 27) / 'closed' (line 28); the response (lines 98-127) exposes total_contracts/active_contracts/closed_contracts/total_collected etc. customer-service/page.tsx:110-123 fetches that route and stores kpiData.stats. This is the canonical correct pattern, whereas useDashboard.ts:54 uses the broken from('contracts').eq('status','pending'). Two parallel contract-stat implementations exist — one correct (service route), one broken (useDashboard).
- **Нөлөө:** Нэг л 'идэвхтэй гэрээ' гэсэн ойлголтыг хоёр өөр газар хоёр өөр (нэг нь зөв, нэг нь эвдэрсэн) аргаар тооцдог тул нүүр хуудас ба customer-service хуудас зөрүүтэй тоо харуулна — хэрэглэгчийн итгэлийг алдагдуулна.
- **Зөвлөмж:** Гэрээний статистикийг нэг shared util/route-оор төвлөрүүлж useDashboard-ийг засаад customer-service KPI route-ийн зөв загвартай нэгтгэ.
- **Verifier тэмдэглэл:** Баталгаажсан. service/route.ts:22-27 дээр property_contracts + contract_status==='active' зөв ашиглаж байгааг, customer-service/page.tsx:110-123 уг route-аас kpiData.stats уншиж байгааг нүдээр харав. useDashboard.ts:54-ийн эвдэрсэн загвартай зөрчилдөж байгаа нь үнэн. Энэ нь голчлон #2/#3-ийн дагалдах consistency тэмдэглэл тул low severity зохистой.


### Алдаа ба захын төлөв (error/edge-state) боловсруулалт

_Хэмжүүр: `int-errors`_

#### int-errors.1 — 🟠 ӨНДӨР Дашбоардын Үзлэг ба Гэрээ KPI буруу хүснэгтээс уншиж, алдааг залгиад үргэлж 0 харуулна

`dashboard-wrong-table-silent-zero`

- **Файл:** `src/hooks/useDashboard.ts:50`, `src/hooks/useDashboard.ts:54`, `src/hooks/useDashboard.ts:63`, `src/app/api/dashboard/stats/route.ts:57`, `src/app/api/dashboard/stats/route.ts:64`, `supabase/migrations/20260128210000_add_real_estate_tables.sql:155`, `src/app/dashboard/page.tsx:115`
- **Баримт (evidence):** useDashboard.ts queries supabase.from('viewings') (lines 50,63) and supabase.from('contracts') (line 54); stats/route.ts queries from('viewings') (line 57) and from('contracts') (line 64). Verified via grep these are the ONLY two files in src/ using those names — every other consumer uses 'property_viewings'/'property_contracts'. Real tables: property_viewings (migration 20260128210000:155) and property_contracts (migration 20260312100000:15; used by contracts/route.ts:31 etc). No 'viewings'/'contracts' table or VIEW exists in migrations. useDashboard.ts reads only viewingsRes.count||0 / contractsRes.count||0 (72-75) — .error never inspected. dashboard/page.tsx:115 renders stats.monthlyViewings, :118 stats.pendingContracts.
- **Нөлөө:** Дашбоард дээрх 'Үзлэг (сар)' (page.tsx:115) ба 'Хүлээгдэж буй гэрээ' (page.tsx:118) гэсэн 2 үндсэн KPI үргэлж 0 харагдана — хүснэгт байхгүй тул query алдаа буцаах боловч .error шалгахгүй, count нь undefined→0 болно. Алдаа console-д ч бичигдэхгүй залгигддаг тул менежер 'үзлэг/гэрээ алга' гэж андуурна. /api/dashboard/stats route ч мөн адил буруу.
- **Зөвлөмж:** useDashboard.ts (50,54,63) болон stats/route.ts (57,64) дахь from('viewings')-г from('property_viewings'), from('contracts')-г from('property_contracts') болгож засна. Нэмж supabase хариунаас .error-г шалгаж, алдаа гарвал throw хийж react-query-ийн error төлөвт буулгана.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан. grep-ээр 'viewings'/'contracts' хүснэгтийн нэрийг зөвхөн энэ 2 файл ашиглаж байна, бусад бүх код 'property_viewings'/'property_contracts' хэрэглэдэг нь нотлогдов. Migration-д уг 2 буруу нэрээр хүснэгт ч, VIEW ч үүсээгүй. .error шалгаагүй залгидаг логик ч үнэн. Severity=high зөв.

#### int-errors.2 — 🟠 ӨНДӨР react-query дээр суурилсан Dashboard ба Inbox хуудаст алдааны төлөв огт байхгүй — бүтэлгүй ачаалал чимээгүй хоосон харагдана

`no-error-state-react-query-pages`

- **Файл:** `src/app/dashboard/page.tsx:47`, `src/app/dashboard/page.tsx:53`, `src/app/dashboard/inbox/page.tsx:15`, `src/app/dashboard/inbox/page.tsx:54`, `src/hooks/useConversations.ts:24`, `src/components/providers/QueryProvider.tsx:7`
- **Баримт (evidence):** dashboard/page.tsx:47 destructures { data, isLoading, refetch, isRefetching } — error never read; only isLoading→DashboardSkeleton (line 53). inbox/page.tsx:15 destructures { data: conversations = [], isLoading, refetch } — error ignored; on failure filtered.length===0 → EmptyState 'Мессеж байхгүй' (lines 54-57). useConversations.ts:24-26 throws on !res.ok but no consumer catches it. QueryProvider.tsx:7 sets only staleTime, no QueryCache onError, no retry override.
- **Нөлөө:** Сервер 500 буцаах эсвэл сүлжээ тасрахад inbox 'Мессеж байхгүй' гэж, dashboard бол 0 утгатай хоосон карт харуулна. Хэрэглэгч бүтэлгүйтсэнийг огт мэдэхгүй, дахин ачаалах товч ч санал болгохгүй.
- **Зөвлөмж:** react-query-н error/isError-г уншиж, алдааны үед тусдаа алдааны блок + 'Дахин оролдох' (refetch) товч харуулна. QueryProvider дээр QueryCache({ onError }) тохируулж нэгдсэн toast гаргавал бүх hook-д хамаарна.
- **Verifier тэмдэглэл:** Бүх ишлэл (page.tsx:47/53, inbox:15/54, useConversations:24, QueryProvider:7) бодит кодтой тохирч байна. Алдааны төлөв уншигдахгүй, fallback нь хоосон UI болох нь баталгаатай. Severity=high — KPI/inbox бол гол хуудас тул зөв.

#### int-errors.3 — 🟠 ӨНДӨР Олон data хуудас fetch-ийн res.ok шалгахгүй — 401/500 хариуг 'өгөгдөл байхгүй' мэт чимээгүй харуулна

`fetch-no-res-ok-check`

- **Файл:** `src/app/dashboard/finance/page.tsx:93`, `src/app/dashboard/finance/page.tsx:98`, `src/app/dashboard/procurement/page.tsx:67`, `src/app/dashboard/procurement/page.tsx:73`, `src/app/dashboard/customers/page.tsx:240`, `src/app/dashboard/customers/page.tsx:219`, `src/app/dashboard/contracts/page.tsx:102`, `src/app/dashboard/contracts/page.tsx:414`
- **Баримт (evidence):** finance/page.tsx loadAll() does 4× fetch(...).then(r=>r.json()) (lines 93-96) with no res.ok check, then setSummary(s.summary||null) etc (98-101); catch → console.error only (103). procurement/page.tsx loadAll() identical (67-71 fetch, 73-77 set, 78 catch→console.error). customers/page.tsx fetchCustomers (226-247, reads data.customers at 241) and fetchHealth (212-224, reads data.health at 220) ignore status; catch→console.error only. contracts/page.tsx fetchContracts reads data.contracts/data.stats (102-104) ignoring res.ok; detail tabs at 414,420,428 use .then(r=>r.json()) with no ok check.
- **Нөлөө:** RBAC татгалзал (403), хугацаа дууссан сесс (401), серверийн 500 алдаа бүгд 'хоосон жагсаалт' болж хувирна. Хэрэглэгч санхүү/худалдан авалт/харилцагч/гэрээний мэдээлэл бодитоор татагдсан эсэхийг ялгаж чадахгүй; алдааг зөвхөн console-оос л харна.
- **Зөвлөмж:** Бүх load функцэд res.ok-г шалгаж, бүтэлгүй бол body-н {error}-г toast/инлайн алдаагаар харуулж errorState буулгана. Давтагдсан x-shop-id + res.ok логикийг нэг apiFetch() helper-т нэгтгэвэл зүйтэй.
- **Verifier тэмдэглэл:** Дөрвөн файл бүгд баталгаажсан. Auditor-ийн мөрийн дугаар 1-2 мөрөөр зөрсөн (finance fetch нь 93-96, set нь 98; procurement fetch 67-71, set 73; contracts detail tab .then нь 414/420/428) тул засаж тэмдэглэв, гэхдээ агуулга зөв. res.ok шалгахгүй, catch нь console.error-оор хязгаарлагдаж байгаа нь үнэн. Severity=high зөв.

#### int-errors.4 — 🟠 ӨНДӨР Marketing-ROI хуудас supabase алдааг шалгахгүй, мөн setLoading(false) try-ээс гадуур тул алдаанд мөнхийн spinner-т гацна

`marketing-roi-no-error-infinite-spinner`

- **Файл:** `src/app/dashboard/marketing-roi/page.tsx:99`, `src/app/dashboard/marketing-roi/page.tsx:103`, `src/app/dashboard/marketing-roi/page.tsx:106`, `src/app/dashboard/marketing-roi/page.tsx:136`
- **Баримт (evidence):** fetchData() (line 98) calls `const { data } = await supabase.from('leads')...` (99-102) and `.from('ad_campaigns')` (106-111) WITHOUT destructuring/checking error, then setLeads(data||[]) at 103. These two supabase calls are NOT inside try/catch — only later /api fetches are wrapped (115-123, 126-134). setLoading(false) is at line 136 outside any catch. If either supabase call rejects (network/auth throw), fetchData rejects before line 136 and loading stays true forever. Confirmed gate: line 266 `if (loading) return <Spinner>`.
- **Нөлөө:** RLS татгалзал эсвэл сүлжээний алдаа гарвал ROI/lead өгөгдөл чимээгүй хоосон болно (data||[]) эсвэл бүр хуудас мөнхийн spinner дээр гацна (line 266). Алдаа хаана ч харагдахгүй.
- **Зөвлөмж:** supabase дуудлага бүрийн { data, error }-г шалгаж, бүх fetchData-г try/catch-аар бүрэн ороож setLoading(false)-г finally-д байрлуулна; алдааны үед тусдаа алдааны төлөв харуулна.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан. line 266-д `if (loading) return <Spinner>` байгаа нь мөнхийн spinner-ийн эрсдэлийг нотолж байна. Тэмдэглэл: supabase-js ихэвчлэн RLS/query алдаанд reject хийдэггүй ({data:null,error} буцаадаг) тул 'data||[] чимээгүй хоосон' зам илүү байнга тохиолдоно; харин сүлжээ/auth алдаанд reject хийж spinner гацна. Хоёр зам хоёулаа бодит. Severity=high зөв (гацсан хуудас + чимээгүй хоосон өгөгдөл).

#### int-errors.5 — 🟡 ДУНД Backend GET route-ууд нэвтрэлтгүй үед 401-ийн оронд 200 + хоосон body буцаадаг

`unauthorized-returns-200-empty`

- **Файл:** `src/app/api/dashboard/customers/route.ts:17`, `src/app/api/dashboard/contracts/route.ts:15`, `src/app/api/dashboard/service-logs/route.ts:14`, `src/app/api/dashboard/marketing-roi/route.ts:14`, `src/app/api/dashboard/stats/route.ts:22`
- **Баримт (evidence):** customers GET returns NextResponse.json({ customers: [] }) at line 18 when !authShop (no status → 200). contracts GET:15 returns { contracts: [], stats: emptyStats() }. service-logs GET:14 returns { logs: [], stats: emptyStats() }. marketing-roi GET:14 returns { roi: null }. stats GET:22-37 returns full zeroed payload. CONTRAST: customers POST (line 84-85) and conversations/reply POST (line 14-15) correctly return { error:'Unauthorized' } status 401 — so GET vs POST contract is inconsistent.
- **Нөлөө:** Frontend нэвтрэлт амжилтгүй болсныг (хугацаа дууссан сесс, буруу shop) 'өгөгдөл байхгүй'-ээс ялгаж чадахгүй. Энэ нь fetch-no-res-ok асуудлыг улам нуудаг — 401 ч ирэхгүй тул frontend хэзээ ч анзаарахгүй.
- **Зөвлөмж:** Нэвтрэлтгүй GET-д 401 { error } буцаах (эсвэл наад зах нь тогтвортой нэг загвар руу шилжүүлэх), frontend дээр 401-ийг session-refresh/login руу чиглүүлнэ.
- **Verifier тэмдэглэл:** Бүх GET route баталгаажсан (customers:18, contracts:15, service-logs:14, marketing-roi:14, stats:22-37 бүгд 200+хоосон). Гэхдээ auditor-ийн нэг ишлэл буруу: customers/route.ts:84 нь GET биш — энэ нь POST handler бөгөөд 401 буцаадаг (буруу нэрлэснийг засаж GET мөрийг 17/18 болгов). Энэ нь харин 'GET vs POST зөрүүтэй' гэдгийг батлах эсрэг жишээ. Severity=medium зөв: эрсдэл нь UX/contract-ийн зөрүү, аюулгүй байдлын зөрчил биш.

#### int-errors.6 — 🟡 ДУНД AI туслах backend-ийн {error}-г үл тоомсорлож, шалтгаан нуусан ерөнхий алдааны бөмбөлөг харуулна

`ai-assistant-generic-error-hides-cause`

- **Файл:** `src/app/dashboard/ai-assistant/page.tsx:161`, `src/app/dashboard/ai-assistant/page.tsx:194`, `src/app/api/ai-assistant/route.ts:81`
- **Баримт (evidence):** ai-assistant/page.tsx:161 does `if (!response.ok) throw new Error('Failed to fetch')` — discards the response body. catch at :194 renders generic Mongolian bubble 'Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.' (lines 195-202). route.ts:81 returns `{ error: 'Unknown tool: ${toolName}' }` — meaningful messages (and RBAC/rate-limit/validation errors) never reach the user.
- **Нөлөө:** Хэрэглэгч AI-руу хандах эрхгүй (403), хязгаар хүрсэн (429), эсвэл бодит серверийн алдаа гарсныг ялгахгүй — бүгд ижил ерөнхий 'алдаа' бөмбөлөг болно. Дэмжлэг үзүүлэхэд шалтгаан тодорхойгүй.
- **Зөвлөмж:** !response.ok үед body-г уншиж data.error-г бөмбөлөгт харуулах; 401/403/429-д тусгай мессеж (эрх/хязгаар) гаргана.
- **Verifier тэмдэглэл:** page.tsx:161 болон :194-195 (generic bubble), route.ts:81 бүгд бодит кодтой тохирч байна. Backend утга бүхий алдаа буцаах боловч frontend body уншихгүй залгидаг нь үнэн. Severity=medium зөв — UX/дэмжлэгийн асуудал, өгөгдөл алдагдахгүй.

#### int-errors.7 — 🟡 ДУНД Аппад error.tsx (Next.js error boundary) огт байхгүй — render алдаа гарвал түүхий алдааны дэлгэц гарна

`no-app-error-boundary`

- **Файл:** `src/app/layout.tsx`, `src/components/providers/QueryProvider.tsx:7`
- **Баримт (evidence):** find src/app -name 'error.tsx' -o -name 'global-error.tsx' returns 0 results — no route-level or global error boundary exists. grep for ErrorBoundary|componentDidCatch|getDerivedStateFromError across src/ returns nothing. QueryProvider.tsx:7 sets only staleTime, no error fallback.
- **Нөлөө:** Аль ч хуудсанд render-ийн үед гарсан unhandled алдаа (жишээ нь хүлээгдээгүй null/undefined талбар) Next.js-ийн түүхий алдааны overlay/цагаан дэлгэц рүү хүргэнэ — Монгол хэрэглэгчид ойлгомжгүй, сэргээх зам байхгүй.
- **Зөвлөмж:** src/app/error.tsx (болон global-error.tsx) нэмж, Монгол хэлээр найрсаг алдааны дэлгэц + 'Дахин ачаалах' товчтой fallback гаргана. Sentry рүү алдааг тайлагнах ч боломжтой.
- **Verifier тэмдэглэл:** find болон grep хоёулаа 0 үр дүн буцаасан — error.tsx/global-error.tsx файл ч, ямар нэг class ErrorBoundary ч байхгүй нь баталгаатай. Auditor layout.tsx:80 гэж ишилсэн боловч мөрийн дугаар нь чухал биш (файлд боundary байхгүй гэдэг л гол), тул мөрийн дугаарыг хассан. Severity=medium зөв — Sentry байгаа тул бүрэн нуугдахгүй, гэхдээ хэрэглэгчийн туршлага муу.

#### int-errors.8 — 🟡 ДУНД Зарим API route түүхий DB/Facebook алдааны мессежийг client рүү шууд цацна

`raw-db-error-leak-to-client`

- **Файл:** `src/app/api/dashboard/conversations/route.ts:26`, `src/app/api/dashboard/connect-instagram/route.ts:42`, `src/app/api/dashboard/connect-instagram/route.ts:66`
- **Баримт (evidence):** conversations/route.ts:26 returns { error:'Failed to fetch conversations', details: convoError.message } — leaks raw Postgres error string. connect-instagram/route.ts:42 returns `Facebook API: ${igData.error.message}` and :66 returns `DB хадгалахад алдаа: ${updateError.message}`. CONTRAST: safeErrorResponse() helper exists (lib/utils/safe-error.ts:8) and is used in stats/route.ts:156 to deliberately hide internals.
- **Нөлөө:** Дотоод бүтэц (хүснэгт/багана нэр, Postgres/Facebook алдааны нарийвчлал) client-д задарна — мэдээллийн алдагдал ба нэгдсэн алдааны загвараас (safeErrorResponse) хазайсан. details талбар string vs массив (Zod) хэлбэрээр зөрж, frontend боловсруулахад тогтворгүй.
- **Зөвлөмж:** Бүх route-д safeErrorResponse()-г ашиглаж client-д ерөнхий мессеж, серверт л дэлгэрэнгүй log хийнэ. details талбарыг зөвхөн Zod validation-д хязгаарлана.
- **Verifier тэмдэглэл:** Гурван ишлэл бүгд бодит кодтой тохирно (conversations:26 details:convoError.message; connect-instagram:42 Facebook API: ...; :66 DB хадгалахад алдаа: ...). safeErrorResponse helper байгаа бөгөөд stats:156-д хэрэглэгддэг нь зөрүүг батлав. Severity=medium зохистой — connect-instagram нь админ-зөвхөн POST урсгал, conversations нь shop-scoped GET тул эрсдэл дунд зэрэг; өндөр биш.

#### int-errors.9 — 🟡 ДУНД Харилцагч засах (saveCustomer) PATCH-ийн res.ok шалгахгүй — амжилтгүй хадгалалт амжилттай мэт харагдана

`save-customer-no-error-feedback`

- **Файл:** `src/app/dashboard/customers/page.tsx:536`, `src/app/dashboard/customers/page.tsx:540`, `src/app/dashboard/customers/page.tsx:554`
- **Баримт (evidence):** saveCustomer (line 536) calls `await fetch('/api/dashboard/customers', { method:'PATCH', ... })` (540-550) but never checks res.ok and never reads the body. Regardless of outcome it runs setEditMode(false), fetchCustomers(), fetchCustomerDetail() (551-553). catch (554) only fires on thrown network error → console.error (555), no toast/inline message. CONTRAST: createCustomer checks res.ok at line 500, saveNotesOnly at line 526.
- **Нөлөө:** Сервер 400/403/500 буцаахад (RBAC, баталгаажуулалт) хэрэглэгчид өөрчлөлт хадгалагдсан мэт харагдаж, edit горимоос гарна. Дараа нь fetch хийхэд хуучин утга буцаж ирэхэд хэрэглэгч төөрөлдөнө — чимээгүй өгөгдөл алдагдах эрсдэлтэй.
- **Зөвлөмж:** saveCustomer-д res.ok-г шалгаж, бүтэлгүй бол body-н {error}-г toast-оор харуулж editMode-оо хадгална. Бусад PATCH/POST-той ижил загварт оруулна.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан. saveCustomer (536-559) res.ok шалгахгүй, body уншихгүй, амжилт/алдаа аль нь ч бай setEditMode(false)/fetchCustomers/fetchCustomerDetail ажиллана. Ижил файлд createCustomer:500 болон saveNotesOnly:526 res.ok шалгадаг нь зөрчлийг батлав. Severity=medium зөв — чимээгүй өгөгдөл алдагдах боломжтой UX алдаа.

#### int-errors.10 — 🔵 БАГА AI ярианы нэр солих/устгах/үүсгэх алдааг зөвхөн console-д бичиж, хэрэглэгчид мэдэгдэхгүй

`ai-conversations-mutations-silent`

- **Файл:** `src/hooks/useAIConversations.ts:65`, `src/hooks/useAIConversations.ts:103`, `src/hooks/useAIConversations.ts:115`, `src/hooks/useAIConversations.ts:43`
- **Баримт (evidence):** createConversation catch (64-67), renameConversation catch (102-104), deleteConversation catch (114-116), loadConversations catch (42-46) all only console.error with no toast/error surfaced to UI. deleteConversation does optimistic local removal only on success (line 112); a failed rename simply leaves the old title with no user-visible signal (line 101 update is inside try after !res.ok throw).
- **Нөлөө:** Яриа устгах/нэр солих амжилтгүй болоход хэрэглэгч ямар ч мэдэгдэл авахгүй, UI хуучин хэвээр үлдэж 'юу ч болоогүй' мэт харагдана. Бутархай UX боловч ноцтой биш.
- **Зөвлөмж:** Эдгээр mutation-уудад toast.error нэмж, амжилтгүй болсныг хэрэглэгчид мэдэгдэнэ.
- **Verifier тэмдэглэл:** Дөрвөн catch блок бүгд console.error-оор хязгаарлагдсан нь үнэн. Auditor 64/102/114 (catch эхлэх) гэснийг console.error мөр рүү (65/103/115) тодотгов. Optimistic update нь зөвхөн амжилтын дараа явагддаг тул алдаа чимээгүй гэдэг зөв. Severity=low зохистой.


### Authentication / RBAC / Multi-tenant холбоо

_Хэмжүүр: `int-auth-tenant`_

#### int-auth-tenant.1 — 🔴 КРИТИК RLS-ийн get_user_shop_id() нь shop_members-ийг мэддэггүй — leads/properties direct-anon query эзэн биш ажилтанд хоосон

`rls-get-user-shop-id-ignores-members`

- **Файл:** `supabase/migrations/20260113150000_fix_rls_function.sql:52`, `supabase/migrations/20260608120000_add_shop_members.sql:7`, `supabase/migrations/20260128210000_add_real_estate_tables.sql:253`, `src/app/dashboard/leads/page.tsx:93`, `src/app/dashboard/viewings/page.tsx:49`, `supabase/migrations/20260608240000_phase1_multitenant_security.sql:65`
- **Баримт (evidence):** get_user_shop_id() final body (20260113150000:52-63) = `SELECT id FROM shops WHERE user_id = auth.uid() LIMIT 1` — owner-only, single shop. grep confirms it is never redefined after (011 only ALTERs search_path, no body change). leads policies (20260128210000:253,257) USING shop_id = get_user_shop_id(); properties policy (:248-250) same. src/lib/supabase.ts:15 confirms `supabase` is the ANON client (NEXT_PUBLIC_SUPABASE_ANON_KEY). leads/page.tsx:36 + viewings/page.tsx:5 both import this anon client. leads/page.tsx:93 does .eq('shop_id', shop.id) and relies on leads RLS. shop_members (20260608120000:7) added later for non-owner staff. CAVEAT: phase1 migration 20260608240000:65-74 DID add a shop-member-aware FOR ALL policy on property_viewings (and surveys), so viewings/page.tsx:49 now works for members — that part of the claim is mitigated. leads/properties got NO such member-aware policy.
- **Нөлөө:** Эзэн биш ажилтан (shop_members-ээр л холбогдсон) browser-ээс хийдэг leads болон properties-ийн direct anon query-д get_user_shop_id() NULL буцааж, leads/properties жагсаалт ХООСОН харагдана. Олон shop эзэмшигч зөвхөн эхний shop-ынхоо direct-anon leads/properties датаг хардаг — x-shop-id-аар өөр shop руу сэлгэхэд эдгээр direct-supabase хуудас буруу/хоосон үзүүлнэ. (Viewings/surveys нь phase1-ээр аль хэдийн засагдсан.)
- **Зөвлөмж:** leads болон properties RLS policy-г phase1 дахь viewings/surveys policy шиг shop_members-аар OR-лож засах: USING (shop_id IN (SELECT id FROM shops WHERE user_id=auth.uid() UNION SELECT shop_id FROM shop_members WHERE user_id=auth.uid())). Эсвэл эдгээр жагсаалтыг x-shop-id ашигладаг service-role API route руу шилжүүл.
- **Verifier тэмдэглэл:** Цэвэр баталгаажсан: функцийн body owner-only хэвээр (grep-ээр дахин тодорхойлогдоогүй нь батлагдсан), leads/properties policy түүнийг дууддаг, хуудсууд анон клиент ашиглаж байна. Гэхдээ auditor-ийн жишээ болгосон viewings/page.tsx:49 нь phase1 (20260608240000:65) policy-ээр аль хэдийн засагдсан тул framing-ийг 'leads/properties'-д төвлөрүүлж засав. Surface (leads/properties бол гол жагсаалтын хуудсууд) том тул critical хадгалав.

#### int-auth-tenant.2 — 🟠 ӨНДӨР Finance/procurement/contracts API module RBAC шалгадаггүй — sales_manager санхүүгийн нууц дата уншина

`finance-api-no-module-rbac`

- **Файл:** `src/app/api/dashboard/finance/summary/route.ts:13`, `src/lib/auth/supabase-auth.ts:135`, `src/lib/rbac.ts:99`, `src/components/dashboard/Sidebar.tsx:84`
- **Баримт (evidence):** finance/summary/route.ts:13 нь зөвхөн getUserShop() дуудаад supabaseAdmin() (service role, RLS алгасна) ашиглаж property_contracts + finance_transactions асууна (:26-36); module check байхгүй. getUserShop() (supabase-auth.ts:135-178) нь shop гишүүнчлэлийг л шалгана, ямар ч permission/module gate хийдэггүй. grep across api/dashboard/finance, /procurement, /contracts for modules.includes/canAccessModule/resolvePermissions буцаасан нь requireModule-ийн төрлийн module gate ОГТ байхгүй (зөвхөн requireWrite/requireDelete зарим route-д). sales_manager (rbac.ts:99-103) нь 'finance'/'procurement' модульгүй ч хүчинтэй shop гишүүн. Module gate зөвхөн Sidebar.tsx:84 (module:'finance' холбоосын gate) дээр л бий — frontend cosmetic.
- **Нөлөө:** Sidebar нь sales_manager-т finance холбоосыг нуудаг ч, тэрээр /api/dashboard/finance/summary-г шууд дуудаж нийт орлого, цуглуулалт, авлага, VAT зэрэг бүх санхүүгийн нууц датаг уншиж чадна. Module-түвшний RBAC backend дээр хэрэгждэггүй тул эрхгүй дотоод ажилтан санхүү/худалдан авалт/гэрээний датад чөлөөтэй хандана.
- **Зөвлөмж:** getUserShop()-ийн дараа finance/procurement/contracts API-уудад module шалгалт нэмэх (resolvePermissions() → permissions.modules.includes('finance') биш бол 403). Нийтлэг requireModule(name) helper үүсгээд бүх module-scoped route-д хэрэглэх нь хамгийн зөв.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан: finance/summary route module gate-гүй, getUserShop() permission шалгадаггүй (supabase-auth.ts:135-178 уншсан), grep-ээр finance/procurement/contracts дотор module check олдсонгүй, sales_manager 'finance'-гүй ч хүчинтэй гишүүн. severity=high зөв.

#### int-auth-tenant.3 — 🟠 ӨНДӨР Гэрээ/төлбөрийн mutating route-ууд requireWrite/requireDelete дуудахгүй — дурын гишүүн санхүүгийн бичилт хийнэ

`contracts-payments-mutations-ungated`

- **Файл:** `src/app/api/dashboard/contracts/route.ts:74`, `src/app/api/dashboard/contracts/[id]/route.ts:37`, `src/app/api/dashboard/contracts/[id]/payments/route.ts:46`, `src/app/api/dashboard/leads/[id]/convert/route.ts:51`, `src/lib/auth/require-permission.ts:27`
- **Баримт (evidence):** requireWrite/requireDelete helpers байгаа (require-permission.ts:27-44) бөгөөд budgets/transactions/vendors/bills route-ууд тэдгээрийг ашигладаг (grep-ээр баталсан). Харин: contracts/route.ts POST (Excel bulk upsert into property_contracts, handler :74, бодит upsert importContracts дотор :283) зөвхөн getUserShop() (:76); contracts/[id]/route.ts DELETE (:37-58) ба PATCH (:60-99) зөвхөн getUserShop(), requireDelete/requireWrite байхгүй; contracts/[id]/payments/route.ts POST (:46) зөвхөн getUserShop() (:51), payment_schedules-д insert хийнэ (:72-88), мөн body талбаруудыг Zod-гүйгээр шууд уншина; leads/[id]/convert POST зөвхөн getUserShop() (:51) ашиглан leads update + гэрээ үүсгэх trigger өдөөнө.
- **Нөлөө:** Бичих эрхгүй (canWrite=false) viewer эсвэл устгах эрхгүй sales_manager (canDelete=false) ч гэрээ үүсгэх/засах/устгах, төлбөр бүртгэх, гэрээ bulk import хийх боломжтой — учир нь зөвхөн shop-д хамаарах эсэхийг л шалгана. Санхүүгийн нэн чухал бичилтүүдэд RBAC бүрэн алгасагдаж дотоод хяналт эвдэрнэ. payments POST-д Zod validation байхгүй нь нэмэлт эрсдэл.
- **Зөвлөмж:** Гэрээ/төлбөрийн бүх mutating handler-ийн эхэнд `const denied = await requireWrite(); if (denied) return denied;` (устгахад requireDelete) нэмэх. payments POST-д Zod schema үүсгэж validate хийх. budgets/transactions route-той ижил хэв маягийг мөрдөх.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан: contracts/[id] DELETE+PATCH, payments POST, convert POST бүгд зөвхөн getUserShop()-аар хамгаалагдсаныг бодит мөрөөр уншсан; budgets/transactions/vendors/bills нь requireWrite/requireDelete ашигладгийг grep-ээр харьцуулсан. payments POST Zod-гүй нь үнэн. Auditor-ийн line ref-ууд (283/47/62/63) бага зэрэг өөр (POST handler 74-д, upsert 283-д) ч нэхэмжлэлийн агуулга үнэн. severity=high зөв.

#### int-auth-tenant.4 — 🟠 ӨНДӨР useDashboard болон stats route 'viewings'/'contracts' гэсэн байхгүй хүснэгт асууж KPI үргэлж 0 буцаана

`usedashboard-wrong-table-names`

- **Файл:** `src/hooks/useDashboard.ts:50`, `src/hooks/useDashboard.ts:54`, `src/hooks/useDashboard.ts:63`, `src/app/api/dashboard/stats/route.ts:57`, `src/app/api/dashboard/stats/route.ts:64`
- **Баримт (evidence):** Бодит хүснэгтүүд нь property_viewings (20260128210000:155) ба property_contracts (20260312100000:15) — grep-ээр 'viewings'/'contracts' нэртэй CREATE TABLE/VIEW ОГТ байхгүйг баталсан. Харин useDashboard.ts:50 нь supabase.from('viewings'), :54 from('contracts').eq('status','pending'), :63 from('viewings') асууна. stats/route.ts:57 from('viewings'), :64 from('contracts').eq('status','pending') ижил. Hook нь res.error шалгахгүй (counts default 0, :72-75 `|| 0`), stats route мөн count undefined → `|| 0`. property_contracts-ийн статус багана нь contract_status (finance/summary route :29-аас баталсан), 'status' биш.
- **Нөлөө:** Dashboard нүүрний 'Сарын үзлэг' (monthlyViewings) болон 'Хүлээгдэж буй гэрээ' (pendingContracts) KPI үргэлж 0 харагдана (хүснэгт олдохгүй тул query чимээгүй бүтэлгүйтэж count=0). 'upcomingViewings' жагсаалт ч хоосон. Хэрэглэгч бодит үзлэг/гэрээтэй атлаа 0 хардаг — буруу бизнес мэдээлэл.
- **Зөвлөмж:** useDashboard.ts болон stats/route.ts дахь 'viewings'→'property_viewings', 'contracts'→'property_contracts' болгож засах. property_contracts-ийн pending шалгалтыг contract_status багана руу тохируулах. Цаашид res.error-ийг шалгаж толбоор бүү дар.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан: useDashboard.ts:50/54/63 ба stats/route.ts:57/64 буруу хүснэгт нэр ашигладгийг бодит мөрөөр уншсан; 'viewings'/'contracts' нэртэй table/view байхгүйг grep-ээр баталсан; property_viewings/property_contracts л бий. contract_status багана ('status' биш) нь нэмэлт алдааг батална. severity=high зөв.

#### int-auth-tenant.5 — 🟡 ДУНД UI нь canWrite/canDelete-ийг хаана ч шалгадаггүй — viewer/sales_manager-т устгах/засах товч харагдана

`no-write-delete-ui-gating`

- **Файл:** `src/app/dashboard/properties/page.tsx:406`, `src/lib/rbac.ts:99`, `src/lib/auth/require-permission.ts:37`, `src/contexts/AuthContext.tsx:41`
- **Баримт (evidence):** grep across src/app/dashboard + src/components/dashboard for canWrite/canDelete UI gating буцаасан нь зөвхөн Sidebar module-link gating, бусад дээр UI gating алга. properties/page.tsx:398-412 нь Edit (Засах) болон Trash2 (Устгах) товчийг нөхцөлгүй render хийдэг. Backend requireDelete() (require-permission.ts:37-44) нь canDelete=false дүрүүдэд 403 буцаана (sales_manager rbac.ts:105 canDelete:false). AuthContext (AuthContext.tsx:41) нь user.permissions-ийг RolePermissions хэлбэрээр ил гаргадаг ч ямар ч хуудас canWrite/canDelete-г уншдаггүй.
- **Нөлөө:** Бичих/устгах эрхгүй дүрүүд (sales_manager: canDelete=false; viewer: canWrite=false) бүх засах/устгах товчийг хардаг. Дарахад backend 403 буцаах тул хэрэглэгч төөрөгдсөн алдаа хүлээн авна — будлиантай UX. Property delete backend-д хамгаалагдсан (properties route requireDelete ашигладаг) тул дата алдагдахгүй, гэхдээ UX будлиантай.
- **Зөвлөмж:** AuthContext-ийн user.permissions.canWrite/canDelete-г ашиглаж засах/устгах/үүсгэх товчийг нуух эсвэл disable хийх. <PermissionGate> компонент эсвэл useAuth-аас уншдаг жижиг wrapper нэвтрүүлэх.
- **Verifier тэмдэглэл:** Баталгаажсан: properties/page.tsx:398-412 нь товчуудыг нөхцөлгүй render хийдгийг уншсан, AuthContext permissions ил гаргадаг ч UI хэрэглэдэггүйг grep-ээр баталсан. severity=medium зөв (backend хамгаалалттай тул дата алдагдахгүй, зөвхөн UX асуудал).

#### int-auth-tenant.6 — 🟡 ДУНД Fetch-үүд 401/403-ыг боловсруулдаггүй — session дуусахад login руу чиглүүлэлт байхгүй

`no-session-expiry-handling`

- **Файл:** `src/app/dashboard/customers/page.tsx:235`, `src/app/dashboard/customers/page.tsx:241`, `src/hooks/useDashboard.ts:24`, `src/app/api/dashboard/finance/summary/route.ts:14`
- **Баримт (evidence):** grep for 'status === 401'/'status === 403'/signOut()/redirect-to-login across src/app/dashboard + src/hooks буцаасан нь зөвхөн settings/page.tsx:67 (хэрэглэгчийн үйлдэл дээр signOut), бусад нь res.ok-г write үйлдэлд л шалгана; 401→login урсгал хаана ч алга. customers/page.tsx fetchCustomers (:235-241) нь res.ok-г үл харгалзан data.customers уншиж, алдаанд зөвхөн console.error. Ихэнх API GET нь auth-гүй үед 200-empty буцаана (finance/summary:14-15 → {summary:null}), тиймээс гарсан хэрэглэгчийн fetch ч чимээгүй хоосон дата буцааж дахин нэвтрэхийг сануулахгүй.
- **Нөлөө:** Session дуусах/cookie хүчингүй болоход хуудас хоосон дата эсвэл чимээгүй алдаа үзүүлээд login руу чиглүүлэхгүй. Хэрэглэгч 'дата алга боллоо' гэж андуурч, дахин нэвтрэх шаардлагатайг ойлгохгүй. 401-д хариу үзүүлэх нэгдсэн зам байхгүй.
- **Зөвлөмж:** Нэгдсэн apiFetch() wrapper үүсгээд (x-shop-id толгойг ч DRY болгоно) res.status===401 үед signOut()/'/auth/login' руу чиглүүлэх. React-query consumer-уудад global QueryCache onError нэмж 401-д session refresh/redirect хийх.
- **Verifier тэмдэглэл:** Баталгаажсан: customers/page.tsx:235-241 res.ok үл шалгаж data уншдгийг, finance/summary:14 auth-гүйд 200 {summary:null} буцаадгийг уншсан; grep-ээр dashboard/hooks-д 401-redirect урсгал байхгүйг баталсан. Auditor-ийн line ref 226/241 нь функцийн эхлэл; fetch нь 235-д. severity=medium зөв.

#### int-auth-tenant.7 — 🟡 ДУНД Leads статус шинэчлэлт shop_id-аар шүүгдэхгүй, зөвхөн эвдэрхий RLS-д найдна

`leads-direct-update-no-shop-filter`

- **Файл:** `src/app/dashboard/leads/page.tsx:143`, `supabase/migrations/20260128210000_add_real_estate_tables.sql:257`
- **Баримт (evidence):** leads/page.tsx:143-146 нь supabase.from('leads').update({status,...}).eq('id', id) — зөвхөн id-аар шүүгдэнэ, .eq('shop_id',...) байхгүй. Tenant тусгаарлалт бүхэлдээ leads RLS 'Shop owners can manage their leads' USING shop_id = get_user_shop_id() (20260128210000:257-259)-д найдна, тэр нь (rls-get-user-shop-id-ignores-members findings-ийн дагуу) owner-only/эхний shop. Уг хуудасны leads унших query (:96) нь .eq('shop_id', shop.id) НЭМДЭГ — консистентгүй.
- **Нөлөө:** Tenant тусгаарлалт цорын ганц эвдэрхий RLS функцэд бүрэн найдсан. Эзэн биш ажилтан энэ update-ыг RLS-ээс болж огт хийж чадахгүй (NULL ↦ мөр тохирохгүй) — статус шинэчлэлт чимээгүй бүтэлгүйтэж UI optimistic төлвөөр (:150) хуурамчаар амжилттай харагдана. Олон-shop эзэнд буруу shop-ийн lead засагдах эрсдэл бага ч консистенц алдагдсан.
- **Зөвлөмж:** Direct update-д ил .eq('shop_id', shop.id) нэмж RLS-ийн ганц цэгийн эвдрэлээс хамгаалах (defense-in-depth), эсвэл бусад mutating үйлдлийн адил /api route-аар дамжуулах. RLS функцийг засах нь (дээрх critical) суурь шийдэл.
- **Verifier тэмдэглэл:** Баталгаажсан: leads/page.tsx:143-146 update нь зөвхөн .eq('id') ашиглаж байгаа, харин :96 унших нь .eq('shop_id') нэмдэг (консистентгүй) — бодит мөрөөр уншсан. leads RLS get_user_shop_id()-д найддаг нь үнэн. severity=medium зөв (одоохондоо ганц shop-д ажиллах ч defense-in-depth + консистенцийн асуудал).

#### int-auth-tenant.8 — 🟡 ДУНД Middleware SESSION_JWT_SECRET тохируулагдаагүй үед vertmon-session cookie-г шалгалтгүй итгэдэг

`middleware-dev-mode-cookie-trust`

- **Файл:** `src/middleware.ts:75`, `src/middleware.ts:93`, `src/lib/auth/resolve-user.ts:37`
- **Баримт (evidence):** middleware.ts:75-97: vertmon-session cookie байгаа ба SESSION_JWT_SECRET тохируулагдсан бол (:79) parts.length===3 ба payload-ийн exp/sub-г base64 decode-оор л шалгана (:82-88) — бодит HMAC signature verify ХИЙХГҮЙ (comment 'Verify JWT signature' гэсэн ч зөвхөн atob(parts[1])). SESSION_JWT_SECRET тохируулагдаагүй бол (:93-96) 'No JWT secret configured — trust cookie existence (dev mode)' гэж дурын хоосон биш vertmon-session cookie-д NextResponse.next() буцаана. resolve-user.ts:37-64 нь mat resolveApiUser-д custom cookie-г decryptSession()-аар хүндэлдэг (AI route-уудад).
- **Нөлөө:** Production-д SESSION_JWT_SECRET тохируулагдаагүй бол дурын утгатай vertmon-session cookie тавьсан хэн ч /dashboard, /admin руу нэвтэрнэ — бүрэн auth bypass. Secret тохируулагдсан ч middleware зөвхөн бүтэц/exp шалгаж signature-г Edge дээр бодитоор баталгаажуулдаггүй тул хуурамч payload зохиох эрсдэлтэй.
- **Зөвлөмж:** Dev-mode 'trust cookie existence' замыг production-д идэвхгүй болгох (NODE_ENV!=='development' үед secret заавал шаардах, байхгүй бол Supabase шалгалт руу шилжих). Edge-д тохирох jose/HMAC verify нэмж signature-г бодитоор шалгах.
- **Verifier тэмдэглэл:** Баталгаажсан: middleware.ts:82-88 нь зөвхөн atob payload decode + exp/sub шалгана (HMAC verify байхгүй comment-ийг үл харгалзан), :93-96 нь secret байхгүй үед cookie оршихыг л итгэдгийг уншсан. resolve-user.ts:61-64 custom cookie-г хүндэлдэг. severity=medium зөв (dev-mode заалт нь production-д буруу тохиргооноос л идэвхждэг тул critical биш; гэхдээ тохируулга алдсан тохиолдолд бүрэн bypass).

#### int-auth-tenant.9 — 🔵 БАГА switchShop reload-оос өмнө хуучин x-shop-id/state-тэй дата авч болзошгүй

`switchshop-reload-stale-data-window`

- **Файл:** `src/contexts/AuthContext.tsx:172`, `src/contexts/AuthContext.tsx:149`
- **Баримт (evidence):** switchShop (AuthContext.tsx:172-189) нь /api/user/switch-shop руу POST хийгээд data.success && data.shop үед setActiveShop(data.shop) (:183, localStorage+setShop бичнэ) дараа нь шууд window.location.reload() (:184). setActiveShop (:149-156) нь ACTIVE_SHOP_KEY-г синхроноор бичнэ тул reload-ийн дараа консистент. Эрсдэл нь setActiveShop ба reload хоорондын богино window, мөн зөв ажиллахын тулд hard reload-д найдаж байгаа явдал.
- **Нөлөө:** Shop сэлгэх агшинд богино window-д хуучин shop-ийн in-flight query шинэ контекстэд харагдаж магадгүй (reload болтол). Hard reload нь UX-д сөрөг (бүх state/кэш алдагдана); олон direct-supabase хуудас shop.id-г useEffect dependency болгосон тул reload-гүйгээр ч reactive шинэчлэгдэх боломжтой байсан.
- **Зөвлөмж:** window.location.reload()-ийн оронд react-query кэшийг queryClient.invalidateQueries()-ээр цэвэрлэж shop.id өөрчлөгдөхөд бүх хуудас reactive дахин татах. Шаардлагатай бол reload-оос өмнө in-flight query-г цуцлах.
- **Verifier тэмдэглэл:** Баталгаажсан: AuthContext.tsx:172-189 switchShop, :149-156 setActiveShop synchronous localStorage бичилт — бодит мөрөөр уншсан. severity=low зөв (hard reload-аар сэргээдэг тул бодит дата алдагдах эрсдэл бага, гол нь UX + богино window).


### Type safety ба өгөгдлийн урсгал

_Хэмжүүр: `int-types-dataflow`_

#### int-types-dataflow.1 — 🔴 КРИТИК useDashboard байхгүй хүснэгт/багана асууж, статистик чимээгүй 0 болдог

`usedashboard-wrong-table-names`

- **Файл:** `src/hooks/useDashboard.ts:50`, `src/hooks/useDashboard.ts:54`, `src/hooks/useDashboard.ts:55`, `src/hooks/useDashboard.ts:63`, `src/app/dashboard/page.tsx:47`
- **Баримт (evidence):** useDashboard.ts:50 `supabase.from('viewings')` and :54 `supabase.from('contracts')...eq('status','pending')`. Migrations only CREATE `property_viewings` (20260128210000:155) and `property_contracts` (20260312100000:15); grep for `create (view|table) ... (viewings|contracts)` returns NO exact match — no such relation/view exists. contract_status column added in 20260415120000:38 (VARCHAR DEFAULT 'active'), used with active/closed elsewhere — there is no `status` column nor 'pending' value. supabase-js returns relation-not-found as a non-throwing error object, so viewingsRes.count/contractsRes.count are null → `|| 0` (lines 74-75); queryFn never throws so useQuery never surfaces it. dashboard/page.tsx:47 consumes via useDashboard.
- **Нөлөө:** Нүүр хуудасны 'Үзлэг (сар)' ба 'Хүлээгдэж буй гэрээ' тоонууд бодит өгөгдлөөс үл хамааран ҮРГЭЛЖ 0 харагдана. Алдаа чимээгүй залгигдсан тул хэрэглэгч буруу 0-г зөв гэж итгэх ба менежерийн KPI самбар найдваргүй.
- **Зөвлөмж:** useDashboard-д `viewings`→`property_viewings`, `contracts`→`property_contracts` болгож, гэрээний шүүлтийг `.eq('contract_status', 'active')` (бизнесийн логикт нийцүүлэн) болгох. queryFn дотор `if (res.error) throw res.error` нэмж алдааг ил гаргах. Зөв жишээ нь viewings/page.tsx:50-51 (`property_viewings`, `properties(name)`).
- **Verifier тэмдэглэл:** Бүрэн баталгаажлаа. useDashboard.ts:50,54 яг `viewings`/`contracts` хүснэгт асууж байна; миграцид ийм relation/view огт байхгүй (зөвхөн property_viewings/property_contracts). `status='pending'` багана/утга мөн байхгүй (бодит нь contract_status active/closed/cancelled). count нь null болж `||0`-руу унана. Critical severity зөв — гол KPI хоёулаа худал 0 харуулна.

#### int-types-dataflow.2 — 🟠 ӨНДӨР /api/dashboard/stats мөн адил `viewings`/`contracts` хүснэгт асууна

`stats-route-wrong-table-names`

- **Файл:** `src/app/api/dashboard/stats/route.ts:57`, `src/app/api/dashboard/stats/route.ts:64`, `src/app/api/dashboard/stats/route.ts:66`
- **Баримт (evidence):** stats/route.ts:57 `supabase.from('viewings')...gte('created_at')` and :64-67 `supabase.from('contracts')...eq('status','pending')`. Same non-existent relations/columns confirmed via migration grep. The handler wraps in try/catch (line 9/155) but these are non-throwing PostgREST errors, so `monthlyViewings` (line 56) / `pendingContracts` (line 63) destructure to null → returned as 0 at lines 146-147. Logic duplicated with useDashboard.
- **Нөлөө:** Энэ endpoint-ийг ашигладаг бүх консьюмерт үзлэг/гэрээний тоо буруу 0 буцаана. useDashboard-тай ижил алдаа хоёр газар давхардсан тул засвар алгасах эрсдэл өндөр.
- **Зөвлөмж:** stats/route.ts:57,64-67-д хүснэгт/баганын нэрсийг засаж (property_viewings, property_contracts.contract_status), useDashboard-той нэг helper/нэг API-аас уншихаар нэгтгэх.
- **Verifier тэмдэглэл:** Баталгаажлаа. stats/route.ts:57 `viewings`, :64 `contracts`, :67 `eq('status','pending')` — useDashboard-тай яг ижил буруу. try/catch байгаа ч PostgREST алдаа throw хийдэггүй тул count=null→0. High severity зөв (critical биш, учир нь энэ route-ийн жинхэнэ консьюмерийг хайхад нүүр хуудас useDashboard-аар явдаг; гэхдээ дуплекат алдаа батлагдсан).

#### int-types-dataflow.3 — 🟠 ӨНДӨР useRealtimeNotifications устгагдсан `orders` хүснэгт сонсож, chat_history-д байхгүй талбар уншина

`realtime-notifications-stale-and-crash`

- **Файл:** `src/hooks/useRealtimeNotifications.ts:25`, `src/hooks/useRealtimeNotifications.ts:33`, `src/hooks/useRealtimeNotifications.ts:50`, `src/hooks/useRealtimeNotifications.ts:52`
- **Баримт (evidence):** useRealtimeNotifications.ts:25 subscribes `table: 'orders'` (e-commerce, CLAUDE.md 'Recently Removed'); :33 toast action `router.push('/dashboard/orders')` — устгагдсан хуудас. chat_history handler :50 checks `payload.new.role === 'user'`, :52 reads `payload.new.content.substring(0,50)`. Migrations show chat_history has only message/response/intent (001_initial_schema_safe.sql:111-112) — NO `role`, NO `content`. Confirmed via code: ChatHistoryService.ts:41-43 inserts only {message,response,intent}; WebhookService.ts:396 and conversations/reply/route.ts:57 same. So `role` is always undefined → the `if (role==='user')` guard at :50 is ALWAYS false → the `.substring` block at :52 NEVER executes (no TypeError fires); the toast simply never appears.
- **Нөлөө:** Бодит цагийн чат мэдэгдэл (toast) ХЭЗЭЭ Ч ГАРАХГҮЙ: `role` багана DB-д байхгүй тул :50 шүүлт үргэлж false. orders subscription нь устгагдсан хүснэгт сонсдог тул хэзээ ч галдахгүй (галдсан ч устгагдсан /dashboard/orders руу чиглүүлнэ). Хук бүх dashboard хуудсанд ажилладаг тул realtime notification бүрэн ажиллахгүй.
- **Зөвлөмж:** orders subscription (:22-41)-г бүрэн устгах. chat_history handler-т `payload.new.role`-г салгаж (DB-д role байхгүй) шинэ мессежийн ялгааг `message != ''` зэргээр шинэчлэх, `payload.new.content`-г `payload.new.message`-аар солих.
- **Verifier тэмдэглэл:** Баталгаажсан боловч framing засав. Auditor 'content.substring TypeError шиднэ' гэсэн нь БУРУУ: `role` багана хэзээ ч 'user' болохгүй (DB-д огт байхгүй, бүх insert site зөвхөн message/response/intent бичдэг — ChatHistoryService.ts:41-43, WebhookService.ts:396) тул :52 мөр хэзээ ч ажиллахгүй, crash гарахгүй. Бодит нөлөө нь 'toast хэзээ ч гарахгүй' (чимээгүй эвдрэл) ба orders subscription dead. Severity high хэвээр зөв — realtime notification бүрэн ажиллахгүй + устгагдсан хүснэгт/хуудас.

#### int-types-dataflow.4 — 🟠 ӨНДӨР upcomingViewings нь properties.title асуудаг ч багана нь `name`

`dashboard-property-title-mismatch`

- **Файл:** `src/hooks/useDashboard.ts:63`, `src/app/dashboard/page.tsx:207`, `src/app/dashboard/properties/page.tsx:127`
- **Баримт (evidence):** useDashboard.ts:63 `select('*, properties(title)')`; dashboard/page.tsx:207 reads `v.properties?.title`. properties table column is `name VARCHAR(255) NOT NULL` (20260128210000:33); grep finds no `title` column anywhere. Property type declares `name` (types/property.ts). properties/page.tsx:127 has defensive `(p.name || (p as any).title || '')` — dead cast confirming the confusion. NOTE: useDashboard.ts:63 ALSO queries the non-existent `viewings` table (see finding usedashboard-wrong-table-names), so upcomingViewings is empty regardless — the title bug is masked by the bigger table bug until that is fixed.
- **Нөлөө:** Хүснэгтийн нэр засагдсаны дараа ч 'Ойролцоох үзлэгүүд' дээр байрны нэр харагдахгүй (`properties(title)` нь PostgREST embed алдаа эсвэл null → page.tsx:207 `v.notes || 'Үзлэг'` руу унана). Хэрэглэгч ямар байрны үзлэг болохыг мэдэхгүй.
- **Зөвлөмж:** useDashboard.ts:63 `properties(title)`→`properties(name)`, dashboard/page.tsx:207 `v.properties?.title`→`v.properties?.name`. properties/page.tsx:127-ийн `(p as any).title` dead cast-ыг устгах. (Эхлээд viewings→property_viewings засахыг анхаарна.)
- **Verifier тэмдэглэл:** Кодын ишлэл бүрэн зөв: useDashboard.ts:63 `properties(title)`, page.tsx:207 `.title`, properties/page.tsx:127 dead cast. properties хүснэгтэд `name` багана (миграц 20260128210000:33), `title` огт байхгүй. Severity-г medium→high болголоо: энэ бол data-flow + type-safety хосолсон бодит UI алдаа (title үргэлж undefined), мөн useDashomard-ийн хүснэгтийн алдааг засах үед энэ нь шууд илрэх тул засварт хамт оруулах ёстой. viewings/page.tsx:51 нь `properties(name)`-г зөв ашигладаг тул эх сурвалж тодорхой.

#### int-types-dataflow.5 — 🟠 ӨНДӨР Гэрээний төлбөрийн POST нь баталгаажуулалтгүй, string >= харьцуулалтаар status буруу тогтооно

`payments-string-number-coercion`

- **Файл:** `src/app/api/dashboard/contracts/[id]/payments/route.ts:57`, `src/app/api/dashboard/contracts/[id]/payments/route.ts:84`, `src/app/api/dashboard/contracts/[id]/payments/route.ts:93`
- **Баримт (evidence):** POST :57 `const body = await request.json()` — Zod schema огт байхгүй. :84 `status: body.paid_amount >= body.amount ? 'paid' : body.paid_amount > 0 ? 'partial' : 'pending'` — string JSON ирвэл лексикографик харьцуулалт (жишээ `'9' >= '10'` === true → хэсэгчилсэн төлбөр 'paid'). :93 нь зөвөөр `Number(body.paid_amount) > 0` ашигладаг — нэг handler дотор зөрчилтэй coercion. PATCH :146-152-д мөн адил кастгүй `>=` харьцуулалт. payment_schedules.due_date DATE NOT NULL (20260416:тодорхойлолт) тул дутуу due_date ирвэл DB-д унаж 500 болно.
- **Нөлөө:** String дата ирвэл хэсэгчилсэн төлбөр 'paid' гэж буруу тэмдэглэгдэж, гэрээний төлбөрийн төлөв ба санхүүгийн тайлан гажина. Баталгаажуулалтгүй тул буруу/дутуу талбар шууд DB рүү орох эрсдэл (due_date NOT NULL дээр 500 алдаа).
- **Зөвлөмж:** POST/PATCH-д Zod schema нэмж `amount`/`paid_amount`-ыг `z.coerce.number()`-оор кастлах, статус тооцоог (:84, :147-150) `Number()` утга дээр хийх. Бусад route-уудтай ижил validateBody загвар нэвтрүүлэх.
- **Verifier тэмдэглэл:** Бүрэн баталгаажлаа. :57 Zod байхгүй, :84 кастгүй `>=`, :93 `Number(...)` — нэг handler дотор зөрүүтэй. PATCH :146-152-д ч ижил алдаа давтагдсан. String JSON-д лексикографик харьцуулалт бодит эрсдэл. High severity зөв (санхүүгийн дата буруу бичигдэх боломж).

#### int-types-dataflow.6 — 🟡 ДУНД Олон fetch нь res.ok шалгахгүй, алдааны үед чимээгүй хоосон/эвдрэл харуулна

`no-res-ok-checks-silent-empty`

- **Файл:** `src/app/dashboard/customers/page.tsx:219`, `src/app/dashboard/customers/page.tsx:240`, `src/app/dashboard/customers/page.tsx:275`, `src/app/dashboard/marketing-roi/page.tsx:119`, `src/app/dashboard/marketing-roi/page.tsx:130`
- **Баримт (evidence):** customers/page.tsx:219-220 fetchHealth `const data = await res.json(); setHealth(data.health || null)` — res.ok шалгахгүй. :240-241 fetchCustomers `setCustomers(data.customers || [])` — мөн адил, 401/500 дээр data.customers undefined → хоосон жагсаалт, catch (243) нь зөвхөн console.error (res.json() амжилттай тул galдахгүй). :275-276 fetchCustomerDetail `setSelectedCustomer(data.customer)` дараа нь :278 `data.customer.name` — customers/[id] route 401/404 дээр `{error}` буцаадаг (route.ts:13,28) тул data.customer undefined → :278 TypeError CRASH. marketing-roi:119-120 `data.roi`, :130-131 `data.posts/insights` — мөн res.ok шалгахгүй (try/catch-д ороосон).
- **Нөлөө:** Сервер алдаа/эрхгүй үед хэрэглэгчид хоосон төлөв харагдаж бодит алдаа далдлагдана. Харилцагчийн дэлгэрэнгүйд (:275-278) бол undefined.name TypeError шидэж дэлгэц цухуйж болзошгүй. Дебаг хэцүү, дата алдагдсан мэт сэтгэгдэл.
- **Зөвлөмж:** fetch бүрд `if (!res.ok) { toast.error(...); return; }` нэмэх (ялангуяа :219,:240,:275). Илүү сайн нь x-shop-id header+res.ok-г нэгтгэсэн `apiFetch()` helper гаргаж бүх хуудсанд ашиглах.
- **Verifier тэмдэглэл:** Баталгаажлаа. customers/page.tsx:219,240,275 болон marketing-roi:119,130 бүгд res.ok шалгахгүй. Нэмэлт: fetchCustomerDetail :276→:278 нь data.customer undefined үед TypeError CRASH болох эрсдэлтэй (route 401/404 дээр {error} буцаадаг — route.ts:13,28), зөвхөн 'silent empty' биш. Medium severity зөв; framing-д CRASH боломжийг нэмлээ. Auditor-ийн line 226 ишлэл буруу байсан (fetchHealth нь 212/219, fetchCustomers нь 226/240) — файлд тааруулж засав.

#### int-types-dataflow.7 — 🟡 ДУНД Клиент/сервер хооронд хуваалцсан request/response DTO төрөл байхгүй, интерфэйс давхардсан

`no-shared-dto-types-duplicated`

- **Файл:** `src/hooks/useFeatures.ts:45`, `src/hooks/useConversations.ts:12`, `src/app/dashboard/customers/page.tsx:50`, `src/app/api/features/route.ts:154`
- **Баримт (evidence):** useFeatures.ts:45 declares `FeaturesResponse` (+Features:10, Limits:27) inline; useConversations.ts:5-20 declares `Message`/`Conversation` inline; customers/page.tsx:50-66 declares `Customer` inline. Server features/route.ts:154 returns `NextResponse.json({ features: effectiveFeatures, ... })` where effectiveFeatures (:145) = `{...planData.features (any), ...shop.enabled_features (any)}` — `any`-typed DB JSON. src/types holds only ai.ts/database.ts/property.ts — no API DTO module. Client TS interfaces are unverified fictions over `any` server output.
- **Нөлөө:** Сервер хариуны бүтэц өөрчлөгдөхөд клиентэд compile алдаа гарахгүй — зөвхөн runtime-д undefined талбараар илрэнэ. Олон газар ижил төрөл давхардсан тул drift эрсдэл өндөр.
- **Зөвлөмж:** src/types-д API DTO-уудыг нэг удаа тодорхойлж route handler болон client hook хоёул импортлох. Боломжтой бол Zod schema-аас `z.infer` ашиглан нэг эх сурвалжаас төрөл гаргах.
- **Verifier тэмдэглэл:** Баталгаажлаа. useFeatures.ts:45 FeaturesResponse, useConversations.ts:12 Conversation (Message:5), customers/page.tsx:50 Customer — бүгд inline давхардсан. features/route.ts:145,154 нь effectiveFeatures-ийг `planData as any`.features + shop.enabled_features-аас (any) барьж буцаадаг — клиент тал баталгаажаагүй. Medium severity зөв (architectural drift эрсдэл, шууд эвдрэл биш).

#### int-types-dataflow.8 — 🟡 ДУНД Шүүлтээр дахин fetch хийдэг хуудсуудад AbortController байхгүй — race condition

`raw-fetch-no-abort-race`

- **Файл:** `src/app/dashboard/customers/page.tsx:202`, `src/app/dashboard/customers/page.tsx:226`, `src/app/dashboard/leads/page.tsx:87`, `src/app/dashboard/properties/page.tsx:85`
- **Баримт (evidence):** customers/page.tsx:202-205 useEffect re-runs fetchCustomers on `[selectedTag, sortBy, tierFilter, stageFilter]` — AbortController байхгүй; хурдан шүүлт солиход давхцсан хүсэлт гарч удаан (хуучин) хариу сүүлд resolve болж setCustomers (:241)-г хуучин үр дүнгээр дарж бичнэ. leads/page.tsx:87-132 (deps `[shop?.id, statusFilter]`) болон properties/page.tsx:85-124 (deps `[shop?.id, typeFilter, statusFilter]`) ижил загвар — abort байхгүй. Эсрэгээр useAIConversations.ts abort хийдэг; react-query (useDashboard) keyed cache-аар зайлсхийдэг.
- **Нөлөө:** Хэрэглэгч шүүлтийг хурдан сольвол өмнөх хүсэлтийн хариу сүүлд ирж жагсаалт сонгосон шүүлттэй таарахгүй болж болзошгүй — будлиантай UX, буруу дата.
- **Зөвлөмж:** Эдгээр raw-fetch хуудсуудыг react-query (queryKey-д шүүлтүүдийг оруулсан) руу шилжүүлэх, эсвэл useEffect дотор AbortController ашиглаж cleanup-д abort хийх.
- **Verifier тэмдэглэл:** Баталгаажлаа. customers/page.tsx:202-205, leads/page.tsx:87-132, properties/page.tsx:85-124 бүгд шүүлт өөрчлөлтөөр refetch хийдэг бөгөөд abort байхгүй. Auditor-ийн properties ишлэл 124 (useEffect төгсгөл) байсныг :85 (эхлэл) болгож тодотгов. viewings/page.tsx нь client-side л шүүдэг тул race-д хамаарахгүй — auditor зөв оруулаагүй. Medium severity зөв.

#### int-types-dataflow.9 — 🔵 БАГА useFeatures интерфэйс бодит байдалтай зөрүүтэй (gpt-4o, cart_system, max_products)

`features-type-reality-divergence`

- **Файл:** `src/hooks/useFeatures.ts:12`, `src/hooks/useFeatures.ts:15`, `src/hooks/useFeatures.ts:30`, `src/app/api/features/route.ts:59`
- **Баримт (evidence):** useFeatures.ts:12 `ai_model: 'gpt-4o-mini' | 'gpt-4o'` (апп нь Google Gemini ашигладаг — CLAUDE.md tech stack). :15 `cart_system: 'none'|'basic'|'full'`, :16 `payment_integration`, :30 `max_products` — CLAUDE.md 'Recently Removed' e-commerce үлдэгдэл. features/route.ts:59 default `ai_model: 'gpt-4o-mini'`, :62 `cart_system: 'none'`, :76 `max_products: 10`; :115 `'gpt-4o'`, :118 `cart_system: 'full'`. Баталгаажуулалтгүйгээр интерфэйс рүү кастлагдана.
- **Нөлөө:** Төрөл бодит бизнес логикийг тусгахгүй — gpt-4o хэзээ ч ашиглагдахгүй, cart/products нь real-estate-д утгагүй. Шинэ хөгжүүлэгч буруу ойлгож dead feature gate-д цаг алдах эрсдэл.
- **Зөвлөмж:** Features/Limits интерфэйсээс e-commerce үлдэгдэл (cart_system, payment_integration, max_products) ба gpt-4o-г цэвэрлэж, бодит Gemini/real-estate feature-ээр солих. Server default-уудыг (route.ts:59,62,76,115,118) мөн засах.
- **Verifier тэмдэглэл:** Баталгаажлаа. useFeatures.ts:12,15,16,30 болон features/route.ts:59,62,76,115,118 бүгд gpt-4o/cart_system/max_products агуулдаг — Gemini апп + real-estate domain-д зориуддахгүй legacy. Low severity зөв (тех өр/төөрөгдөл, шууд алдаа биш).

#### int-types-dataflow.10 — 🔵 БАГА Fetched дата олон газар `any` төрөлтэй, баталгаажуулалтгүй cast

`fetched-data-typed-any`

- **Файл:** `src/hooks/useDashboard.ts:14`, `src/hooks/useDashboard.ts:15`, `src/app/dashboard/marketing-roi/page.tsx:81`, `src/app/dashboard/leads/page.tsx:106`, `src/app/dashboard/properties/page.tsx:104`, `src/app/dashboard/viewings/page.tsx:56`
- **Баримт (evidence):** useDashboard.ts:14-15 interface `recentLeads: any[]; upcomingViewings: any[]`. marketing-roi:81 `useState<any[]>([])` for leads. leads/page.tsx:106 `data as Lead[]`, properties/page.tsx:104 `data as Property[]` — raw Supabase output-ыг runtime баталгаажуулалтгүй blind cast. viewings/page.tsx:56 `(data || []).map((v: any) => ...)`. dashboard/page.tsx:197 `(v: any)`, :143 `(lead: any)`.
- **Нөлөө:** Хилийн дата дээр төрлийн хамгаалалт алга — DB schema/select өөрчлөгдөхөд compile-д баригдахгүй, зөвхөн runtime-д undefined талбараар илрэнэ (жишээ нь properties(title) алдаа яг ингэж нуугдсан).
- **Зөвлөмж:** any-г бодит төрлөөр солих; Supabase generated `Database` типийг ашиглах, эсвэл чухал хариунд Zod parse хийж runtime-д баталгаажуулах.
- **Verifier тэмдэглэл:** Баталгаажлаа. useDashboard.ts:14,15 any[], marketing-roi:81 useState<any[]>, leads:106 `data as Lead[]`, properties:104 `data as Property[]`, viewings:56 `(v: any)` — бүгд бодитоор файлд байна. dashboard/page.tsx:197 `(v: any)` мөн бий. Low severity зөв (далд төрлийн эрсдэл, нэг тодорхой эвдрэл биш).

#### int-types-dataflow.11 — 🔵 БАГА Браузераас шууд Supabase write хийж, optimistic update-г сервер баталгаажуулалтгүй хийнэ

`direct-supabase-mutation-optimistic-desync`

- **Файл:** `src/app/dashboard/leads/page.tsx:143`, `src/app/dashboard/leads/page.tsx:150`, `src/app/dashboard/viewings/page.tsx:66`, `src/app/dashboard/viewings/page.tsx:74`
- **Баримт (evidence):** leads/page.tsx:143-146 `supabase.from('leads').update({status,updated_at}).eq('id', id)` — браузерын anon client, shop_id шүүлтгүй (RLS тенант хязгаарлалтыг хариуцна), дараа нь :150 `setLeads(prev => prev.map(...))` оролтоос (DB буцаасан мөрөөс биш) local state шинэчилнэ. viewings/page.tsx:66-69 `supabase.from('property_viewings').update({status}).eq('id', id)` мөн ижил, :74 optimistic. Хоёулаа error шалгадаг (leads:148, viewings:70) тул silent биш, гэхдээ DB trigger/тооцоо local state-д тусахгүй.
- **Нөлөө:** RLS зөв тохируулагдаагүй бол өөр shop-ийн мөр шинэчлэх эрсдэл. DB trigger/тооцоо local state-д тусахгүй тул optimistic state бодит DB-тэй зөрж болзошгүй. Гурван өөр дата хандалтын загвар (react-query / raw fetch / direct supabase) зэрэгцэн оршдог нь засварыг эмх замбараагүй болгоно.
- **Зөвлөмж:** Write үйлдлийг API route (getUserShop + shop_id шүүлт) руу шилжүүлж `.select()` буцаасан мөрөөр local state шинэчлэх. Дата хандалтын нэг конвенц (react-query + API) сонгох.
- **Verifier тэмдэглэл:** Баталгаажлаа. leads/page.tsx:143-146 шууд supabase update + :150 optimistic, viewings/page.tsx:66-69 + :74 ижил. Auditor-ийн viewings ишлэл 65 байсныг :66 (update мөр) болгож тодотгов. Хоёулаа error-ыг шалгадаг тул 'сервер баталгаажуулалтгүй' гэдгийг 'optimistic нь DB буцаалтаас биш оролтоос' гэж нарийвчлахад зөв. Low severity зөв — RLS-д тулгуурлах нь бодит эрсдэл боловч таамаглалд тулгуурласан.


---

## 🎨 UX / UI — UX/UI

### Мэдээллийн архитектур ба навигаци

_Хэмжүүр: `ux-ia-nav`_

#### ux-ia-nav.1 — 🟠 ӨНДӨР /help хуудас устгагдсан /setup, /dashboard/products руу холбоос өгч, e-commerce агуулгатай хэвээр

`help-page-dead-ecommerce-links`

- **Файл:** `src/app/help/page.tsx`, `src/components/dashboard/Sidebar.tsx`
- **Баримт (evidence):** help/page.tsx line 50 <Link href="/setup"> and line 64 <Link href="/dashboard/products"> ('Бүтээгдэхүүн'). Both routes confirmed GONE (ls src/app/setup, src/app/dashboard/products → No such file or directory). FAQ array contains stale copy: line 20 'Бүтээгдэхүүн нэмж болох уу?' / answer line 21, and line 24 'Захиалга хэрхэн үүсдэг вэ?' / answer line 25, describing deleted products/orders flow. Line 78 third card also says 'Борлуулалт, захиалга хянах' (e-commerce). /help linked from Sidebar.tsx:141 bottomMenuItems, visible to all roles.
- **Нөлөө:** Бүх хэрэглэгчид харагдах Тусламж хуудасны 2 үндсэн карт дарвал 404 алдаа гаргана. FAQ нь байхгүй болсон бүтээгдэхүүн/захиалгын функцийг тайлбарлаж шинэ үл хөдлөхийн хэрэглэгчдийг төөрөгдүүлж, бүтээгдэхүүний итгэлийг бууруулна.
- **Зөвлөмж:** Line 50, 64 дэх /setup болон /dashboard/products картуудыг бодит хуудас руу (/dashboard/settings Facebook холболт, /dashboard/properties) солих. FAQ-н бүтээгдэхүүн/захиалгын асуултуудыг (line 20-25) болон line 85 'захиалга' текстийг үл хөдлөх/лийд/гэрээний агуулгаар дахин бичих.
- **Verifier тэмдэглэл:** Баталгаажсан. src/app/help/page.tsx:50 ба :64 дээр устгагдсан /setup, /dashboard/products руу амьд Link байна (хоёулаа ls-ээр алга). FAQ stale текст бодит байна (асуултын мөр 20/24, хариултын мөр 21/25 — auditor-ийн line 21/25 ишлэл хариултыг заасан тул зөв). Sidebar.tsx:141-д /help холбоотой. high severity зөв: бодит broken nav + домэйн төөрөгдөл.

#### ux-ia-nav.2 — 🟠 ӨНДӨР reports/properties, ai-assistant/agents, inbox/messages хуудсууд бүрэн ажиллагаатай мөртлөө ямар ч цэс/холбоосоор хүрэх боломжгүй өнчин

`orphan-pages-no-nav-entry`

- **Файл:** `src/app/dashboard/reports/properties/page.tsx`, `src/app/dashboard/ai-assistant/agents/page.tsx`, `src/app/dashboard/inbox/messages/page.tsx`, `src/components/dashboard/Sidebar.tsx`
- **Баримт (evidence):** grep across src/components for inbound nav links: 'reports/properties', 'ai-assistant/agents', 'inbox/messages' → 0 results. wc -l: reports/properties/page.tsx = 374 lines (functional analytics, fetches PropertyStats via supabase), ai-assistant/agents = 114 lines (AIAgent list), inbox/messages = 384 lines (functional chat UI). Only refs to inbox/messages are i18n labels in mn.ts:227 / en.ts:229 (translation dictionary, NOT nav). Sidebar 'Аналитик' submenu (lines 109-110) lists only 'Тойм' and 'Лийд шинжилгээ', never properties analytics.
- **Нөлөө:** Боловсруулсан үл хөдлөхийн аналитик, AI агентын удирдлага, мессежийн дэлгэрэнгүй хуудсыг хэрэглэгч огт олж чадахгүй, зөвхөн URL гараар бичиж хүрнэ. Хийсэн ажил ашиггүй, IA дутуу.
- **Зөвлөмж:** reports/properties-г Sidebar 'Аналитик' submenu-д 'Үл хөдлөх шинжилгээ' нэрээр нэмэх. ai-assistant/agents-г AI ASSISTANT хэсэгт холбох эсвэл устгах шийдвэр гаргах. inbox/messages-ийг /dashboard/inbox-аас холбох эсвэл нэгтгэх.
- **Verifier тэмдэглэл:** Баталгаажсан. Гурван хуудас бүгд оршин, функциональ (374/114/384 мөр). src/components доторх grep 0 inbound nav холбоос. inbox/messages-ийн цорын ганц ишлэл нь i18n орчуулгын толь (mn.ts:227, en.ts:229) бөгөөд нав биш. high severity зөв: ашиглагдаагүй ажил + IA цоорхой.

#### ux-ia-nav.3 — 🟠 ӨНДӨР MobileNav-д RBAC шалгалт огт байхгүй бөгөөд цэсийн жагсаалт Sidebar-аас зөрүүтэй

`mobilenav-no-rbac-diverges-sidebar`

- **Файл:** `src/components/dashboard/MobileNav.tsx`, `src/components/dashboard/Sidebar.tsx`
- **Баримт (evidence):** MobileNav.tsx has no useAuth/canAccessModule import; primaryNavItems (lines 21-25) and secondaryNavItems (lines 27-34) are static arrays with no module field and no filtering. Sidebar.tsx:204 filters every item via checkModuleAccess. So a 'viewer' role (rbac.ts:142 modules ['dashboard','reports']) on mobile still sees/navigates Лийд, Үзлэг, Гэрээ, Маркетинг, AI Тохиргоо, Тохиргоо. Mobile set also omits Customers, Finance, Procurement, Surveys, AI Assistant, Inbox present in sidebar.
- **Нөлөө:** Гар утсан дээр хязгаарлагдмал эрхтэй хэрэглэгч зөвшөөрөлгүй модулиудын цэс хардаг (backend хаах ч UI зөрчил, RBAC зорилго эвдэрнэ). Desktop ба mobile навигацийн багц өөр тул туршлага жигд бус.
- **Зөвлөмж:** MobileNav-д useAuth + checkModuleAccess нэвтрүүлж item бүрт module талбар нэмж шүүх. Sidebar-той нэг эх сурвалжаас (sections export) цэс үүсгэх.
- **Verifier тэмдэглэл:** Баталгаажсан. MobileNav.tsx бүхэлдээ useAuth/RBAC import-гүй, статик массив (21-34), шүүлтгүй. Sidebar.tsx:204 checkModuleAccess-ээр шүүдэг нь зөрүүг батална. high severity зохистой: navigation-level RBAC зөрчил + жагсаалтын зөрүү. (Тэмдэглэл: backend route хамгаалалт байж магадгүй тул өгөгдөл алдагдахгүй ч UI illusion of access үүснэ.)

#### ux-ia-nav.4 — 🟡 ДУНД Header гарчгийн логик устгагдсан /orders, /products, /subscription замуудыг шалгаж, inbox-д буруу 'Идэвхтэй Сагс' гарчиг харуулна

`header-title-switch-stale-routes`

- **Файл:** `src/components/dashboard/Header.tsx`
- **Баримт (evidence):** getHeaderTitle() in Header.tsx: line 50 path.includes('/orders') → 'Захиалга', line 51 '/products' → 'Бүтээгдэхүүн', line 62 '/subscription' → 'Төлбөр & Эрх' — all 3 routes removed (ls dashboard/orders/products → GONE). Line 55: path.includes('/inbox') → title 'Идэвхтэй Сагс' (Active Cart), an e-commerce term wrong for the FB/IG DM inbox.
- **Нөлөө:** Inbox хуудсанд орвол гарчиг 'Идэвхтэй Сагс' гэж буруу харагдаж, апп үл хөдлөхийн CRM мөн гэдэгт зөрчилдөнө. Орхигдсон /orders, /products, /subscription шалгалтууд нь ижил нэртэй зам ирээдүйд нэмэгдвэл буруу гарчиг өгөх dead code.
- **Зөвлөмж:** Line 55-ийн '/inbox' гарчгийг 'Мессеж' эсвэл 'Чат' болгох (Sidebar дотор аль хэдийн 'Мессеж' гэдэг). Line 50, 51, 62 дахь устгагдсан салбаруудыг устгах.
- **Verifier тэмдэглэл:** Баталгаажсан. Header.tsx:50/51/55/62 яг ишлэлчлэн таарч байна. /inbox → 'Идэвхтэй Сагс' нь Sidebar.tsx:133 дахь 'Мессеж' нэртэй зөрчилдөж байгаа нь бодит UX зөрчил. medium severity зохистой: гол гэмтэл биш ч харагдах буруу шошго.

#### ux-ia-nav.5 — 🟡 ДУНД useRealtimeNotifications мэдэгдэл устгагдсан orders хүснэгт сонсож, 'Харах' товч устгагдсан /dashboard/orders руу чиглүүлнэ

`realtime-toast-routes-to-deleted-orders`

- **Файл:** `src/hooks/useRealtimeNotifications.ts`, `src/app/dashboard/layout.tsx`
- **Баримт (evidence):** useRealtimeNotifications.ts line 22-27 subscribes to postgres_changes INSERT on table 'orders'; line 29 toast.success '🎉 Шинэ захиалга!' reads newOrder.total_amount; line 33 action 'Харах' calls router.push('/dashboard/orders'). /dashboard/orders confirmed removed (ls → No such file). Hook mounted globally in dashboard/layout.tsx:14 useRealtimeNotifications().
- **Нөлөө:** Хэрэв orders хүснэгт хэсэгчлэн үлдсэн бол хэрэглэгч e-commerce захиалгын toast хүлээн авч 'Харах' дарвал 404 хуудас руу орно. Шинэ үл хөдлөхийн платформд хамааралгүй legacy код layout-д амьд ажиллаж байна.
- **Зөвлөмж:** useRealtimeNotifications-аас orders subscription блокийг (line 21-41) бүрэн устгах. Хэрэгтэй бол шинэ лийд/гэрээ/үзлэгийн realtime мэдэгдлээр солих.
- **Verifier тэмдэглэл:** Баталгаажсан. useRealtimeNotifications.ts:22-41 orders таблиц сонсож, :33 router.push('/dashboard/orders') хийдэг нь устгагдсан зам. layout.tsx:14-д хук дуудагдаж байна. medium severity зөв: orders таблиц байгаа эсэх тодорхойгүй (CLAUDE.md устсан гэдэг) тул эрсдэл нөхцөлт боловч 'Харах' 404 руу заана.

#### ux-ia-nav.6 — 🟡 ДУНД Sidebar 'Үйлчилгээ' цэс буруу 'contracts' модулиар хамгаалагдсан тул зориулалтын 'customer-service' RBAC модуль амьдрахгүй болсон

`customer-service-wrong-module-gate`

- **Файл:** `src/components/dashboard/Sidebar.tsx`, `src/lib/rbac.ts`
- **Баримт (evidence):** Sidebar.tsx:76 { name: 'Үйлчилгээ', href: '/dashboard/customer-service', module: 'contracts' }. rbac.ts:42 ALL_MODULES includes dedicated 'customer-service'. finance_manager (rbac.ts:121-124 modules) HAS 'contracts' but NOT 'customer-service'; accountant (rbac.ts:131-134) same → both see/click 'Үйлчилгээ' despite lacking the intended module. sales_manager (line 102) HAS both. The 'customer-service' module never controls its own nav item; granting it without 'contracts' hides the link.
- **Нөлөө:** RBAC зөвшөөрлийн загвар эвдрэв: санхүүгийн менежер/нягтлан гэрээний эрхээр харилцагчийн үйлчилгээний цэсийг буруугаар хардаг. Админ панелаас 'customer-service' эрх өгсөн ч цэсэнд нөлөөлөхгүй.
- **Зөвлөмж:** Sidebar.tsx:76 дахь module-ийг 'contracts'-аас 'customer-service' болгож засах. Шаардлагатай рольд (sales_manager аль хэдийн байна) customer-service эрхийг баталгаажуулах.
- **Verifier тэмдэглэл:** Баталгаажсан. Sidebar.tsx:76 module:'contracts' гэж байгаа боловч rbac.ts:42-д тусдаа 'customer-service' модуль тодорхойлогдсон. finance_manager(121-124)/accountant(131-134) contracts-тай, customer-service-гүй тул цэс буруу харагдана. medium severity зохистой: backend хамгаалалт тусдаа байж болох ч nav RBAC зорилго эвдэрсэн.

#### ux-ia-nav.7 — 🟡 ДУНД Sidebar идэвхтэй төлөв нь яг таарах шалгалттай тул [id] дэлгэрэнгүй/засах замуудад эх цэс тодрохгүй

`sidebar-active-state-dynamic-routes`

- **Файл:** `src/components/dashboard/Sidebar.tsx`, `src/components/dashboard/MobileNav.tsx`
- **Баримт (evidence):** Sidebar.tsx:172 isActive(href) = pathname === href (exact). isParentActive line 173-176 only checks self-href OR exact-match children. 'Үл хөдлөх' children (lines 62-63) static ['/dashboard/properties','/dashboard/properties/new']. On /dashboard/properties/[id] or /[id]/edit neither parent href nor child matches exactly → no highlight. Same for /dashboard/contracts/generate (reached from contracts list), /dashboard/surveys/[id]. By contrast MobileNav.tsx:41 uses pathname.startsWith(href) — divergent behavior.
- **Нөлөө:** Үл хөдлөхийн дэлгэрэнгүй/засах, гэрээ үүсгэгч зэрэг гүн хуудсанд хэрэглэгч sidebar-аас хаана байгаагаа харж чадахгүй, чиг баримжаа алдагдана. Desktop (exact) ба mobile (startsWith) зөрүүтэй.
- **Зөвлөмж:** isParentActive дотор pathname.startsWith(item.href) шалгалт нэмэх (зөвхөн /dashboard-аас бусдад, MobileNav.tsx:41-тэй адил), эсвэл child замуудыг prefix-ээр тааруулах.
- **Verifier тэмдэглэл:** Баталгаажсан. Sidebar.tsx:172 exact ===, :173-176 зөвхөн exact child шалгана. MobileNav.tsx:41 startsWith ашигладаг нь зөрүүг батална. Анхаарах: finance/projects нь child биш бие даасан item тул өөрийн href-ээр exact таарна; харин properties/[id], contracts/generate зэрэг гүн зам үнэхээр тодрохгүй. medium severity зохистой polish/orientation асуудал.

#### ux-ia-nav.8 — 🟡 ДУНД Marketing hub-ийн sidebar RBAC шалгалтгүй бөгөөд 3 маркетингийн хуудас үндсэн дашбордоос хүрэхгүй

`marketing-hub-no-rbac`

- **Файл:** `src/app/marketing/layout.tsx`, `src/components/dashboard/Sidebar.tsx`
- **Баримт (evidence):** marketing/layout.tsx menuItems (lines 35-45) renders all 9 marketing pages with no role/module check; MarketingSidebar (line 52-55) uses useAuth only for { shop, signOut }, no canAccessModule. Any authenticated user on /marketing sees all 9. Separately dashboard Sidebar 'Маркетинг' children (lines 98-103) list only ROI/campaigns/ads/calendar/social/sources — /marketing/analytics (line 40), /marketing/messaging (line 42), /marketing/brand (line 44) reachable only inside the hub, never from main sidebar.
- **Нөлөө:** Маркетингийн эрхгүй роль (ж: sales_manager-д marketing-roi байхгүй, rbac.ts:99-103) /marketing руу шилжвэл бүх маркетингийн хэрэгслийг хардаг. Мөн Вэб аналитик, Email & SMS, Брэнд мэдрэмж хуудсыг үндсэн навигациас олдохгүй.
- **Зөвлөмж:** MarketingSidebar-т RBAC шалгалт нэмэх (хамгийн багадаа marketing-roi эрхээр). Дашбордын Sidebar 'Маркетинг' submenu-д дутуу 3 хуудсыг нэмэх эсвэл IA-г hub-д төвлөрүүлэх шийдвэр гаргах.
- **Verifier тэмдэглэл:** Баталгаажсан. marketing/layout.tsx:35-45 9 хуудас шүүлтгүй; MarketingSidebar :55 useAuth-аас зөвхөн shop/signOut авна, RBAC дуудлага алга. Dashboard Sidebar:98-103 submenu-д analytics/messaging/brand байхгүй. sales_manager-д marketing-roi rbac.ts:99-103-д үнэхээр байхгүй. medium severity зохистой: navigation-level илчлэлт + нуугдсан хуудас.

#### ux-ia-nav.9 — 🔵 БАГА PageHeader-ийн breadcrumbs боломж хаана ч ашиглагдаагүй dead feature, гүн хуудсуудад чиг баримжаа дутна

`breadcrumbs-dead-feature`

- **Файл:** `src/components/dashboard/PageHeader.tsx`, `src/app/dashboard/contracts/generate/page.tsx`
- **Баримт (evidence):** PageHeader.tsx supports breadcrumbs prop (line 15) with full render logic (lines 37-52), but grep 'breadcrumbs' across src/ returns only PageHeader.tsx itself (0 consumers in src/app). PageHeader used in 12 of 29 dashboard page.tsx files. contracts/generate/page.tsx:68 plain <h1>'Гэрээ үүсгэгч', no PageHeader, no breadcrumb; grep router.back/ArrowLeft/Буцах/PageHeader in that file → 0. Reached only via Button href on contracts/page.tsx:182.
- **Нөлөө:** Гэрээ үүсгэгч зэрэг гүн хуудсанд хэрэглэгч буцах товчгүй, breadcrumb-гүй тул зөвхөн sidebar-аар гарна. Бэлэн breadcrumb дэд бүтэц ашиглагдаагүй, навигацийн чиг баримжаа сул.
- **Зөвлөмж:** contracts/generate болон бусад гүн хуудсуудад PageHeader-ийг breadcrumbs (ж: Гэрээ / Үүсгэх) ба/эсвэл буцах товчтой нэвтрүүлж жигдлэх. Ашиглахгүй бол breadcrumbs prop-ыг баримтжуулах.
- **Verifier тэмдэглэл:** Баталгаажсан. PageHeader.tsx:15,37-52 breadcrumbs логиктой ч src/app-д 0 хэрэглээ (grep зөвхөн PageHeader.tsx өөрөө). PageHeader 12/29 хуудсанд. contracts/generate/page.tsx:68 plain h1, back affordance grep 0. low severity зохистой: polish/affordance, функциональ гэмтэл биш.

#### ux-ia-nav.10 — 🔵 БАГА 'Тайлан'/'Аналитик' цэсүүд хоёр өөр хэсэгт давхардаж бүгд /dashboard/reports руу зааж, тайлангийн хуудас лийд тайлантай адил агуулгатай

`duplicate-reports-entry-confusing-ia`

- **Файл:** `src/components/dashboard/Sidebar.tsx`, `src/app/dashboard/reports/page.tsx`
- **Баримт (evidence):** Sidebar.tsx:107 'Аналитик' (/dashboard/reports) in MARKETING section, AND Sidebar.tsx:123 'Тайлан' (/dashboard/reports, same href) in AI ASSISTANT section — same destination, two labels, two sections. reports/page.tsx:6 imports LeadsReport from './leads/page' and :35 renders <LeadsReport />, so the 'Тойм' child (/dashboard/reports, Sidebar:109) and 'Лийд шинжилгээ' child (/dashboard/reports/leads, Sidebar:110) show the same content.
- **Нөлөө:** Ижил хуудас руу хоёр өөр нэр/хэсгээр заасан нь IA-г төөрөгдүүлж, AI ASSISTANT хэсэгт тайлан байх нь логикгүй. 'Тойм' нь лийдийн тайлантай ялгаагүй тул хэрэглэгч ялгаа эрэхдээ цаг алдана.
- **Зөвлөмж:** AI ASSISTANT хэсгийн давхар 'Тайлан' (Sidebar:122-124) бичлэгийг устгах. reports/page.tsx-г жинхэнэ нэгдсэн тойм (лийд + үл хөдлөх + санхүү) болгох эсвэл 'Тойм' хаягийг тодорхой ялгах.
- **Verifier тэмдэглэл:** Баталгаажсан. Sidebar.tsx:107 (MARKETING 'Аналитик') ба :123 (AI ASSISTANT 'Тайлан') хоёулаа /dashboard/reports руу зааж байна. reports/page.tsx:6 import LeadsReport, :35 render → 'Тойм' ба 'Лийд шинжилгээ' ижил агуулга. low severity зохистой: IA/labeling эмх замбараагүй байдал, функциональ гэмтэл биш.


### Визуал тууштай байдал ба дизайн систем

_Хэмжүүр: `ux-visual-ds`_

#### ux-visual-ds.1 — 🟠 ӨНДӨР customer-service ба inbox/messages хуудас бүхэлдээ хатуу кодлосон хар загвартай, дизайн систем token-ийг бүрэн зөрчиж байна

`hardcoded-dark-pages-customer-service-inbox`

- **Файл:** `src/app/dashboard/customer-service/page.tsx:167`, `src/app/dashboard/customer-service/page.tsx:176`, `src/app/dashboard/customer-service/page.tsx:260`, `src/app/dashboard/customer-service/page.tsx:269`, `src/app/dashboard/customer-service/page.tsx:447`, `src/app/dashboard/inbox/messages/page.tsx:198`, `src/app/dashboard/inbox/messages/page.tsx:210`, `src/app/dashboard/inbox/messages/page.tsx:233`, `src/app/dashboard/inbox/messages/page.tsx:309`
- **Баримт (evidence):** customer-service/page.tsx: root `bg-[#0a0a0f]` (167,176), filter panel `bg-[#11111a] ... border border-white/[0.06]` (260), input `bg-surface/[0.04] ... text-white/80` (269), KPI card `bg-[#11111a] border border-white/[0.06]` + `text-white/40`, `text-white/90` (447-453). inbox/messages/page.tsx: root `bg-[#0a0a0f] ... border border-white/[0.06]` (198), search `bg-surface/[0.05] ... text-white/80` (210), bubble `bg-surface/[0.08] text-white/80` (309). grep counts 46 hardcoded `#0a0a0f`/`#11111a`/`text-white` occurrences in customer-service and 21 in inbox/messages, with ZERO `dark:` variants or `data-theme` references in either file. Light theme default is `--bg: #FAFAF7` (globals.css:111).
- **Нөлөө:** Энэ хоёр хуудас default цайвар горимд орчны бусад хуудаснаас огт өөр — бараг хар самбар болж харагдана. Хатуу `#0a0a0f`/`#11111a`/`white/XX` нь `[data-theme]`-д хариу үзүүлэхгүй тул theme солиход ч өөрчлөгдөхгүй. `bg-surface/[0.04]` гэх мэт surface token-ийг хар дэвсгэр төсөөлж opacity-той хольсон нь light дэвсгэр дээр бараг үл үзэгдэх болно.
- **Зөвлөмж:** Хоёр хуудсыг бусад dashboard хуудсуудтай адил token руу шилжүүлэх: `bg-[#0a0a0f]`→`bg-background`, `bg-[#11111a]`→`bg-surface`, `border-white/[0.06]`→`border-border`, `text-white/90`→`text-foreground`, `text-white/40`→`text-muted-foreground`, `bg-surface/[0.04]`→`bg-surface-2`. Ингэснээр light/dark хоёуланд зөв ажиллана.
- **Verifier тэмдэглэл:** Бүх citation бодит. grep-ээр 46+21 хатуу хар хэрэглээ, `dark:`/`data-theme` 0 удаа — theme-д огт хариу үзүүлэхгүй нь нотлогдсон. high зэрэглэл зөв: бүхэл хуудас брэндийн cream/ink загвараас гажиж, нэг суурь component ч token хэрэглээгүй.

#### ux-visual-ds.2 — 🟡 ДУНД Бүх график хатуу кодлосон, өөр өөр hex өнгөтэй; --chart-* token огт ашиглагдаагүй

`charts-hardcoded-hex-ignore-chart-tokens`

- **Файл:** `src/components/dashboard/SalesChart.tsx:75`, `src/components/dashboard/SalesChart.tsx:92`, `src/components/dashboard/SalesChart.tsx:94`, `src/components/dashboard/SalesChart.tsx:116`, `src/app/dashboard/ai-assistant/page.tsx:215`, `src/app/dashboard/ai-assistant/page.tsx:219`, `src/app/dashboard/ai-assistant/page.tsx:227`, `src/app/globals.css:145`
- **Баримт (evidence):** globals.css:145-149 defines --chart-1..--chart-5; the only references to `var(--chart` are the @theme mappings at globals.css:76-80 (`--color-chart-N: var(--chart-N)`) — ZERO actual recharts consumers. SalesChart.tsx hardcodes gold `#D4AF37` for line stroke/dot/bar fill (92,94,116) and grays `#e5e7eb`/`#6b7280` for grid/axis (75-86,100-111). ai-assistant/page.tsx hardcodes `#10B981` green line (219), `#7C3AED` violet / `#10B981` bar fill (227), `#E5E7EB` grid (215), `#6B7280` ticks (216-217). `--brand` = oklch(0.62 0.13 38) terracotta, so #D4AF37 is off-brand.
- **Нөлөө:** Графикуудын брэнд өнгө хоорондоо зөрчилдөж (алт vs ногоон vs ягаан), аль нь ч terracotta брэндтэй таарахгүй. Хатуу `#e5e7eb`/`#6b7280` саарал нь dark mode-д тохирохгүй (хар дэвсгэр дээр grid бараг үл үзэгдэнэ). Систем дэх --chart-* token ашиггүй хэвээр.
- **Зөвлөмж:** Графикуудыг `var(--chart-1)`..`var(--chart-5)` болон `var(--border)`/`var(--muted)` руу шилжүүлэх. SalesChart-ийн `#D4AF37` алтыг `var(--chart-1)` (terracotta), ai-assistant-ийн hex-үүдийг мөн token руу. Энэ нь dark mode-д автоматаар тохирно.
- **Verifier тэмдэглэл:** Бүх hex citation бодит (D4AF37, 10B981, 7C3AED, e5e7eb/6b7280). `var(--chart` нь зөвхөн globals.css дотор (token тодорхойлолт + @theme mapping), нэг ч recharts consumer алга. medium зэрэглэл зохистой — visual зөрчил боловч data-loss/security биш.

#### ux-visual-ds.3 — 🟡 ДУНД Modal/Dialog primitive-ийг нэг ч dashboard хуудас ашигладаггүй; бүх modal гар хийцтэй, overlay өнгө зөрүүтэй

`modal-dialog-primitives-unused`

- **Файл:** `src/app/dashboard/customers/page.tsx:796`, `src/app/dashboard/finance/page.tsx:256`, `src/app/dashboard/procurement/page.tsx:314`, `src/app/dashboard/finance/projects/page.tsx:171`, `src/app/dashboard/contracts/page.tsx:443`, `src/app/dashboard/surveys/[id]/page.tsx:362`, `src/app/dashboard/customer-service/page.tsx:485`, `src/components/ui/Modal.tsx:1`, `src/components/ui/Dialog.tsx:1`
- **Баримт (evidence):** Both primitives exist (Modal.tsx, Dialog.tsx) but grep for their imports across src/ returns 0 each. Hand-rolled modals: customers (4x `fixed inset-0 bg-foreground/40 backdrop-blur-sm ... z-50` at 796,941,1059,1170), finance:256, procurement:314, finance/projects:171 all use `bg-foreground/40` (on-token). surveys/[id]:362 uses raw `bg-black/50` (off-token). customer-service modal at 482-485 uses overlay `bg-black/60` and panel `bg-[#11111a] border border-white/[0.08] rounded-2xl` (hardcoded dark). contracts:443 slide-over DOES have overlay `bg-foreground/40 backdrop-blur-sm` (444).
- **Нөлөө:** Modal бүр өөр overlay өнгө, radius, focus-trap, Esc хаалт, scroll-lock-той (эсвэл огт байхгүй) — хэрэглэгчийн туршлага хуудас бүрт өөр. Бэлэн Modal/Dialog primitive ашиггүй, давхардсан код. surveys-ийн `bg-black/50` болон customer-service-ийн хатуу хар panel нь токеноос гажсан.
- **Зөвлөмж:** Гар хийцийн modal-уудыг `@/components/ui/Modal` (эсвэл Dialog) руу нэгтгэх. Хамгийн багадаа overlay өнгийг нэг token-д (`bg-foreground/40 backdrop-blur-sm`) болгож stand-art болгох; surveys/[id]-ийн `bg-black/50`, customer-service-ийн хар panel-ийг засах.
- **Verifier тэмдэглэл:** 0 importer + 7 гар хийцийн modal нотлогдсон, overlay зөрүү (foreground/40 vs black/50 vs black/60) бодит. ГЭХДЭЭ нэг алдаа засав: auditor 'contracts:443 slide-over has no overlay tint at all' гэсэн нь буруу — 444-р мөрөнд `bg-foreground/40 backdrop-blur-sm` overlay БАЙНА. customer-service modal citation-ийг 485 рүү тодотгов. Үндсэн дүгнэлт хүчинтэй тул confirmed, severity medium хэвээр.

#### ux-visual-ds.4 — 🟡 ДУНД ImportTab gradient/shadow/violet хольцоор бүрхэгдсэн, status токенийг raw өнгөтэй холисон

`importtab-gradient-soup-offbrand`

- **Файл:** `src/app/dashboard/ai-settings/components/ImportTab.tsx:40`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:201`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:215`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:248`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:263`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:330`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:362`, `src/app/dashboard/ai-settings/components/ImportTab.tsx:402`
- **Баримт (evidence):** Icon card gradients (40-96): `from-blue-500 to-cyan-500`, `from-emerald-500 to-green-500`, `from-orange-500 to-amber-500`, `from-pink-500 to-rose-500`, `from-gray-500 to-slate-500`, plus `from-brand to-purple-500` (48). Green CTA `from-emerald-500 to-green-500` (248). Primary CTA `from-violet-600 to-purple-600 ... shadow-violet-200 hover:shadow-violet-300` (330). Selected card `shadow-violet-100` (215). Drop-zone `border-violet-400` (263) / `hover:border-gray-400` (266). Result block raw `text-emerald-800`/`text-red-800` (362) next to status tokens. Info box `from-slate-50 to-gray-50` (402). Step card `rounded-2xl` (201) vs system Card `rounded-xl`.
- **Нөлөө:** AI-settings/import хэсэг дизайн системийн terracotta+status загвартай нийцэхгүй солонгон gradient-тай. Violet/purple/green CTA нь брэнд биш. `text-emerald-800`/`text-red-800` нь dark mode-д тохирохгүй гүн өнгө. `rounded-2xl` нь Card primitive-ийн `rounded-xl`-тэй зөрчилдөж radius тогтворгүй болгож байна.
- **Зөвлөмж:** Gradient icon өнгүүдийг brand/status token руу хүргэх эсвэл нэг neutral дүрсэнд оруулах. CTA-г `Button variant="primary"` болгох. `text-emerald-800`/`text-red-800`-ийг `text-status-success`/`text-status-danger` болгох. `rounded-2xl`→`rounded-xl`. `shadow-violet-*`-ийг систем shadow scale-аар солих.
- **Verifier тэмдэглэл:** Бүх citation бодит: rainbow gradients (40-96), green CTA (248), violet CTA+shadow (330), shadow-violet-100 (215), drop-zone border-violet-400/gray-400 (263/266), text-emerald-800/red-800 (362), slate/gray info box (402), rounded-2xl (201). Файлын олон raw-palette хэрэглээ нь дизайн системд хамгийн ноцтой нэг газар нь мөн. medium зэрэглэл зохистой.

#### ux-visual-ds.5 — 🟡 ДУНД Хуудаснууд Button primitive-ийг үл бүрэн хэрэгсэн raw <button> өргөн ашигладаг

`ad-hoc-buttons-vs-button-primitive`

- **Файл:** `src/app/dashboard/ai-settings/page.tsx:1`, `src/app/dashboard/customers/page.tsx:1`, `src/app/dashboard/customer-service/page.tsx:1`, `src/app/dashboard/surveys/page.tsx:1`, `src/app/dashboard/inbox/messages/page.tsx:1`, `src/components/ui/Button.tsx:1`
- **Баримт (evidence):** Button.tsx exists with CVA variants (primary/secondary/tertiary/danger/ghost/outline), sizes, isLoading + aria-busy spinner (lines 7-62). Raw `<button` counts: ai-settings/page.tsx=9, customers/page.tsx=8, customer-service/page.tsx=6, surveys/page.tsx=5, inbox/messages/page.tsx=5. Button-primitive imports: ai-settings=1, customers=1, surveys=1 (partial adoption), but customer-service=0 and inbox/messages=0 (never imported). customer-service buttons also hardcode dark styling.
- **Нөлөө:** Товчны өндөр, radius, hover, disabled, loading spinner, focus-ring хуудас бүрт өөр болж UX тогтворгүй. Brand primary товч заримдаа bg-brand, заримдаа violet/green gradient, заримдаа хатуу хар. Засвар хийхэд олон газар давтан зэхэх шаардлагатай.
- **Зөвлөмж:** Тогтмол үйлдлийн товчнуудыг `@/components/ui/Button` руу шилжүүлэх (ялангуяа primary/danger CTA болон isLoading шаардлагатай газруудад). Энэ нь focus-ring, aria-busy, хэмжээ/radius-ийг автоматаар нэгтгэнэ.
- **Verifier тэмдэглэл:** Raw button тоо 9/8/6/5/5 нь auditor-ийн дугаартай яг таарсан. Button.tsx CVA primitive байгаа нь нотлогдсон. Нэг нюанс: ai-settings/customers/surveys нь Button-ийг нэг удаа import хийсэн (хэсэгчилсэн ашиглалт), customer-service/inbox огт ашиглаагүй — auditor 'үл хэрэгсэн' гэснийг 'үл бүрэн хэрэгсэн' болгож title-д тодотгов. Үндсэн санаа хүчинтэй, medium зохистой.

#### ux-visual-ds.6 — 🟡 ДУНД Violet/purple/indigo нь brand биш атлаа албан бус хоёр дахь өнгө болж primitive-үүдэд хүртэл тархсан

`violet-purple-unofficial-accent`

- **Файл:** `src/components/dashboard/ConversationItem.tsx:51`, `src/components/ui/DataTable.tsx:79`, `src/app/dashboard/ai-settings/page.tsx:358`, `src/app/dashboard/leads/pipeline/page.tsx:29`, `src/app/globals.css:125`
- **Баримт (evidence):** Brand is terracotta (`--brand: oklch(0.62 0.13 38)`, globals.css:125). DataTable.tsx:79 bulk-action label `text-violet-900` (inside a core primitive). dashboard/ConversationItem.tsx:51 active title `text-violet-900`. grep confirms `text-violet-900` exists ONLY in these two files. ai-settings/page.tsx:358 banner `from-violet-50 to-purple-50 border-violet-100`. leads/pipeline:29 `border-indigo-200`. None reference --brand/--brand-soft.
- **Нөлөө:** Идэвхтэй/онцлох төлөвүүд заримдаа terracotta, заримдаа violet/indigo болж брэнд таних чанар сулрана. Хамгийн муу нь DataTable, ConversationItem зэрэг primitive-д стрэй violet орсон тул бүх хүснэгт/чат жагсаалтад тархаж байна.
- **Зөвлөмж:** Бүх violet/purple/indigo accent-ыг `text-brand-strong`/`bg-brand-soft`/`border-brand` болгож brand руу нэгтгэх. Ялангуяа DataTable.tsx:79 ба ConversationItem.tsx:51-ийн `text-violet-900`-ийг засах (primitive тул нөлөө өргөн).
- **Verifier тэмдэглэл:** Зөрчил бодит боловч НЭГ зам алдаатай: auditor `src/components/ui/ConversationItem.tsx:51` гэсэн нь оршдоггүй — бодит файл нь `src/components/dashboard/ConversationItem.tsx:51` (агуулга нь зөв: `text-violet-900`). files жагсаалтыг зөв зам руу засав. DataTable.tsx:79, ai-settings:358, pipeline:29 бүгд яг таарсан. Зам зассан тул confirmed, medium хэвээр.

#### ux-visual-ds.7 — 🔵 БАГА border-gray-50 / border-*-200 / border-*-400 зэрэг off-token border хүснэгт, pipeline, FloorPlan-д тархсан

`border-gray-50-offtoken-borders`

- **Файл:** `src/app/dashboard/reports/properties/page.tsx:298`, `src/app/dashboard/reports/properties/page.tsx:340`, `src/components/dashboard/ConversationItem.tsx:23`, `src/app/dashboard/leads/pipeline/page.tsx:26`, `src/app/dashboard/leads/pipeline/page.tsx:28`, `src/app/dashboard/leads/pipeline/page.tsx:29`, `src/components/dashboard/FloorPlan.tsx:27`, `src/components/dashboard/FloorPlan.tsx:30`
- **Баримт (evidence):** reports/properties:298,340 table rows `border-b border-gray-50`. ConversationItem:23 `border-b border-gray-50`. leads/pipeline mixes status tokens with raw `border-yellow-200` (26), `border-orange-200` (28), `border-indigo-200` (29) inside otherwise tokenized stage configs. FloorPlan:27 `border-yellow-400`, :30 `border-orange-400` alongside status-token bg/text. `border-gray-50` is nearly invisible (almost white).
- **Нөлөө:** Border өнгө хуудас бүрт зөрж, gray-50 нь бараг үл үзэгдэх сул шугам үүсгэнэ; dark mode-д буруу гэрэлтэнэ. Pipeline/FloorPlan дотор нэг config status-token, нөгөө нь raw болж тогтворгүй.
- **Зөвлөмж:** Бүх `border-gray-50`→`border-border`; pipeline/FloorPlan-ийн `border-yellow-200`/`border-orange-200`/`border-indigo-200`/`border-*-400`-ийг харгалзах `border-status-*/30` болгож тогтмолжуулах.
- **Verifier тэмдэглэл:** Бүх 8 citation бодит: reports/properties 298+340 border-gray-50, ConversationItem 23 border-gray-50, pipeline 26/28/29 yellow/orange/indigo-200, FloorPlan 27/30 yellow/orange-400. low зэрэглэл зохистой — polish-level, гэхдээ pipeline/FloorPlan дотор token/raw холилдсон нь тогтвортой байдалд нөлөөтэй.

#### ux-visual-ds.8 — 🔵 БАГА LoadingSkeleton primitive хуучин rounded-2xl + bg-card alias ашигладаг тул бодит Card-аас radius зөрнө

`loadingskeleton-legacy-radius-bgcard`

- **Файл:** `src/components/ui/LoadingSkeleton.tsx:14`, `src/components/ui/LoadingSkeleton.tsx:20`, `src/components/ui/LoadingSkeleton.tsx:83`, `src/components/ui/LoadingSkeleton.tsx:93`, `src/components/ui/Card.tsx:11`
- **Баримт (evidence):** Card primitive: `bg-surface border border-border` (11) + `rounded-xl` (23). LoadingSkeleton: StatsCardSkeleton `bg-card rounded-2xl border border-border` (14), icon `rounded-2xl` (20), DashboardSkeleton blocks `bg-card rounded-2xl` (83,93). globals.css:34 `--color-card: var(--surface)` confirms bg-card is a legacy alias for surface. So skeletons get rounded-2xl (larger) vs real Cards' rounded-xl.
- **Нөлөө:** Ачаалж байх үед skeleton-ийн булангийн радиус (rounded-2xl) бодит Card (rounded-xl)-аас өөр тул контент ачаалахад загвар үсэрхийлж харагдана. bg-card alias нь bg-surface-тэй ижил ч хуучин нэршил тул системд төөрөгдөл.
- **Зөвлөмж:** LoadingSkeleton-ийн `rounded-2xl`→`rounded-xl`, `bg-card`→`bg-surface` болгож Card primitive-тэй тааруулах.
- **Verifier тэмдэглэл:** LoadingSkeleton 14/20/83/93 бүгд `bg-card rounded-2xl` нотлогдсон. Card primitive rounded-xl + bg-surface (11,23), `--color-card: var(--surface)` (globals.css:34) нь alias болохыг батлав. low/medium хооронд — би low үлдээв (зөвхөн ачаалах төлвийн visual jump, бодит контентод нөлөөгүй). confirmed.

#### ux-visual-ds.9 — 🔵 БАГА MortgageCalculator emerald focus/border ашиглаж brand ring токенийг тойрсон

`mortgage-calc-emerald-focus-ring`

- **Файл:** `src/components/dashboard/MortgageCalculator.tsx:68`, `src/components/dashboard/MortgageCalculator.tsx:113`
- **Баримт (evidence):** Input focus `focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500` (68) — system ring token is `--color-ring: var(--brand)` terracotta (globals.css:47), and the Input primitive uses `focus-visible:ring-ring/50` (Input.tsx:12). Selected term button `border-emerald-600 bg-status-success-soft text-status-success` (113) mixes a raw emerald border with status tokens.
- **Нөлөө:** Энэ widget дотор focus-ring terracotta биш ногоон болж, Input primitive-ийн brand ring-тэй зөрчилдөнө. raw emerald нь dark mode ring өнгөтэй мөн зөрнө.
- **Зөвлөмж:** `focus:ring-emerald-500 focus:border-emerald-500`→`focus:ring-2 focus:ring-brand focus:border-brand` (эсвэл Input primitive ашиглах). `border-emerald-600`→`border-status-success`.
- **Verifier тэмдэглэл:** 68-р мөр `focus:ring-emerald-500 focus:border-emerald-500`, 113-р мөр `border-emerald-600 bg-status-success-soft text-status-success` яг таарсан. `--color-ring: var(--brand)` (globals.css:47) болон Input primitive ring-ring (Input.tsx:12) нь зөрүүг батлав. low зэрэглэл зохистой.


### Хүртээмж — Accessibility (WCAG 2.1 AA)

_Хэмжүүр: `ux-a11y`_

#### ux-a11y.1 — 🔴 КРИТИК Viewport томруулахыг хориглосон (userScalable: false)

`viewport-zoom-disabled`

- **Файл:** `src/app/layout.tsx:41-42`
- **Баримт (evidence):** src/app/layout.tsx lines 34-44: `export const viewport: Viewport = { ... width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover' }`. Lines 41 (`maximumScale: 1`) and 42 (`userScalable: false`) disable pinch-zoom/text resize app-wide.
- **Нөлөө:** Хараа сул хэрэглэгчид хуудсыг томруулж чадахгүй. WCAG 1.4.4 (Resize text up to 200%) болон 1.4.10 (Reflow)-ийг шууд зөрчиж, бүх mobile хэрэглэгчид нөлөөлнө. iOS Safari зэрэг зарим хөтөч үүнийг хүчээр унтраадаг ч стандартын зөрчил хэвээр.
- **Зөвлөмж:** viewport-оос `maximumScale: 1` болон `userScalable: false`-ийг бүрэн устгах. Зөвхөн `width: 'device-width', initialScale: 1, viewportFit: 'cover'`-ийг үлдээх.
- **Verifier тэмдэглэл:** src/app/layout.tsx:41-42 дээр `maximumScale: 1, userScalable: false` яг байна. Бүх апп-д үйлчилнэ. Severity critical зөв — энэ нь WCAG-ийн хамгийн тодорхой зөрчлийн нэг бөгөөд бүх mobile хэрэглэгчид нөлөөлнө. Файлын мөрийг 34-44-ээс яг 41-42 болгож тодотгов.

#### ux-a11y.2 — 🟠 ӨНДӨР Бүх dashboard форм label-ууд input-тай холбоосгүй (htmlFor/id байхгүй)

`form-labels-not-associated`

- **Файл:** `src/app/dashboard/leads/new/page.tsx:68-69`, `src/app/dashboard/properties/_components/PropertyForm.tsx:233-236`, `src/app/dashboard/customer-service/page.tsx:495-503`
- **Баримт (evidence):** `grep -rc htmlFor src/app/dashboard` returns 0 across all 13 files that contain `<label>`. leads/new:68 `<label className="block ...">Нэр</label>` directly above leads/new:69 `<Input name="customer_name" .../>` with no id/htmlFor and no aria-label. PropertyForm:233-236 same pattern (`<label>Нэр *</label>` + `<Input>`). customer-service:495-503 modal labels (`<label className="block text-white/50 ...">Гарчиг *</label>` + raw `<input>`).
- **Нөлөө:** Screen reader хэрэглэгч input дээр focus хийхэд талбарын нэр (Нэр, Утас, Үнэ гэх мэт) уншигдахгүй — зөвхөн 'edit text' гэж сонсогдоно. Бүх CRM форм (лийд, үл хөдлөх, гэрээ, харилцагч) бөглөхөд хүндрэлтэй. Мөн label дээр дарахад input focus авахгүй (клик талбай алдагдана).
- **Зөвлөмж:** Бүх label-input хосд давтагдашгүй `id`/`htmlFor` нэмэх, эсвэл label-ийг input-ийг ороосон болгох. Shared Input примитивийг ашиглаж label-ийг props-оор дамжуулдаг `Field` wrapper хийх нь хамгийн тогтвортой.
- **Verifier тэмдэглэл:** Бүх ишлэл бодит: grep нь dashboard-д 0 htmlFor буцаалаа, leads/new:68-69, PropertyForm:233-236, customer-service:495-503 бүгд label-input хослолыг id/htmlFor-гүй ашиглаж байна. Severity high зөв (critical биш — placeholder/required зэрэг хэсэгчилсэн контекст байгаа учир бүрэн ашиглах боломжгүй гэхээргүй). Файлын мөрийг бодит хослол руу тодотгов.

#### ux-a11y.3 — 🟠 ӨНДӨР Брэнд терракотта болон бүдэг текст AA contrast-д унаж байна

`brand-muted-contrast-fail`

- **Файл:** `src/app/globals.css:125`, `src/app/globals.css:122`, `src/app/dashboard/customers/page.tsx:1356`, `src/app/dashboard/customers/page.tsx:1372`, `src/app/dashboard/leads/page.tsx:404`, `src/app/dashboard/customers/page.tsx:712-724`
- **Баримт (evidence):** globals.css:125 `--brand: oklch(0.62 0.13 38)` computes to ~3.84:1 on white #FFFFFF (verified via oklch→sRGB→WCAG calc; even lower than the auditor's 4.17, both < 4.5 AA). globals.css:122 `--muted-2: #908D84` = ~3.32:1 on white, ~3.17:1 on --bg #FAFAF7. `text-brand hover:underline` used as actual link text at customers/page.tsx:1356 and :1372, and leads/page.tsx:404 (`text-sm text-brand hover:underline tabular-nums`). Table headers customers/page.tsx:712-724 use `text-muted-foreground/80` = ~3.6:1; `text-muted-foreground/70` (e.g. :777,:827) = ~2.96:1 — all below 4.5:1.
- **Нөлөө:** Терракотта линк болон бүдэг тусламжийн текст хараа сул хэрэглэгчдэд уншихад хэцүү. Олон жагсаалт хуудсанд (харилцагч, лийд) хэрэглэгддэг 'дэлгэрэнгүй харах' линкүүд болон хүснэгтийн толгойд нөлөөлнө.
- **Зөвлөмж:** Текст болон линкэнд `--brand` (~3.84:1)-ийн оронд `--brand-strong` oklch(0.50 0.15 38) (~6.43:1)-ийг ашиглах. `--muted-2`-ийг текст болгож хэрэглэхгүй, `text-muted-foreground/70` зэрэг opacity бууруулсан текстийг бүтэн `text-muted-foreground` (#6B6962 ~5.49:1) болгох.
- **Verifier тэмдэглэл:** Бие даан тооцоолоход --brand white дээр ~3.84:1 (auditor 4.17 гэснээс ч муу), --muted-2 ~3.32:1, muted-foreground/80 ~3.6:1, /70 ~2.96:1 — бүгд AA <4.5 унана. brand-strong ~6.43:1 болж засагдана. Линк ишлэл бодит (1356,1372,404). ЗАСВАР: auditor-ийн customers:1528 ишлэл линк биш, харин `<p className="text-brand">` (энгийн текст) тул жагсаалтаас хасч 1372-оор сольсон. Бусад нь баталгаажсан, severity high зөв.

#### ux-a11y.4 — 🟠 ӨНДӨР Гар хийсэн modal/drawer-ууд focus-trap, role=dialog, return-focus-гүй

`custom-modals-no-a11y`

- **Файл:** `src/app/dashboard/customer-service/page.tsx:482-487`, `src/app/dashboard/contracts/page.tsx:443-448`, `src/app/dashboard/customers/page.tsx:1059-1070`
- **Баримт (evidence):** `grep role="dialog"|aria-modal` returns 0 across customers, customer-service, contracts pages. `grep Escape|keydown|onKeyDown` returns 0 across all three. customer-service:482-487 `<div className="fixed inset-0 z-50 ..." onClick={onClose}>` + inner `<div onClick={e => e.stopPropagation()}>`. contracts:443-448 drawer same pattern (`fixed inset-0 z-50 flex justify-end` + onClick onClose + stopPropagation), no Escape. customers:1059-1070 Create modal is a plain `fixed inset-0` div with no role, no focus management, no backdrop-click-close. No focus moved in on open or restored on close.
- **Нөлөө:** Гар ажиллагаатай хэрэглэгч modal нээгдэхэд focus modal руу шилжихгүй, Tab нь арын хуудсаар тэнүүчилнэ, Esc-ээр хаагдахгүй, хаасны дараа focus буцахгүй. Screen reader modal нээгдсэнийг зарлахгүй (role=dialog алга). Шинэ хүсэлт бүртгэх, гэрээ/харилцагч засах гол урсгалуудыг гар/screen reader хэрэглэгчдэд ашиглахад хүндрэлтэй болгоно.
- **Зөвлөмж:** Эдгээр гар хийсэн modal-уудыг src/components/ui/Dialog.tsx (Radix DialogPrimitive — focus trap, Esc, return-focus, aria-modal-ийг автоматаар хангадаг) дээр шилжүүлэх. Хамгийн багадаа Esc handler, focus trap, role=dialog/aria-modal нэмэх.
- **Verifier тэмдэглэл:** grep-ээр role=dialog/aria-modal болон Escape handler гурван хуудсанд 0 байгааг баталлаа. customer-service:482-487 ба contracts:443-448 нь онцлог backdrop-onClick хэв маягтай. Customers modal-д backdrop-click-close ч байхгүй (гадна div-д onClick алга) тул бүр муу. Файлын мөрийг customers-д 1063-1070-аас 1059-1070 болгож гадна wrapper-ийг хамруулав. Severity high зөв.

#### ux-a11y.5 — 🟠 ӨНДӨР customer-service хуудас off-token бараан өнгөөр бүтсэн — гэрэлт сэдэвт уншигдахгүй

`customer-service-dark-on-light`

- **Файл:** `src/app/dashboard/customer-service/page.tsx:167`, `src/app/dashboard/customer-service/page.tsx:176`, `src/app/dashboard/customer-service/page.tsx:185`, `src/app/dashboard/customer-service/page.tsx:485-565`
- **Баримт (evidence):** Hardcoded dark canvas `bg-[#0a0a0f]` at lines 167 and 176; `text-white/40` subtitle at line 185; modal `bg-[#11111a]` at line 485; inputs `text-white/80`/`text-white/90` with `placeholder:text-white/30` at lines 501,512,544,553,565. Rest of app chrome is the light Editorial theme. `text-white/30` placeholder on dark fails AA.
- **Нөлөө:** text-white/30 placeholder болон text-white/40 тайлбар текст AA босгод хүрэхгүй. Token бус хатуу өнгө ашигласан тул light/dark theme сэлгэхэд эвдэрнэ, мөн focus ring brand өнгөтэй light токенд тулгуурладаг тул бараан фон дээр харагдахгүй. Үйлчилгээний хяналтын бүх форм нөлөөлнө.
- **Зөвлөмж:** Хуудсыг editorial токенууд (bg-surface, text-foreground, text-muted-foreground, border-border)-руу шилжүүлж бусад dashboard хуудастай нэгтгэх. Хэрэв бараан санаатай бол status токенуудын dark variant-ийг ашиглах.
- **Verifier тэмдэглэл:** Бүх ишлэл бодит: bg-[#0a0a0f] (167,176), text-white/40 (185), bg-[#11111a] modal (485), placeholder:text-white/30 (501,565). Бусад dashboard цайвар editorial theme-тэй (layout data-theme=light). Off-token + AA унасан placeholder баталгаажсан. Severity high зөв (нэг хуудсанд хязгаарлагдсан тул critical биш).

#### ux-a11y.6 — 🟡 ДУНД Icon-only товчнууд (X хаах, устгах) accessible name-гүй

`icon-only-buttons-no-name`

- **Файл:** `src/app/dashboard/customers/page.tsx:800-802`, `src/app/dashboard/customers/page.tsx:945-947`, `src/app/dashboard/customers/page.tsx:1063-1071`, `src/app/dashboard/contracts/page.tsx:465-470`
- **Баримт (evidence):** customers:800 `<button onClick={resetHubspotSync} className="p-2 ..."><X className="w-5 h-5 .../></button>` — no aria-label/sr-only/title. Same for customers:945 (resetImport) and customers:1063 (close create modal). contracts:465-470 X close button has no aria-label and no title (note: the adjacent Trash2 delete at contracts:461 DOES have title="Устгах"). `grep aria-label src/app/dashboard src/components/dashboard` returns only 4 matches (ShopSwitcher x2, Header x2). lucide icons render as `<svg>` with no accessible name. Editorial Dialog.tsx:76 DOES include `<span className="sr-only">Close</span>` so the primitive is fine.
- **Нөлөө:** Screen reader эдгээр товчийг зүгээр 'button' гэж уншина — хэрэглэгч ямар үйлдэл (хаах уу, устгах уу) гэдгийг мэдэхгүй. Харилцагч хуудасны хаах товчнууд болон contracts drawer-ийн X-д нөлөөлнө.
- **Зөвлөмж:** Бүх icon-only товчинд `aria-label` (жишээ нь aria-label="Хаах") эсвэл `<span className="sr-only">Хаах</span>` нэмэх. Контрактс drawer-ийн X товч (contracts:465) мөн title-гүй.
- **Verifier тэмдэглэл:** customers:800,945,1063 X товчнууд aria-label/sr-only/title-гүй нь бодит. contracts:465 X title-гүй нь зөв (харин contracts:461 устгах товч title="Устгах"-тай тул тэр нэг товч нэртэй). aria-label нийт 4 байгааг grep баталлаа. Severity medium зөв — гол форм блоклогддоггүй, гэхдээ хаах/устгах төөрөгдөл үүсгэнэ.

#### ux-a11y.7 — 🟡 ДУНД Async ачааллын/алдааны мэдэгдэлд aria-live байхгүй

`no-aria-live-async`

- **Файл:** `src/app/dashboard/contracts/page.tsx:196-204`, `src/app/dashboard/inbox/messages/page.tsx`, `src/app/layout.tsx:83`
- **Баримт (evidence):** `grep aria-live|role="alert"` across src returns 0 (only role="status" in Button.tsx:53 and Spinner.tsx:27). contracts:196-204 import banner `<div className={cn('mb-4 p-3 rounded-md ... bg-status-success-soft text-status-success ...')}>` is a plain div, not in a live region. inbox/messages/page.tsx has no aria-live/role/log/sr-only (grep returns nothing). Sonner Toaster at layout.tsx:83 provides its own built-in aria-live so toasts themselves are announced.
- **Нөлөө:** Дэлгэц уншигч import амжилттай/амжилтгүй болсон, шинэ мессеж ирсэн зэрэг динамик өөрчлөлтийг зарлахгүй. Inbox-ийн real-time мессеж болон inline алдааны banner-ууд хараагүй хэрэглэгчид мэдэгдэхгүй өнгөрнө.
- **Зөвлөмж:** Inline status banner болон inbox шинэ мессежийн контейнерт `aria-live="polite"` (алдаанд role="alert") нэмэх. Чухал хэсгүүдийг sonner toast руу шилжүүлэх нь built-in live region-той тул хамгийн хялбар.
- **Verifier тэмдэглэл:** grep-ээр src даяар aria-live/role=alert 0 (зөвхөн Button/Spinner role=status). contracts:196 banner энгийн div, inbox/messages/page.tsx-д live region алга. Sonner-ийн өөрийн live region-ийг auditor зөв тэмдэглэсэн. Severity medium зөв. Файлын мөрийг 196-202-оос 196-204 болгож banner-ийн төгсгөлийг хамруулав.

#### ux-a11y.8 — 🟡 ДУНД Гар хийсэн input-ууд outline-none-той, focus indicator сул/байхгүй

`custom-inputs-outline-none`

- **Файл:** `src/app/dashboard/customer-service/page.tsx:512`, `src/app/dashboard/customer-service/page.tsx:527`, `src/app/dashboard/customer-service/page.tsx:544`, `src/app/dashboard/customer-service/page.tsx:553`, `src/app/dashboard/customer-service/page.tsx:575`, `src/app/dashboard/leads/new/page.tsx:104`
- **Баримт (evidence):** customer-service has 10 `outline-none` occurrences; lines 512,527,544,553,565,575 have plain `outline-none` with NO focus replacement (no focus:ring/focus:border). Lines 269 and 501 partially mitigate with `focus:border-brand/40` (border-color change only, weak). No `focus:ring`/`focus-visible` anywhere in the file (grep returns 0). Shared Input.tsx:12 DOES add `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`, but these pages hand-roll `<input>` without it. leads/new:104 select uses off-token `focus:ring-emerald-500`.
- **Нөлөө:** Гар ажиллагаатай хэрэглэгч аль талбар дээр focus байгааг харахгүй — outline арилсан, орлуулах ring нэмээгүй. Үйлчилгээний хяналтын формыг гараар бөглөхөд хэцүү.
- **Зөвлөмж:** Гар хийсэн input-уудыг shared `<Input>`/`<Textarea>` примитивээр солих, эсвэл `focus-visible:ring-2 focus-visible:ring-ring`-ийг нэмэх. emerald-500 зэрэг token бус focus өнгийг `ring-ring` болгох.
- **Verifier тэмдэглэл:** Бодит: customer-service-д 10 outline-none, үүнээс 512/527/544/553/565/575 нь focus indicator огт байхгүй. Input.tsx:12 ring-тэй гэдгийг auditor зөв тэмдэглэсэн. leads/new:104 emerald-500 off-token зөв. ТОДОТГОЛ: auditor '8 occurrences ... no focus:ring/focus:border' гэсэн нь хэт ерөнхий — 269 ба 501 нь focus:border-brand/40 хэсэгчилсэн indicator-тай (бүрэн алга биш). Тиймээс гарчиг/evidence-ийг 'focus indicator сул/байхгүй' болгож нарийвчлав. Severity medium хэвээр зөв.

#### ux-a11y.9 — 🔵 БАГА NotificationButton off-token өнгөтэй, aria-pressed-гүй

`notification-button-off-token-contrast`

- **Файл:** `src/components/NotificationButton.tsx:28-33`
- **Баримт (evidence):** NotificationButton.tsx:28-33: subscribed state `bg-status-success/20 text-green-400 hover:bg-status-success/30`, unsubscribed `bg-slate-700/50 text-slate-300 hover:bg-slate-700`. text-green-400 (light Tailwind green) on light cream Header = low contrast; slate-700 dark pill clashes with light Header. No editorial tokens, no aria-pressed. (Note: the button DOES carry a `title` at lines 35-41 giving it an accessible name, so it is not nameless.)
- **Нөлөө:** Header дэх notification товчны ON/OFF төлөв editorial theme-тэй зөрчилдөж, text-green-400 нь гэрэлт фонд contrast муутай. Header-ийн хяналтад нөлөөлнө.
- **Зөвлөмж:** text-green-400/slate-* өнгийг editorial токенаар солих (idle: bg-surface-2 text-muted-foreground; active: bg-status-success-soft text-status-success). aria-pressed нэмж ON/OFF төлөвийг screen reader-т зарлах.
- **Verifier тэмдэглэл:** NotificationButton.tsx:28-33 дээр text-green-400, bg-slate-700/50 text-slate-300 off-token өнгө бодит, aria-pressed алга. Severity low зөв. ЗАСВАР: товч нь title attribute (мөр 35-41)-тай тул accessible name-тэй — гарчиг/evidence-ээс 'name' асуудлыг хасч зөвхөн off-token өнгө + aria-pressed дутагдал дээр төвлөрүүлэв.

#### ux-a11y.10 — 🔵 БАГА Зарим зурагт утга бүхий alt дутуу / англи fallback

`raw-img-missing-alt`

- **Файл:** `src/components/ui/Avatar.tsx:56`, `src/components/dashboard/VirtualTour.tsx:64`
- **Баримт (evidence):** Avatar.tsx:56 `<img src={src} alt={alt || ''} className="h-full w-full object-cover" />` — alt prop дутуу үед хоосон string болж буурна (хажуугийн span нь initials үзүүлдэг тул хагас зөв). VirtualTour.tsx:64 `<img src={posterImage} alt={propertyName || 'Virtual Tour'} ... />` — англи fallback 'Virtual Tour' нь Монгол хэлний дүрэм зөрчиж, утга муутай ерөнхий alt.
- **Нөлөө:** Avatar зурагт нэр дамжуулаагүй үед хэн болохыг screen reader хэлэхгүй. VirtualTour-ийн англи fallback alt нь Монгол хэлний дүрэм зөрчиж, утга муутай.
- **Зөвлөмж:** Avatar-д хэрэглэгчийн нэрийг alt болгон заавал дамжуулах. VirtualTour fallback-ийг Монгол утга бүхий текст болгох (жишээ: '360 виртуал тур').
- **Verifier тэмдэглэл:** Avatar.tsx:56 alt={alt || ''} болон VirtualTour.tsx:64 alt={propertyName || 'Virtual Tour'} (англи fallback) хоёулаа бодит. Avatar нь initials fallback-тай тул хил дээр зөвшөөрөгдөхүйц, харин VirtualTour-ийн англи fallback нь Монгол-хэлний дүрэм зөрчиж байгаа тодорхой. Severity low зөв.


### Харилцан үйлдэл ба эргэх холбоо (interaction & feedback)

_Хэмжүүр: `ux-interaction`_

#### ux-interaction.1 — 🔴 КРИТИК Шинэ лийд нэмэх форм огт хадгалдаггүй (demo mode)

`new-lead-form-demo-mode`

- **Файл:** `src/app/dashboard/leads/new/page.tsx:26-35`, `src/app/dashboard/leads/page.tsx:212-217`
- **Баримт (evidence):** leads/new/page.tsx:30-34 handleSubmit has comment `// Demo mode - just show success` and only `setTimeout(() => { toast.success('Лийд амжилттай нэмэгдлээ!'); router.push('/dashboard/leads'); }, 1000)`. No fetch/supabase call anywhere in the file; formData (lines 15-24) is collected but discarded. leads/page.tsx:213 PageHeader primaryAction `<Button href="/dashboard/leads/new">` links to this dead form. setLoading(true) at line 28 is never reset to false (no real request), so button stays in 'Хадгалж байна...' until navigation.
- **Нөлөө:** Хэрэглэгч лийдийн мэдээллийг бөглөж 'Хадгалах' дарахад 'амжилттай' toast гарч, лийдийн жагсаалт руу буцдаг ч лийд огт үүсдэггүй. Борлуулалтын менежер боломжит худалдан авагчийн мэдээллийг алдах бөгөөд систем хэвийн ажиллаж байгаа мэт хуурамч итгэл төрүүлж, шууд өгөгдөл алдагдалд хүргэнэ.
- **Зөвлөмж:** handleSubmit-д бодит API дуудлага хийх (POST /api/leads эсвэл dashboard leads endpoint, x-shop-id толгойтой), алдааг catch хийж toast.error харуулах, setLoading-ийг жинхэнэ хүсэлтэд холбох. Бэлэн биш бол хуудсыг түр идэвхгүй болгох эсвэл товчийг disabled болгох.
- **Verifier тэмдэглэл:** Бүрэн баталгаажсан. leads/new/page.tsx:30-34 дээр 'Demo mode' тайлбар, зөвхөн setTimeout+toast.success+router.push байгаа, ямар ч fetch/supabase дуудлага алга. formData бөглөгдөж байгаа ч хаягдана. leads/page.tsx:213 дээр товч энэ хуудас руу холбож байгаа нь батлагдсан. Critical зөв — амжилттай гэж хуурч өгөгдөл алдагдана. Нэмэлт нарийвчлал: setLoading(true) хэзээ ч false болохгүй (file-д setLoading(false) дуудлага байхгүй).

#### ux-interaction.2 — 🟠 ӨНДӨР Inbox жагсаалтын карт дээр дарахад юу ч болдоггүй

`inbox-card-click-noop`

- **Файл:** `src/app/dashboard/inbox/page.tsx:17`, `src/app/dashboard/inbox/page.tsx:63-68`
- **Баримт (evidence):** inbox/page.tsx:17 `const [selectedId, setSelectedId] = useState<string|null>(null)`. Set by Card onClick at line 67 `onClick={() => setSelectedId(conv.id)}`, with `hover` + `className="cursor-pointer"` (lines 65-66). grep confirms `selectedId` appears ONLY on line 17 — it is never read or rendered anywhere else in the file. Clicking the card sets state that drives no UI; the real chat lives at /dashboard/inbox/messages/page.tsx.
- **Нөлөө:** Карт cursor-pointer/hover-той тул хэрэглэгч дарж яриаг нээнэ гэж ойлгох ч ямар ч хариу үйлдэл гарахгүй — эвдэрсэн мэт сэтгэгдэл төрүүлнэ. Жинхэнэ chat тусдаа /dashboard/inbox/messages хуудсанд байгаа тул энэ хуудас замбараагүй болж байна.
- **Зөвлөмж:** Карт дарахад /dashboard/inbox/messages руу router.push хийх эсвэл detail drawer нээх. selectedId-д тулгуурлан UI render хийхгүй бол cursor-pointer/hover/onClick-ыг бүрэн арилгах.
- **Verifier тэмдэглэл:** Баталгаажсан. grep-ээр selectedId зөвхөн 17-р мөрөнд л гарч байна, 67-р мөрөнд set хийгдсэн ч хаана ч уншигдахгүй. Card нь hover+cursor-pointer (65-66) тул дарагдахаар харагдана. High severity зөв — өргөн ашиглагдах inbox хуудасны үндсэн харилцан үйлдэл огт ажиллахгүй.

#### ux-interaction.3 — 🟡 ДУНД Устгах/хадгалахад native confirm() ба alert() ашигласан

`native-confirm-alert-destructive`

- **Файл:** `src/app/dashboard/properties/page.tsx:136`, `src/app/dashboard/contracts/page.tsx:149`, `src/app/dashboard/contracts/page.tsx:159`, `src/app/dashboard/inbox/messages/page.tsx:74`, `src/app/dashboard/surveys/page.tsx:278-280`
- **Баримт (evidence):** properties/page.tsx:136 `if (!confirm('Энэ үл хөдлөхийг устгах уу?')) return`; contracts/page.tsx:149 `if (!confirm('Энэ гэрээг устгах уу?')) return` and on error line 159 `alert('Устгахад алдаа гарлаа: ' + (err as Error).message)`; inbox/messages/page.tsx:74 `if (!confirm(...)) return`; surveys/page.tsx:278 `alert('Судалгаа амжилттай хадгалагдлаа')` and 280 `catch { alert('Алдаа гарлаа'); }`. By contrast leads/properties/contracts use sonner toast for success/error and customers/finance use Modal primitives.
- **Нөлөө:** Native browser dialog нь Editorial Design System (cream/terracotta), Modal/toast загвартай зохицдоггүй, мобайл дээр муухай харагдана, гарчиг/товчны текстийг хянах боломжгүй, brand тууштай байдлыг алдагдуулна.
- **Зөвлөмж:** Устгах баталгаажуулалтад нэгдсэн confirm Modal (одоо байгаа @/components/ui/Modal эсвэл BottomSheet) ашиглах; үр дүн/алдааг alert() биш sonner toast-аар харуулах. Бүх destructive болон mutation feedback-ийг нэг загварт нэгтгэх.
- **Verifier тэмдэглэл:** Бүх цитат бодит: properties:136, contracts:149+159, inbox/messages:74, surveys:278+280 баталгаажсан. surveys нь зөвхөн confirm биш alert хоёуланг ашиглаж байна. Medium severity зохистой — энэ нь brand тууштай байдал, мобайл UX-д нөлөөлөх polish/consistency асуудал, аюулгүй байдлын асуудал биш.

#### ux-interaction.4 — 🟡 ДУНД Modal primitive хаана ч ашиглагдаагүй — хуудас бүр өөрийн modal зохиосон

`modal-primitive-unused`

- **Файл:** `src/components/ui/Modal.tsx:1`, `src/app/dashboard/customers/page.tsx:795-1166`, `src/app/dashboard/finance/page.tsx:255-335`, `src/app/dashboard/procurement/page.tsx:310-335`
- **Баримт (evidence):** grep for `import` of '@/components/ui/Modal' across src/app and src/components returns ZERO matches. Modal.tsx is a Radix Dialog wrapper (DialogPrimitive.Root/Overlay/Content) with built-in focus trap, Esc, overlay close, aria Title/Description (lines 16,46-47,59,63). Instead customers/page.tsx:796 hand-rolls `<div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm ...">` (grep counts 4 such `fixed inset-0` modals in that file); finance/page.tsx:256 inlines one; procurement/page.tsx:310 defines its OWN local `function Modal({ title, onClose, error, children, footer })` duplicating the primitive. These plain-div overlays do not register Esc/focus-trap/overlay-click-close.
- **Нөлөө:** Modal-ийн зан төлөв (Esc дарж хаах, focus trap, overlay дээр дарж хаах, accessibility role/aria) хуудас бүрт өөр болж байна; hand-rolled div-ууд overlay дээр дарахад/Esc-д хаагддаггүй. Засвар олон газар давтагдаж, нийцэлгүй болно.
- **Зөвлөмж:** Бүх dashboard modal-ыг @/components/ui/Modal (Radix Dialog, focus trap + Esc + overlay close-той) дээр шилжүүлэх. procurement-ийн локал Modal функцийг устгах. Accessibility болон тууштай байдлыг нэгэн зэрэг сайжруулна.
- **Verifier тэмдэглэл:** Баталгаажсан. Modal.tsx бол Radix Dialog wrapper (focus trap/Esc/overlay close төрөлхийн). grep-ээр import огт алга. customers-д 4 hand-rolled 'fixed inset-0' modal, finance:256 inline, procurement:310 өөрийн локал function Modal зарласан нь яг батлагдсан. Medium зөв — accessibility+consistency асуудал.

#### ux-interaction.5 — 🟡 ДУНД Stats дээр хуурамч '+18% өмнөх сараас' хатуу бичсэн тоо

`fake-stat-deltas`

- **Файл:** `src/app/dashboard/leads/page.tsx:230`, `src/app/dashboard/leads/page.tsx:256`, `src/app/dashboard/properties/page.tsx:187`, `src/app/dashboard/properties/page.tsx:199`, `src/app/dashboard/properties/page.tsx:211`, `src/app/dashboard/properties/page.tsx:223`
- **Баримт (evidence):** leads/page.tsx:230 literal `+18% өмнөх сараас` (Нийт лийд) and :256 `+5% өмнөх сараас` (Хөрвүүлэлт), both wrapped in green text-status-success + ArrowUpRight. properties/page.tsx:187 `+12%`, :199 `+8%`, :211 `+24%` (green ArrowUpRight), :223 `-2% өмнөх сараас` (red, ArrowUpRight rotate-90). All are static JSX string literals in StatTile `helper` props — not derived from stats state, so they never change regardless of actual data.
- **Нөлөө:** Хэрэглэгч эдгээр хувийг бодит сар тутмын өсөлт гэж ойлгож шийдвэр гаргана. Бодит тоо тэг байсан ч '+24% өсөлт' харуулах нь итгэлийг алдагдуулж, өгөгдлийн бүрэн бус байдлыг нуун дарагдуулна. Шинэ shop дээр ялангуяа төөрөгдүүлнэ.
- **Зөвлөмж:** Бодит өмнөх үетэй харьцуулсан delta тооцоолох (API/hook-оос), боломжгүй бол helper-ийг бүрэн арилгах эсвэл 'Өгөгдөл хүрэлцэхгүй' гэх төвийг сахисан текст харуулах. Хуурамч өсөлтийн тоог production-д үлдээхгүй байх.
- **Verifier тэмдэглэл:** Бүх 6 цитат бодит: leads:230(+18%),256(+5%); properties:187(+12%),199(+8%),211(+24%),223(-2%) бүгд статик литерал, stats state-ээс тооцоологдоогүй. Medium зохистой — өгөгдлийн бүрэн бус байдлыг нуудаг хуурамч мэдээлэл боловч аппын суурь үйл ажиллагааг эвддэггүй.

#### ux-interaction.6 — 🟡 ДУНД Inbox messages хуудас мобайлд эвдэрхий + дизайн token-оос гажсан

`inbox-messages-not-responsive-and-offtoken`

- **Файл:** `src/app/dashboard/inbox/messages/page.tsx:198-200`, `src/app/dashboard/inbox/messages/page.tsx:289-377`
- **Баримт (evidence):** Line 198 root `<div className="flex h-[calc(100vh-80px)] bg-[#0a0a0f] rounded-xl overflow-hidden border border-white/[0.06]">`; line 200 fixed `<div className="w-[340px] border-r border-white/[0.06] flex flex-col shrink-0">` sidebar. grep for md:/sm:/lg:/hidden across the file returns NOTHING (only the line-198 root matched on the bare 'hidden' substring inside overflow-hidden — no responsive breakpoint anywhere). Entire page hardcodes dark theme: bg-[#0a0a0f], text-white/80 (210,238), border-white/[0.06], bg-surface/[0.05-0.08] — not the editorial surface/foreground/muted tokens used on every other dashboard page.
- **Нөлөө:** Жижиг дэлгэц дээр 340px тогтсон жагсаалт + чат хоёр зэрэг багтахгүй, shrink-0 тул хэвтээ overflow/шахагдалт үүснэ; мобайл bottom-nav-тай давхцаж болзошгүй. Уг хуудас бусад cream/ink dashboard-аас тэс өөр хар theme-тэй болсон нь brand тууштай байдлыг эвдэж байна.
- **Зөвлөмж:** Мобайл дээр жагсаалт ↔ чат хооронд шилжих responsive layout нэмэх (активэ яриа сонгогдвол жагсаалтыг нуух); bg-[#0a0a0f]/text-white-ийг surface/foreground/muted token руу шилжүүлэх.
- **Verifier тэмдэглэл:** Баталгаажсан. Root:198 ба 340px shrink-0 sidebar:200 бодит. grep md:/sm:/lg: огт алга (зөвхөн overflow-hidden дотор 'hidden' substring таарсан). Бүх хуудас bg-[#0a0a0f]+text-white/* хатуу хар theme, editorial token огт ашиглаагүй нь батлагдсан. Medium зохистой.

#### ux-interaction.7 — 🟡 ДУНД Олон хуудас fetch алдааг console-д л бичээд хэрэглэгчид мэдэгддэггүй

`silent-fetch-errors-no-ui`

- **Файл:** `src/app/dashboard/customers/page.tsx:221-224`, `src/app/dashboard/customers/page.tsx:242-246`, `src/app/dashboard/finance/page.tsx:102-106`, `src/app/dashboard/procurement/page.tsx:78`, `src/app/dashboard/contracts/page.tsx:105-109`
- **Баримт (evidence):** customers fetchHealth catch (221-223) only `console.error('Failed to fetch customer health:', error)` and no res.ok check before `res.json()`; fetchCustomers catch (242-245) only `console.error(...)`, leaves `data.customers || []`. finance loadAll catch (102-103) `console.error('Failed to load finance data:', e)`. procurement loadAll line 78 `catch (e) { console.error(e); }`. contracts fetchContracts catch (105-106) `console.error('[Contracts] fetch error:', err)` and line 102 `const data: ApiResponse = await res.json()` with NO res.ok check. None set an error state or toast — a 401/500 silently yields empty arrays indistinguishable from 'no data'.
- **Нөлөө:** Сүлжээ тасрах, 401/500 эсвэл shop-id буруу үед хэрэглэгч хоосон жагсаалт (EmptyState 'олдсонгүй') хардаг бөгөөд 'өгөгдөл байхгүй' гэж андуурна — алдаа гарсан эсэхийг ялгах боломжгүй.
- **Зөвлөмж:** fetch бүрт res.ok шалгах, алдаанд тусдаа error state хадгалж 'Дахин ачаалах' товчтой алдааны UI (эсвэл toast.error) харуулах. Хоосон төлвийг алдааны төлвөөс ялгах.
- **Verifier тэмдэглэл:** Бүх 5 цитат батлагдсан. customers (221-223, 242-245), finance (102-103), procurement (78), contracts (105-106) бүгд зөвхөн console.error, error state/toast байхгүй. Нэмж: contracts:102 болон customers fetch-үүд res.ok шалгахгүйгээр res.json() хийдэг тул 401/500 хоосон массив болж буцна. Medium зохистой.

#### ux-interaction.8 — 🔵 БАГА Лийдийн статус шинэчлэл алдаанд хамгаалалтгүй, in-flight үед disable хийдэггүй

`leads-status-optimistic-no-rollback`  ·  ⚠️ _uncertain_

- **Файл:** `src/app/dashboard/leads/page.tsx:141-156`, `src/app/dashboard/leads/page.tsx:424-438`
- **Баримт (evidence):** updateStatus (141-156): supabase update эхэлж хийгээд зөвхөн амжилтад `setLeads(...)` (line 150), алдаанд зөвхөн toast.error (154). select (424-438) `value={lead.status}` (controlled). select-д disabled/aria-busy байхгүй тул хүсэлт явж байх үед олон удаа сольж болно (race). Алдаанд select хуучин утга руугаа автоматаар буцна (state өөрчлөгдөөгүй тул), гэхдээ дараалсан хүсэлтүүд DB-тэй зөрөх эрсдэлтэй.
- **Нөлөө:** Сүлжээ удаан үед хэрэглэгч select-ийг хэд хэдэн удаа сольж болзошгүй (давхар хүсэлт, race). Алдаа гарвал toast гарах ч select disable болдоггүй тул UI/DB зөрөх эрсдэлтэй.
- **Зөвлөмж:** Хүсэлтийн үед select-ийг түр disable хийх (aria-busy), эсвэл жинхэнэ optimistic pattern хэрэгжүүлж алдаанд хуучин статус руу сэргээх (rollback).
- **Verifier тэмдэглэл:** Файл/мөрүүд бодит, race+disabled байхгүй гэдэг үндсэн санаа зөв. Гэвч аудиторын 'select-ийн утга momentarily diverge болно' гэдэг framing буруу: select нь value={lead.status}-аар controlled тул хүсэлт амжилтгүй болоход хуучин утгандаа автоматаар үлддэг (де-факто rollback аль хэдийн байгаа). Жинхэнэ цоорхой нь зөвхөн in-flight disable байхгүй (race) учир severity-г medium-аас low болгож буулгав. Auditor өөрөө confidence:medium гэж тэмдэглэсэн нь зохистой.

#### ux-interaction.9 — 🔵 БАГА Loading заалт хуудас бүрт зөрүүтэй (skeleton vs spinner vs текст)

`loading-skeleton-vs-spinner-inconsistency`

- **Файл:** `src/app/dashboard/page.tsx:53-55`, `src/app/dashboard/customers/page.tsx:694-699`, `src/app/dashboard/leads/page.tsx:320-328`, `src/app/dashboard/surveys/page.tsx:370`, `src/app/dashboard/inbox/messages/page.tsx:189-195`
- **Баримт (evidence):** dashboard/page.tsx:54 `return <DashboardSkeleton />` (skeleton). customers/page.tsx:694-698 centered `<Spinner size="lg" />` inside a Card. leads/page.tsx:320-326 Spinner + 'Татаж байна...' text in a table row (properties same pattern 300-307). surveys/page.tsx:370 plain text `Уншиж байна...`. inbox/messages/page.tsx:189-194 bare `<Loader2 className="w-6 h-6 animate-spin text-status-info" />`. Five different loading conventions.
- **Нөлөө:** Хуудас хооронд шилжихэд ачааллын мэдрэмж жигд бус — зарим content-shape skeleton, зарим spinner, зарим зүгээр текст. Өнгөц боловч perceived performance, polish-д нөлөөлж, layout shift үүсгэж болзошгүй.
- **Зөвлөмж:** Жагсаалт/хүснэгттэй хуудсуудад нэгдсэн skeleton (TableSkeleton) ашиглах; spinner-ийг зөвхөн жижиг inline үйлдэлд хязгаарлах. surveys/inbox-ийн plain текст ба bare Loader2-ийг ижил загварт оруулах.
- **Verifier тэмдэглэл:** Бүх 5 цитат батлагдсан: dashboard:54 DashboardSkeleton, customers:697 Spinner-in-Card, leads:320-326 Spinner+текст, surveys:370 plain 'Уншиж байна...', inbox/messages:192 bare Loader2. Loading төлвийн конвенц үнэхээр 5 өөр. Low severity зохистой — polish асуудал.

#### ux-interaction.10 — 🔵 БАГА Форм бүр react-hook-form+zod-гүй, inline талбарын алдаа харуулдаггүй

`forms-no-rhf-zod-no-inline-errors`

- **Файл:** `src/app/dashboard/properties/_components/PropertyForm.tsx:204-218`, `src/app/dashboard/leads/new/page.tsx:15-42`, `src/app/dashboard/finance/page.tsx:109-114`, `src/app/dashboard/customers/page.tsx:478-512`
- **Баримт (evidence):** CLAUDE.md states forms use react-hook-form + zod, but PropertyForm.tsx:204-209 handleSubmit uses raw useState formData and only `if (!formData.name.trim()) { toast.error('Нэр шаардлагатай'); return; }` — single top-level message, validates only on submit, no per-field error. finance/page.tsx:109-113 submitTxn `if (!amount || amount <= 0) { setFormError('Дүн оруулна уу'); return; }` (single form-level error). customers/page.tsx:478-482 createCustomer `if (!createForm.name.trim()) { setCreateError('Нэр шаардлагатай'); return; }` same pattern. leads/new uses raw useState (15-24) with only `required` HTML attr. No field-level inline error or onBlur validation in any of them.
- **Нөлөө:** Олон талбартай форм (PropertyForm) бөглөхөд алдаа зөвхөн submit дарсны дараа нэг toast/нэг мөрөөр гарч, яг аль талбар буруу болохыг талбарын дэргэд заадаггүй. Урт форм дээр алдаагаа олох нь хүндрэлтэй болж, бөглөх алдааны давтамж нэмэгдэнэ.
- **Зөвлөмж:** Тогтоосон конвенцийн дагуу гол формуудыг react-hook-form + zod resolver руу шилжүүлж, талбар бүрийн доор inline алдаа (aria-invalid-тэй) харуулах. Боломжгүй бол ядаж талбар бүрт алдааны мессеж байрлуулах.
- **Verifier тэмдэглэл:** Бүх цитат батлагдсан: PropertyForm:206-207 raw useState+toast.error single message, finance:111-112 setFormError single, customers:479-481 setCreateError single, leads/new raw useState. RHF/zod конвенц зөрчигдсөн, per-field inline алдаа хаана ч алга. Low severity зохистой — функцийн алдаа биш UX polish/convention асуудал.


### Контент ба нутагшуулалт (Монгол хэл)

_Хэмжүүр: `ux-content-l10n`_

#### ux-content-l10n.1 — 🟠 ӨНДӨР Header гарчгийн fallback англи бөгөөд олон идэвхтэй хуудсыг бүрхдэггүй, хуучин e-commerce нэр үлдсэн

`header-title-english-and-stale`

- **Файл:** `src/components/dashboard/Header.tsx:47`, `src/components/dashboard/Header.tsx:48`, `src/components/dashboard/Header.tsx:50`, `src/components/dashboard/Header.tsx:51`, `src/components/dashboard/Header.tsx:55`, `src/components/dashboard/Header.tsx:32`
- **Баримт (evidence):** getHeaderTitle() defaults to English: `let title = 'Dashboard'` (line 47) and `if (path.includes('/pipeline')) title = 'Pipeline'` (line 48). The switch (lines 47-62) has NO case for /finance, /procurement, /customer-service, or /properties — all confirmed real route dirs (ls src/app/dashboard/ shows finance, procurement, customer-service, properties). Those pages render English 'Dashboard'. /customer-service does NOT match line 52's path.includes('/customers'). Lines 50-51 still map removed e-commerce routes /orders->'Захиалга', /products->'Бүтээгдэхүүн'. Line 55 maps /inbox->'Идэвхтэй Сагс' (Active Cart, stale e-commerce term for the messaging inbox). fullName falls back to 'User' (line 32).
- **Нөлөө:** Санхүү, худалдан авалт, үйлчилгээ, үл хөдлөх зэрэг идэвхтэй үндсэн хуудсуудад дээд талын гарчиг англиар 'Dashboard' гэж гарч монгол-only бодлогыг зөрчинө. Inbox дээр 'Идэвхтэй Сагс' гэх e-commerce-ийн хоцрогдсон нэр гарч төөрөгдөл үүсгэнэ. /pipeline нь 'Pipeline' гэж англиар гарна.
- **Зөвлөмж:** Default-ийг монголоор болгох, /pipeline-г монголоор бичих, бүх идэвхтэй route-уудыг (finance, procurement, customer-service, properties) нэмж бүрхэх. /orders, /products мөрүүдийг устгах, /inbox->'Идэвхтэй Сагс'-ийг 'Мессеж' болгох, 'User' fallback-ийг 'Хэрэглэгч' болгох.
- **Verifier тэмдэглэл:** Файлыг бүтэн уншсан. Мөр бүр баталгаажсан: 47 'Dashboard', 48 'Pipeline', 50 'Захиалга', 51 'Бүтээгдэхүүн', 32 'User'. Ганц засвар: 'Идэвхтэй Сагс' нь line 56 биш line 55 дээр байсан тул file:line-г залруулсан. ls-ээр finance/procurement/customer-service/properties route бодитоор оршдог нь батлагдсан тул switch бүрхдэггүй гэдэг гол нэхэмжлэл үнэн. High severity зөв — олон үндсэн хуудсанд англи гарчиг + монгол-only зөрчил.

#### ux-content-l10n.2 — 🟡 ДУНД Нэг ойлголтыг 'Лийд', 'сэжим', 'сонирхогч' гэж зэрэг нэрлэсэн

`lead-terminology-inconsistent`

- **Файл:** `src/app/dashboard/leads/page.tsx:209`, `src/app/dashboard/page.tsx:114`, `src/app/dashboard/reports/leads/page.tsx:228`, `src/app/dashboard/reports/leads/page.tsx:191`, `src/app/dashboard/reports/leads/page.tsx:306`, `src/app/dashboard/customers/page.tsx:69`
- **Баримт (evidence):** leads/page.tsx:209 eyebrow='Лийд' (and :215 'Лийд нэмэх'); dashboard/page.tsx:114 StatsCard title='Нийт лийд'. reports/leads/page.tsx uses 'сэжим': line 228 'Нийт сэжим', line 191 'Сэжмийн тайлан', line 306 'Сэжим: {item.leads}'. customers/page.tsx:69 labels the prospect lifecycle stage 'Шинэ сонирхогч'. Three different Mongolian words for the lead/prospect concept across leads/reports/customers.
- **Нөлөө:** Хэрэглэгч ижил зүйлийг хуудас бүрт өөр нэрээр харж эргэлзэнэ; тайлан хэсэг ('сэжим') үндсэн 'Лийд' цэстэй тасарсан мэт сэтгэгдэл төрүүлж brand voice-ийн нэгдмэл байдлыг алдагдуулна.
- **Зөвлөмж:** Нэг стандарт нэр сонгох (жишээ нь 'Лийд'). reports/leads дэх 'сэжим'-ийг нэгтгэх; customers дахь 'Шинэ сонирхогч' нь lifecycle stage гэдгийг тодорхой болгох эсвэл нэр томьёог нэгтгэх.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан. leads:209 'Лийд', dashboard:114 'Нийт лийд', reports/leads:228 'Нийт сэжим', :191 'Сэжмийн тайлан', :306 'Сэжим:', customers:69 'Шинэ сонирхогч'. customers:69-д буй нь LifecycleStage-ийн label буюу 'prospect' stage нэр — бүрэн ижил утга гэхээсээ амьдралын мөчлөгийн үе шат тул бага зэрэг нюанс боловч 'лийд/сэжим' хоёр зэрэгцэн орсон нь тодорхой зөрчил. Medium severity зөв.

#### ux-content-l10n.3 — 🟡 ДУНД Үл хөдлөхийг 'байр', 'үл хөдлөх', 'орон сууц' гэж зэрэгцүүлэн нэрлэсэн

`property-terminology-inconsistent`

- **Файл:** `src/app/dashboard/page.tsx:113`, `src/app/dashboard/properties/page.tsx:166`, `src/app/dashboard/properties/page.tsx:180`, `src/app/dashboard/contracts/page.tsx:309`, `src/app/dashboard/contracts/page.tsx:502`, `src/app/dashboard/reports/properties/page.tsx:225`
- **Баримт (evidence):** dashboard/page.tsx:113 StatsCard title='Нийт байр'. properties/page.tsx:166 eyebrow='Үл хөдлөх' (and :167 'Үл хөдлөх жагсаалт'), :180 StatTile label='Нийт үл хөдлөх'. contracts/page.tsx:309 table header 'Байр' but :502 Section title='Орон сууц' — same page uses both. reports/properties/page.tsx:225 'Нийт байр'. One entity called байр / үл хөдлөх / орон сууц across (and within) pages.
- **Нөлөө:** KPI самбар 'байр', жагсаалт 'үл хөдлөх', гэрээ 'орон сууц' гэж зэрэгцэн харагдаж нэгдмэл бус санагдана; шинэ хэрэглэгч ижил мэдээллийг өөр модуль гэж андуурч магадгүй.
- **Зөвлөмж:** Нэг суурь нэр томьёо тогтоох (богино UI-д 'байр', албан ёсны/гэрээнд 'үл хөдлөх хөрөнгө') ба тууштай хэрэглэх. Ялангуяа contracts хуудас доторх 'Байр' (table) vs 'Орон сууц' (section)-ийг нэгтгэх.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан: dashboard:113 'Нийт байр', properties:166 'Үл хөдлөх', :180 'Нийт үл хөдлөх', contracts:309 'Байр', contracts:502 'Орон сууц', reports/properties:225 'Нийт байр'. Нэг хуудсанд (contracts) хоёр өөр нэр зэрэг байгаа нь зөрчлийг тодотгож байна. Medium severity тохирно.

#### ux-content-l10n.4 — 🟡 ДУНД Валютын формат хуудас болгонд өөр (латин B₮/M₮ vs монгол сая₮/тэрбум₮, зай, мянгатын тусгаарлагч)

`currency-format-inconsistent`

- **Файл:** `src/app/dashboard/finance/page.tsx:52`, `src/app/dashboard/procurement/page.tsx:23`, `src/app/dashboard/marketing-roi/page.tsx:74`, `src/app/dashboard/customer-service/page.tsx:75`, `src/app/dashboard/contracts/page.tsx:49`, `src/app/dashboard/reports/leads/page.tsx:154`, `src/app/dashboard/properties/page.tsx:158`
- **Баримт (evidence):** finance/page.tsx:52-54 (formatMNT), procurement:23-25 (formatMNT), marketing-roi:74-76 (fmtMNT), properties:158-160 (formatPrice) all abbreviate with Latin 'B₮'/'M₮'. customer-service/page.tsx:75-77 uses Mongolian 'тэрбум₮'/'сая₮' (no space) + Intl.NumberFormat('mn-MN') base. reports/leads/page.tsx:154-156 uses 'тэрбум ₮'/'сая ₮' (WITH space). contracts/page.tsx:49 uses Intl.NumberFormat('mn-MN')+'₮' with NO abbreviation. properties:160 falls back to plain .toLocaleString() (no locale) so the thousands separator depends on browser locale, while contracts/customer-service pin 'mn-MN'. Five+ divergent formatters, no shared helper.
- **Нөлөө:** Ижил мөнгөн дүн хуудас болгонд өөр загвартай (5.0M₮ vs 5 сая₮ vs 5,000,000₮) харагдаж, тоон тусгаарлагч ч төхөөрөмжийн хэлээс хамаарч хувирна. Санхүүгийн өгөгдөлд итгэх итгэл алдагдаж, латин B/M товчлол монгол-only бодлогыг зөрчинө.
- **Зөвлөмж:** Нэг нийтлэг formatMNT() helper-ийг lib дотор гаргаж бүх хуудсанд импортлох. Товчлолыг монголоор ('сая','тэрбум') нэгтгэх, бүгдэд Intl.NumberFormat('mn-MN') ашиглаж тусгаарлагчийг тогтворжуулах, зайны дүрмийг нэгтгэх.
- **Verifier тэмдэглэл:** Бүх формат функц баталгаажсан. Анхны нэхэмжлэлд finance:51, procurement:22, marketing-roi:73, properties:158 гэж заасан боловч латин товчлол бүхий мөр нь 52/23/74/158-159 дээр — file:line-г залруулсан (функц зарласан мөр vs товчлолын мөр). reports/leads нь зайтай 'сая ₮' (154-156), contracts:49 товчлолгүй. Олон ялгаатай формат байгаа нь тодорхой. Medium severity зөв.

#### ux-content-l10n.5 — 🟡 ДУНД Marketing ROI хүснэгтэд 'Won', 'CPL', '(won)', 'Organic', 'Reach' англиар үлдсэн

`marketing-roi-english-headers`

- **Файл:** `src/app/dashboard/marketing-roi/page.tsx:344`, `src/app/dashboard/marketing-roi/page.tsx:343`, `src/app/dashboard/marketing-roi/page.tsx:326`, `src/app/dashboard/marketing-roi/page.tsx:327`, `src/app/dashboard/marketing-roi/page.tsx:328`, `src/app/dashboard/marketing-roi/page.tsx:374`, `src/app/dashboard/marketing-roi/page.tsx:384`
- **Баримт (evidence):** ROI campaign table headers: line 343 'CPL', line 344 'Won' (English). StatTile labels: line 326 'Орлого (won)' mixes English in parentheses, line 327 helper `CPL ${fmtMNT(...)}`, line 328 helper `CPA ${fmtMNT(...)}`. Section title line 374 'Organic социал' mixes English+Mongolian. Line 384 inline label 'Reach:' (also line 385 'Snapshot:'). The SAME page's channel table (lines 421/424) uses Mongolian 'Амжилт'/'Алдсан' for the same won/lost concept — confirmed internal inconsistency.
- **Нөлөө:** Маркетингийн гол самбарт англи товчлол/үг харагдаж монгол-only бодлогыг зөрчинө. Нэг хуудсанд 'Won' (line 344) ба 'Амжилт' (line 421) зэрэгцэн орсон нь дотоод зөрчилтэй, монгол хэрэглэгчдэд ойлгомжгүй.
- **Зөвлөмж:** Хүснэгтийн толгойг монголжуулах ('Won'->'Амжилттай', 'Орлого (won)'->'Орлого', 'Organic социал'->'Органик социал', 'Reach'->'Хүрсэн', 'Snapshot'->'Агшин зураг'). CPL/CPA/ROAS товчлолыг үлдээх бол монгол tooltip/тайлбар нэмэх; нэг хуудсан доторх won/Амжилт-ыг нэгтгэх.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан: 343 'CPL', 344 'Won', 326 'Орлого (won)', 327 helper 'CPL', 328 helper 'CPA', 374 'Organic социал', 384 'Reach:'. Дотоод зөрчил (line 344 'Won' vs line 421 'Амжилт') мөн бодитоор нотлогдсон. ROAS товчлол бас байгаа. Medium severity зөв.

#### ux-content-l10n.6 — 🟡 ДУНД Marketing/Social хуудсын Page Insights бүхэлдээ англиар (Impressions, Reach, Engaged Users, Page Views)

`marketing-social-english-metrics`

- **Файл:** `src/app/marketing/social/page.tsx:813`, `src/app/marketing/social/page.tsx:818`, `src/app/marketing/social/page.tsx:824`, `src/app/marketing/social/page.tsx:830`, `src/app/marketing/social/page.tsx:836`
- **Баримт (evidence):** Page Insights card renders English metric labels: line 813 heading 'Page Insights', 818 'Impressions', 824 'Reach', 830 'Engaged Users', 836 'Page Views'. The surrounding page IS Mongolian (e.g. line 849 'Сүүлийн нийтлэлүүд'), so this English block is an island. No Mongolian equivalents.
- **Нөлөө:** Социал медиа аналитик бүхэл бүтэн блок англиар харагдаж монгол хэрэглэгчид статистикийн утгыг шууд ойлгохгүй; CLAUDE.md-ийн монгол-only дүрмийг тод зөрчинө.
- **Зөвлөмж:** Метрик нэрсийг монголжуулах: 'Page Insights'->'Хуудасны статистик', 'Impressions'->'Үзэгдсэн', 'Reach'->'Хүрсэн', 'Engaged Users'->'Идэвхтэй хэрэглэгч', 'Page Views'->'Хуудсын үзэлт'.
- **Verifier тэмдэглэл:** Бүх мөр (813/818/824/830/836) яг заасан текстээр баталгаажсан. Хажуугийн контент монголоор байгаа тул энэ блок цэвэр англи арал болж байна. Medium severity зөв.

#### ux-content-l10n.7 — 🟡 ДУНД Zod валидацийн алдааны мессеж тогтворгүй: 'Email буруу формат' vs 'И-мэйл буруу формат' vs 'И-мэйл буруу', нэг нь бүхэлдээ англи

`zod-email-message-inconsistent`

- **Файл:** `src/lib/validations/schemas.ts:13`, `src/lib/validations/schemas.ts:74`, `src/lib/validations/schemas.ts:85`, `src/lib/validations/schemas.ts:120`, `src/lib/validations/schemas.ts:185`, `src/lib/validations/schemas.ts:160`
- **Баримт (evidence):** Email error messages differ: line 13 'Email буруу формат' (Latin 'Email'), lines 74 & 85 'И-мэйл буруу формат', line 120 'И-мэйл буруу' (shorter). Line 185 CreateRoleSchema regex message is fully English: 'Name must be lowercase with underscores only'. Line 160 CreateShopSchema 'Shop нэр шаардлагатай' mixes Latin 'Shop'. Also UpdateCustomerSchema:82 'Customer ID буруу формат', MergeCustomersSchema:93 'Primary ID буруу формат' mix English nouns.
- **Нөлөө:** Хэрэглэгч ижил алдаанд (буруу и-мэйл) хуудас бүрт өөр текст, заримд латин ('Email','Shop') харна. Role үүсгэх алдаа бүхэлдээ англиар гарч монгол хэрэглэгчид ойлгомжгүй.
- **Зөвлөмж:** Бүх и-мэйл алдааг нэг текст болгох ('И-мэйл хаяг буруу байна'). Line 185-ийн англи мессежийг монголжуулах ('Нэр зөвхөн жижиг үсэг ба доогуур зураасаар бичигдэнэ'). 'Shop нэр'-ийг 'Дэлгүүрийн нэр' болгох.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан: 13 'Email буруу формат', 74 & 85 'И-мэйл буруу формат', 120 'И-мэйл буруу', 185 бүтэн англи 'Name must be lowercase...', 160 'Shop нэр шаардлагатай'. Эдгээр нь validation алдааны details массивт хэрэглэгчид харагдаж болзошгүй. Medium severity зөв.

#### ux-content-l10n.8 — 🔵 БАГА Жижиг англи үгс UI дотор тарсан: 'TBD', 'Follow-up', 'Yesterday' (бас 'AI agent off')

`scattered-english-words-in-ui`

- **Файл:** `src/app/dashboard/page.tsx:202`, `src/app/dashboard/leads/pipeline/page.tsx:191`, `src/app/dashboard/inbox/messages/page.tsx:176`
- **Баримт (evidence):** dashboard/page.tsx:202 viewing date fallback `: 'TBD'` when no scheduled_at. leads/pipeline/page.tsx:191 card text `Follow-up: {date}`. inbox/messages/page.tsx:176 returns hardcoded 'Yesterday' for day-old messages. Verified inbox/messages IS an i18n consumer: line 26 `const { t } = useLanguage()`, t.* used throughout (e.g. lines 130,137,260) — yet it hardcodes 'Yesterday' (176) and 'AI agent off' (132) instead of using t.*.
- **Нөлөө:** Үндсэн самбар, шугам, мессеж хэсэгт жижиг англи үгс гарч монгол-only тууштай байдлыг алдагдуулна; ялангуяа inbox нь i18n хэрэглэдэг хэрнээ 'Yesterday'-г шууд бичсэн нь зөрчилтэй.
- **Зөвлөмж:** 'TBD'->'Товлоогүй', 'Follow-up:'->'Дараагийн холбоо:', 'Yesterday'->'Өчигдөр' (inbox дээр t.* орчуулгаар), мөн line 132 'AI agent off'-ийг монголжуулах.
- **Verifier тэмдэглэл:** Бүх 3 мөр яг заасан текстээр баталгаажсан (202 'TBD', 191 'Follow-up:', 176 'Yesterday'). i18n нэхэмжлэл бодитоор шалгагдсан — inbox/messages line 26 useLanguage ашигладаг тул 'Yesterday' хатуу бичсэн нь жинхэнэ зөрчил. Бонусаар line 132 'AI agent off' мөн англи. Low severity зохистой — жижиг боловч бодит leakage.

#### ux-content-l10n.9 — 🔵 БАГА OrderStatusBadge устгасан e-commerce-ийн хүргэлтийн статусуудыг хадгалсаар (dead code)

`stale-order-status-badge`

- **Файл:** `src/components/ui/Badge.tsx:48`, `src/components/ui/Badge.tsx:53`, `src/components/ui/Badge.tsx:54`
- **Баримт (evidence):** Badge.tsx exports OrderStatusBadge (line 48, commented 'Order status badge — kept for backwards compat') with shipping statuses: line 53 shipped->'Илгээсэн', line 54 delivered->'Хүргэгдсэн', plus pending/confirmed/processing/cancelled — order-fulfillment vocabulary from the removed Syncly e-commerce surface. grep -rn 'OrderStatusBadge' across src/ returns ONLY the definition line (Badge.tsx:48) — no consumers anywhere.
- **Нөлөө:** Устгасан e-commerce функцийн нэршил (захиалга/хүргэлт статус) код дотор үлдэж, дахин ашиглавал буруу домэйн нэр томьёо үл хөдлөх платформд орох эрсдэлтэй. Одоогоор хэрэглэгддэггүй тул user-facing нөлөө бараг тэг.
- **Зөвлөмж:** Ашиглагдахгүй OrderStatusBadge dead code-ийг устгах. CLAUDE.md-ийн 'do NOT reintroduce' Syncly e-commerce жагсаалттай нийцэж байна.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан (48 export, 53 'Илгээсэн', 54 'Хүргэгдсэн'). grep -rn-ээр src/ дотор зөвхөн definition line гарсан — өөр хэрэглээ алга, dead code гэдэг батлагдсан. User-facing нөлөө байхгүй тул low severity зөв (auditor 'medium' confidence-тэй ч severity low гэснийг хадгалав).

#### ux-content-l10n.10 — 🔵 БАГА Огнооны формат хуудас бүрт өөр (бэлэн toLocaleDateString vs тодорхой year/month/day сонголтууд)

`date-format-options-inconsistent`

- **Файл:** `src/app/dashboard/contracts/page.tsx:55`, `src/app/dashboard/customers/page.tsx:570`, `src/app/dashboard/viewings/page.tsx:152`, `src/app/dashboard/inbox/messages/page.tsx:177`, `src/app/dashboard/marketing-roi/page.tsx:256`
- **Баримт (evidence):** contracts/page.tsx:55-59 pins {year:'numeric', month:'2-digit', day:'2-digit'}. customers/page.tsx:570 and viewings/page.tsx:152 use bare toLocaleDateString('mn-MN') (locale default ordering). inbox/messages:177 uses {month:'short', day:'numeric'}; marketing-roi:256 uses {year:'numeric', month:'short'}. No shared date helper — each page defines its own formatDate with its own option set.
- **Нөлөө:** Ижил төрлийн огноо (үүсгэсэн/товлосон огноо) хуудас бүрт өөр форматтай (2024/01/05 vs 1 сар 5 vs locale default) харагдаж нэгдмэл байдал алдагдана.
- **Зөвлөмж:** Нийтлэг formatDate / formatDateTime helper-ийг lib дотор гаргаж тогтмол сонголтоор бүх хуудсанд хэрэглэх. Огнооны дараалал, формат тогтворжино.
- **Verifier тэмдэглэл:** Бүх мөр баталгаажсан: contracts:55 {year/month/day 2-digit}, customers:570 ба viewings:152 хоосон toLocaleDateString('mn-MN'), inbox:177 {month:'short',day:'numeric'}, marketing-roi:256 {year:'numeric',month:'short'}. Хуваалцсан helper байхгүй нь үнэн. Бүгд 'mn-MN' locale ашигладаг тул зөрүү нь форматын сонголтын зөрүү — low severity зохистой (auditor medium confidence ч severity low хэвээр).

---

## 6. Хавсралт — арга зүй ба хязгаарлалт

- **Хасагдсан false-positive (1):** `marketing-table-service-role-policy` (int-auth-tenant) — verifier нь анхны нэхэмжлэлийг (anon insert хоригдохгүй) няцааж, бодит эрсдэл нь өөр (tenant leak) гэж тогтоосон тул анхны хэлбэрээр оруулаагүй. Marketing хүснэгтийн RLS policy-г тусад нь шалгахыг зөвлөж байна.
- **`uncertain` (1):** `ux-interaction` доtorх лийдийн статус шинэчлэлтийн finding — severity бага, нөхцөл зарим тохиолдолд л үүснэ.
- **Арга зүй:** хэмжүүр бүрийн олдворыг тусдаа adversarial verifier иш татсан файл:мөрийг дахин нээж, нэхэмжлэлийг кодоор баталгаажуулсан (skeptic default). Зөвхөн `confirmed`/`uncertain` олдворууд энд орсон.
- **Хязгаарлалт:** static code analysis — runtime/RLS-ийн бодит зан төлөвийг ажиллуулж шалгаагүй. Migration-ууд нь deploy хийгдсэн гэж үзсэн. Зарим severity нь нөхцөлт (жишээ нь route-ыг одоо frontend дуудаагүй бол эрсдэл хязгаарлагдмал).

