# Vertmon Hub — ERP Хэсгийн Замын Зураг (Native ERP Roadmap)

> **Төлөв:** Phase 1 (Санхүүгийн цөм — COA + finance_transactions + AR aging + НӨАТ) ба
> Phase 2-ийн AP цөм (нийлүүлэгч + нэхэмжлэх + төлөлт→disbursement + өглөгийн тойм) хэрэгжсэн.
> Үлдсэн: худалдан авалтын захиалга (PO), бүрэн AP aging bucket. Phase 3–4 хүлээгдэж буй.
> **Хандлага:** Vertmon Hub дотор **native** ERP модулиуд (Supabase хүснэгт + dashboard UI),
> CRM-тэй нягт холбоотой. Гадны системд биш.
> **Хамрах модулиуд:** (1) Санхүү & Нягтлан, (2) Худалдан авалт & Зардал, (3) Төслийн өртөг & Төсөв.
> *(HR/Цалин одоохондоо хамрахгүй.)*

---

## Context (Яагаад)

CRM хэсэг (Phase 1–5) дууссан — харилцагч, lead, чанарын скоринг, lead→гэрээ юүлүүр бэлэн
(`docs/crm-audit-roadmap.md`). Одоо **ERP буюу ар талын санхүү/үйл ажиллагааны** хэсгийг
босгоно. Vertmon бол үл хөдлөх хөрөнгийн **барилгын компанийн** (Moncon) платформ тул ERP нь
борлуулалтын **орлого/авлага**-аас гадна **зардал/худалдан авалт** болон **төслийн өртөг/ашиг**-ийг
нэг дор хянах ёстой.

**Одоо байгаа санхүүгийн суурь (дахин ашиглана):**
- `property_contracts` — `total_price` (орлого), `paid_amount`, `balance` (авлага), `penalty_amount`,
  `payment_condition`, `sales_channel`, `sales_manager`. → **Орлого + AR**.
- `payment_schedules` — суулт (installment), `due_date`, `status` (pending/paid/overdue/partial). → **AR хуваарь/цуглуулалт**.
- `projects` (`20260318_add_projects_table.sql`) — блок/давхар/тоот, статус. → **Cost center (өртгийн төв)**.
- `properties` — бараа материал (нэгж/үнэ).
- Reporting view-ууд: `contract_statistics`, `manager_performance`, `contract_payment_status`.

**Дутуу (ERP давхарга нөхнө):** нийлүүлэгч/vendor, худалдан авалт (PO), зардал/bill (AP),
дансны төлөвлөгөө (Chart of Accounts), НӨАТ, төслийн төсөв vs гүйцэтгэл, P&L, мөнгөн урсгал.

**Дахин ашиглах загвар/хэрэгслүүд:**
- Excel import: `src/app/api/dashboard/contracts/route.ts` (xlsx, `getUserShop`, `supabaseAdmin`).
- Төлбөрийн API/cron: `src/app/api/dashboard/contracts/[id]/payments/route.ts`,
  `src/app/api/cron/overdue-check/route.ts` (CRON_SECRET + `sendPushNotification`).
- UI primitives: `PageHeader`, `FilterBar/FilterSelect`, `StatBar/StatTile`, `Badge`, `Card`.
- RBAC: `src/lib/rbac.ts` — шинэ модуль (finance, procurement, project-costing) нэмж role-оор хаалт.
- Валидаци: `src/lib/validations/schemas.ts` (Zod + `validateBody`).
- Migrations: `supabase/migrations/`, dev port 3001, бүх UI текст Монголоор, `@/` alias.

---

## Зарчим (бүх фазад мөрдөнө)
- **Дахин давхардуулахгүй:** орлого/AR-ыг `property_contracts`/`payment_schedules` дээр суурилуулна,
  шинэ хүснэгт зэрэгцээ "орлого" хадгалахгүй.
- **Cost center = project_id:** гэрээ, зардал, bill бүрийг боломжтой бол `project_id`-тэй холбоно
  (Phase 3 өртгийн тооцоонд).
- **Account = Chart of Accounts:** мөнгөн гүйлгээ бүр данс (`account_id`)-тай.
- **Эхлээд cash-basis** (бодит орлого/зарлага), давхар бичилтийн GL-ийг ирээдүйд (сонголтоор).
- **shop_id-ээр хязгаарлана**, бүх API `getUserShop` + RBAC-аар хамгаална.

---

## ERP Замын Зураг (Фазууд)

### Phase 1 — Санхүүгийн цөм: Дансны төлөвлөгөө + Авлага (AR) + Кассын дэвтэр 🔴 ЭХНИЙ
**Зорилго:** бодит орлого/цуглуулалтыг албажуулж, авлагын дүр зургийг гаргах.
1. **Chart of Accounts** (`chart_of_accounts`): `code, name, type` (asset/liability/equity/income/expense),
   `parent_id`, `is_active`. Анхдагч Монгол дансны жагсаалтыг seed хийнэ.
2. **Кассын/гүйлгээний дэвтэр** (`finance_transactions`): бодит мөнгөн орлого/зарлага —
   `shop_id, date, type(receipt/disbursement), amount, account_id, method(cash/bank/barter/mortgage),
   contract_id?, payment_schedule_id?, project_id?, vat_amount?, note`. Гэрээний төлбөр төлөгдөхөд
   энд бичигдэж, `payment_schedules.paid_amount`/`status`-тай уялдана (одоо байгаа payments API-г өргөтгөнө).
3. **НӨАТ талбар:** `property_contracts`-д `vat_rate`/`vat_amount` (10%) нэмж, орлогоос НӨАТ салгана.
4. **AR aging:** гэрээний `balance` + `payment_schedules.due_date`-аас 0-30/31-60/61-90/90+ aging тайлан.
5. **Санхүүгийн dashboard** (`/dashboard/finance`): хүлээн зөвшөөрсөн орлого, цугласан, авлага, aging.

Шинэ файлууд: `chart_of_accounts`/`finance_transactions` migrations,
`api/dashboard/finance/transactions/route.ts`, `api/dashboard/finance/ar-aging/route.ts`,
`app/dashboard/finance/page.tsx`. Дахин ашиглах: contracts payments API, StatBar.

### Phase 2 — Худалдан авалт & Зардал (AP)
**Зорилго:** зардал/нийлүүлэгчийн тал — мөнгөн урсгалын гарах талыг бүртгэх.
1. **Vendors** (`vendors`): нэр, регистр, утас, банк, дансны мэдээлэл.
2. **Худалдан авалтын захиалга** (`purchase_orders` + `purchase_order_lines`): vendor, project_id,
   мөр бүр (тоо ширхэг, үнэ, account_id), нийт, статус (draft/approved/received/billed).
3. **Зардал/Нэхэмжлэх** (`vendor_bills` + `bill_lines` эсвэл нэгдсэн `expenses`):
   vendor, project_id, account_id, дүн, НӨАТ, огноо, төлбөрийн статус. PO-оос үүсгэх боломжтой.
4. **AP aging + bill төлөх:** bill төлөгдөхөд `finance_transactions` (disbursement) бичнэ.
   Overdue cron-ыг (`cron/overdue-check` загвар) AP-д өргөтгөж нэхэмжлэх хугацаа хэтрэлтийг сануулна.
5. **Зөвшөөрлийн урсгал (RBAC):** зардал батлах эрхийг role-оор (finance_manager) хаалт.

Шинэ файлууд: vendors/PO/bills migrations, `api/dashboard/procurement/**`,
`app/dashboard/procurement/page.tsx`. Дахин ашиглах: Excel import, cron+push, Zod.

### Phase 3 — Төслийн өртөг & Төсөв
**Зорилго:** төсөл бүрийн орлого vs өртөг → ашиг (margin), төсөв vs гүйцэтгэл.
1. **Гэрээ↔төсөл холбоос:** `property_contracts`-ийг `project_id`-тэй холбоно (block_name → projects
   зураглал эсвэл гар сонголт). Зардал/bill аль хэдийн `project_id`-тэй (Phase 2).
2. **Төслийн төсөв** (`project_budgets` + `budget_lines`): төсөл, ангилал (account_id), төлөвлөсөн дүн.
3. **Roll-up тооцоо:** төсөл тус бүрд орлого (contracts), цугласан мөнгө, зардал (bills/expenses),
   margin = орлого − өртөг; төсөв vs гүйцэтгэл хазайлт.
4. **Төслийн P&L тайлан + dashboard widget** (`/dashboard/finance/projects`).

Шинэ файлууд: budgets migrations, `api/dashboard/finance/project-pnl/route.ts`,
`app/dashboard/finance/projects/page.tsx`. Дахин ашиглах: `projects` хүснэгт, contract_statistics view.

### Phase 4 — Санхүүгийн тайлан, НӨАТ, мөнгөн урсгал + RBAC/audit
**Зорилго:** удирдлагын болон нягтлангийн түвшний тайлан.
1. **Компанийн P&L** (орлого − зардал), төсөл/сувгаар задаргаа.
2. **Мөнгөн урсгал:** `finance_transactions`-аас орлого − зарлага (огноо/сараар), forecast нь
   `payment_schedules` (ирэх авлага) + ирээдүйн bill (өглөг)-ээс.
3. **НӨАТ тайлан:** гэрээ + bill дээрх НӨАТ-аас сар бүрийн НӨАТ-ын тайлан.
4. **AR/AP нэгдсэн aging** + **нягтланд Excel export** (native ч гэсэн гадагшаа гаргах гүүр).
5. **RBAC + audit trail:** `finance`, `procurement`, `project-costing` модулиудыг `rbac.ts`-д нэмж,
   `accountant`/`finance_manager` role; санхүүгийн бичилт бүрд `created_by`/audit лог.

Шинэ файлууд: `api/dashboard/finance/reports/**`, export route, `rbac.ts` өргөтгөл, audit migration.

---

## Хойшлуулсан (ирээдүйн сонголт)
- **Давхар бичилтийн GL** (debit/credit журнал) — одоо cash-basis-аас эхэлнэ.
- **Банкны тулгалт (reconciliation)** — банкны хуулгатай finance_transactions тулгах.
- **Олон валют, татварын дэлгэрэнгүй (суутгал)**, тайлант үе хаах (period close).
- **HR/Цалин/комисс** — энэ хүрээнд биш (manager_performance view-д суурилж дараа нэмж болно).

---

## Баталгаажуулалт (фаз тус бүрийг хэрэгжүүлэхэд)
- **Ерөнхий:** `npm run typecheck && npm run build && npm run test`; бүх UI Монгол; dev порт 3001;
  шинэ API-ууд `getUserShop` + RBAC-аар хамгаалагдсан эсэх.
- **Phase 1:** гэрээнд төлбөр бүртгэхэд `finance_transactions` + `payment_schedules` шинэчлэгдэж,
  AR aging зөв гарахыг шалгах; НӨАТ салгалт зөв.
- **Phase 2:** vendor → PO → bill → төлөлт хийхэд AP aging буурч, `finance_transactions`
  (disbursement) бичигдэхийг шалгах.
- **Phase 3:** төсөлд гэрээ+зардал онооход margin ба төсөв vs гүйцэтгэл зөв тооцоологдохыг шалгах.
- **Phase 4:** P&L/мөнгөн урсгал/НӨАТ тайлан гар тооцоотой таарах; Excel export нээгдэх;
  finance модулийг зөвхөн зөвшөөрөгдсөн role харах.

## Эрсдэл / тэмдэглэл
- **Excel import давхардал:** одоо байгаа гэрээний Excel import нь `paid_amount`-ыг агуулдаг тул
  Phase 1-д кассын дэвтэртэй давхар тооцохоос болгоомжлох (import-ыг "эхний үлдэгдэл" гэж үзэх).
- **block_name → project зураглал** тодорхой бус байж болзошгүй — Phase 3-д гар баталгаажуулалт өгөх.
- **Нягтлан бодох нарийвчлал:** cash-basis-аас эхэлж, шаардвал GL рүү шатлан хөгжүүлэх (over-engineer хийхгүй).
- multi-tenant биш — нэг компанийн нэг shop гэж үзнэ (CRM-тэй адил).
