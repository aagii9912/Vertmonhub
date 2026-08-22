# Борлуулалтын менежер яагаад ашиглаж чадахгүй байна вэ — асуудлын жагсаалт ба план

> Огноо: 2026-08-22 · Хамрах хүрээ: Vertmon Hub (82k мөр код, 132 API route, 36 dashboard хуудас)
> Зорилго: «Менежер AI чаттай ярилцаад өдрийн ажлаа хийдэг, дээд удирдлага ажлын явцыг хардаг» орчинд шилжих.
> Энэ баримт дахь асуудал бүрийг кодоос шууд уншиж баталгаажуулсан (файл:мөр иш татсан).

---

## 1. Хураангуй

Асуудал нь «функц дутуу» биш. **Гурван үндсэн шалтгаан** байна:

**А. Хэрэглэгчийн ХЭН БЭ гэдэг гинж тасарсан.** Менежер нэвтэрч чадна — гэхдээ системийн хувьд «менежер» болж чаддаггүй. `handle_new_user` триггерийг `20260322_drop_auth_triggers.sql`-д устгасан ба «профайлыг апп код үүсгэнэ» гэж тэмдэглэсэн боловч Google/Facebook-ээр нэвтрэх зам (`src/app/auth/callback/route.ts`) профайл ч, дүр ч, shop гишүүнчлэл ч үүсгэдэггүй. Үр дүнд нь хүн нэвтэрсэн мөртлөө `getUserShop()` **null** буцааж (`src/lib/auth/supabase-auth.ts:195-197`), бүх дашбоардын API 401 өгнө. Урилгаар орсон ч `user_profiles.full_name` ↔ `sales_managers.name` **яг тэмдэгт тэмдэгтээрээ таарах** ёстой (`src/lib/sales/manager-identity.ts:48`) — «Б.Батбаяр» vs «Батбаяр» зөрөхөд `managerName` буруу болж, `my-stats` чимээгүйхэн **хоосон** буцаана (`src/app/api/dashboard/my-stats/route.ts:122-123`). Хэрэглэгч «дата алга» гэж хардаг, **яагаад гэдгийг хэлдэг газар нэг ч байхгүй**.

**Б. Бүтээгдэхүүн нь ажлын гадаргуу биш, админ консол хэлбэртэй.** Хажуугийн цэс ~40 очих цэгтэй (`src/lib/navigation/workspaces.ts`), менежер өдөр бүр хийдэг хамгийн түгээмэл үйлдэл — «шинэ үйлчлүүлэгч бүртгэх» — нь **40 талбартай** маягт (`src/app/dashboard/leads/new/page.tsx`). Утсаар ярьж байхдаа хийх түргэн бүртгэлийн зам байхгүй.

**В. AI нь ажлын туслах биш, дэлгүүрийн аналитик туслах.** 39 tool-ын аль нь ч менежерийн өдрийн ажилд тохирдоггүй: `list_leads`-д **«миний»** гэсэн шүүлт байхгүй (`src/lib/ai/data-assistant/tools.ts:62-73`), уулзалт **уншдаг tool огт байхгүй**, ажил/сануулга/дагаж ажиллах tool байхгүй. Түүнчлэн AI зам нь `permissions.modules`-ыг **огт шалгадаггүй** — зөвхөн `canWrite/canDelete/super_admin` (`src/lib/ai/data-assistant/index.ts:52-61`), тул маркетингийн хүн чатаар гэрээ, санхүүгийн дата уншиж чадна.

**Нэмэлт:** Хяналтын давхаргад **өгөгдлийн эх сурвалж байхгүй**. `data_audit_log` хүснэгт бэлэн боловч 132 API route-оос **зөвхөн 1** нь бичдэг. Удирдлагын харагдац (`manager_performance`) зөвхөн **үр дүнг** (гэрээ/орлого) хардаг тул гэрээ хийгээгүй, гэхдээ идэвхтэй ажилласан менежер удирдлагад **огт харагдахгүй** (`src/components/dashboard/TeamOverview.tsx:155-156`).

---

## 2. Асуудлын жагсаалт

### 2.1 Блокер — өнөөдөр ашиглах боломжгүй болгож буй зүйлс

| # | Асуудал | Нотолгоо | Нөлөө |
|---|---------|----------|-------|
| B1 | **OAuth-аар нэвтэрсэн хүнд `user_profiles` үүсдэггүй** | `src/app/auth/callback/route.ts` — зөвхөн `exchangeCodeForSession` + redirect; триггерийг `supabase/migrations/20260322_drop_auth_triggers.sql`-д устгасан | Google/Facebook товч login хуудсан дээр байгаа (`auth/login/page.tsx:139,158`). Дарсан хүн профайлгүй → нэр `null` → бүх хувийн харагдац хоосон |
| B2 | **OAuth хэрэглэгчид `shop_members` мөр үүсдэггүй → бүх API 401** | `getUserShop()` `src/lib/auth/supabase-auth.ts:192-197` — хандах shop олдохгүй бол `null` | Нэвтэрсэн боловч дашбоард бүхэлдээ хоосон/алдаатай. Тайлбар мессеж байхгүй |
| B3 | **OAuth хэрэглэгчид `user_roles` мөр үүсдэггүй → `viewer` болдог** | RBAC fallback `src/lib/rbac.ts` | Хажуугийн цэс бараг хоосон, бичих эрхгүй |
| B4 | **2+ shop байхад урилга shop холбохгүй** | `src/app/api/admin/users/invite/route.ts:73-76` — `if (shopRows.length === 1)` үед л холбоно | Олон төсөлтэй болмогц урьсан менежер бүр түгжигдэнэ |
| B5 | **Нэрийн яг таарц шаарддаг identity** | `matchRosterEntry` `src/lib/sales/manager-identity.ts:48` — `r.name === fullName` (trim/case/цэг үл тооцно) | «Б.Батбаяр» ≠ «Батбаяр» → `isManager:false`, лийд/уулзалт өөр дээр нь бүртгэгдэхгүй |
| B6 | **Нэр бөглөөгүй бол `full_name = email` болдог** | `src/app/api/admin/users/route.ts:176-180`, `invite/route.ts:59-62` — `full_name \|\| email` | `managerName` = имэйл → бүртгэлтэй хэзээ ч таарахгүй → чимээгүй тэг |
| B7 | **Хоосон байдал ба эрхийн алдааг ялгадаггүй** | `my-stats/route.ts:122-123` `emptyPayload(...)`, widget бүр ердийн `EmptyState` | Менежер «дата алга» гэж бодоод бууж өгнө. Оношилгооны мессеж хаана ч алга |
| B8 | **Шинэ үйлчлүүлэгч бүртгэх 40 талбартай маягт, түргэн зам байхгүй** | `src/app/dashboard/leads/new/page.tsx` — 40 input/select | Утсаар ярьж байхдаа ашиглах боломжгүй |
| B9 | **AI-д «миний лийд» гэж асуух боломжгүй** | `list_leads` tool-д менежерийн параметр байхгүй `tools.ts:62-73` | «Миний өнөөдрийн лийдүүд» гэхэд дэлгүүр даяарх лийд ирнэ |
| B10 | **Уулзалт уншдаг AI tool огт байхгүй** | `tools.ts`-д `list_viewings` алга; зөвхөн `schedule_viewing`, `delete_viewing` | «Маргааш хэдэн уулзалттай вэ?» гэдэг хамгийн энгийн асуултад хариулж чадахгүй |
| B11 | **AI орчестраторт 60 секундын хана** | `src/app/api/ai-assistant/route.ts:27` `maxDuration = 60`; agent-ууд `orchestrator/index.ts:74-82` **дараалан** ажиллана | Planner + 3 agent (tool дуудлага бүхий) + synthesizer = 5+ дараалсан Gemini дуудлага. Timeout-д амархан унана |
| B12 | **Streaming байхгүй — хэрэглэгч спиннер ширтэнэ** | `ai-assistant/page.tsx:406` `isLoading` спиннер; route нь `NextResponse.json` буцаана | 30-60 сек чимээгүй хүлээлт. Гар утсан дээр «эвдэрсэн» мэт мэдрэгдэнэ |

### 2.2 Өндөр — рольд суурилсан ажлын орчин болгоход саад

| # | Асуудал | Нотолгоо | Нөлөө |
|---|---------|----------|-------|
| H1 | **AI зам модулийн эрхийг шалгадаггүй** | `src/lib/ai/data-assistant/index.ts:52-61` — зөвхөн `canWrite/canDelete/super_admin`. `perms.modules` AI-д хаана ч ашиглагдаагүй | Маркетингийн менежер чатаар гэрээ/санхүүгийн дата уншина. RBAC-ийг тойрсон нүх |
| H2 | **Planner рольд үл хамааран agent сонгоно** | `src/lib/ai/orchestrator/planner.ts` — `role` шүүлт байхгүй | sales_manager `finance-analyst`-руу замчлагдаж болно |
| H3 | **Ажил/сануулгын AI tool байхгүй** | `tools.ts`-д `create_task`/`complete_task`/`set_reminder` алга | `user_tasks` хүснэгт, `/api/cron/task-reminders` cron бэлэн байтал чатаар ашиглах боломжгүй |
| H4 | **«Өнөөдөр юу хийх вэ» гэсэн ойлголт байхгүй** | Ийм tool ч, API ч алга | Визионы гол хэрэглээ бүтэхгүй |
| H5 | **Уулзалт өөрчлөх/дүгнэх боломжгүй** | Зөвхөн `schedule_viewing` + `delete_viewing` | Цаг хойшлуулах = устгаад дахин үүсгэх. Уулзалтын үр дүн бүртгэгдэхгүй |
| H6 | **Лийд шилжүүлэх (reassign) tool байхгүй** | `bulk_update_leads` статус л сольдог | «Энэ үйлчлүүлэгчийг Болдод шилжүүл» бүтэхгүй |
| H7 | **Дуудлага/харилцааны түүх бүртгэдэг бүтэц байхгүй** | Зөвхөн `add_lead_note` (чөлөөт текст) | Ажлын явц хэмжигдэхгүй |
| H8 | **`/marketing/*` middleware-ийн хамгаалалтад ороогүй** | `src/middleware.ts:8` `protectedRoutes = ['/dashboard','/admin']`; `src/app/marketing/layout.tsx` нь хамгаалалтгүй client layout | Нэвтрээгүй хүнд 11 хуудас нээгдэнэ (API нь 401 өгдөг тул дата алдагдахгүй, гэхдээ эвдэрсэн бүрхүүл харагдана) |
| H9 | **Маркетингийн цэс бүхэлдээ эрхийн шалгалтгүй** | `workspaces.ts:212-241` — 15 цэс `module: ''`; `Sidebar.tsx:64` `module === '' → үргэлж харагдана` | `viewer` хүртэл маркетингийн бүх хуудсыг хардаг |
| H10 | **RBAC-д `tasks` модуль алга** | `ALL_MODULES` `src/lib/rbac.ts:37-54` — `tasks` байхгүй; цэс нь `module: 'dashboard'` (`workspaces.ts:114`) | Ажлын хэсгийг рольоор тохируулах боломжгүй |
| H11 | **`sales_managers` бүртгэл зөвхөн нэг админ хуудаснаас бөглөгддөг** | Бичих цорын ганц цэг `src/app/api/admin/sales-targets/route.ts:157-160` | Хүн урих ба бүртгэлд нэмэх нь тусдаа хоёр алхам — админ мартвал B5/B6 давтагдана |

### 2.3 Дунд — хяналт ба найдвартай байдал

| # | Асуудал | Нотолгоо | Нөлөө |
|---|---------|----------|-------|
| M1 | **Аудитын дэд бүтэц бэлэн боловч ашиглагдаагүй** | `data_audit_log` (`20260616130000`) байгаа; `recordAudit` дуудлага **132 route-оос 1-д** (`src/app/api/dashboard/customers/route.ts:10`) | «Ажлын явцыг хянана» гэдэгт өгөгдөл байхгүй |
| M2 | **Удирдлагын харагдац зөвхөн үр дүнтэй** | `manager_performance` (гэрээ/орлого); `TeamOverview.tsx:155-156` «Гэрээнд менежер бүртгэгдсэнээр энд харагдана» | Идэвхтэй ажиллаж буй, гэхдээ гэрээ хийгээгүй менежер огт харагдахгүй |
| M3 | **Захирлын дайджест нэг имэйл рүү явдаг** | `src/app/api/cron/director-digest/route.ts:20` `process.env.DIGEST_EMAIL` | Олон удирдлагад хуваарилах, апп дотор харах боломжгүй |
| M4 | **`ai_audit_log`-д RLS асаалттай, policy байхгүй** | `supabase/migrations/20260608230000_ai_audit_log.sql:17` — `ENABLE ROW LEVEL SECURITY`, policy нэг ч алга | Хэрэглэгчийн клиентээр огт уншигдахгүй (service-role л ажиллана) |
| M5 | **AI-д хатуу rate limit — 20 хүсэлт/мин** | `src/lib/utils/rate-limiter.ts:222`; `middleware.ts:24,50-51` | Чат үндсэн ажлын гадаргуу болбол багийн хэмжээнд хүрэлцэхгүй |
| M6 | **Тестийн хамрах хүрээ нимгэн** | 26 тест файл / 82k мөр; API route-уудад бараг тест алга | Фаз бүрийн регресс эрсдэл өндөр |
| M7 | **`/dashboard/tasks` бүх рольд нээлттэй** | `workspaces.ts:114` `module: 'dashboard'` | Эрхийн загварт нийцэхгүй (H10-тэй хос) |

### 2.4 Аль хэдийн зөв ажиллаж байгаа зүйлс (эвдэхгүй байх)

- **Чатын түүх хадгалагдана**, RLS зөв — `ai_conversations`/`ai_messages` (`20260322000000`, `user_id = auth.uid()` policy-тэй).
- **Баталгаажуулалтын урсгал** (confirm-gate) бодитоор ажиллаж, `logAiAudit` жинхэнэ гүйцэтгэл дээр бичдэг.
- **Атрибуци стамп** — `create_*` tool-ууд `userName`-ыг серверээс шийддэг (`runAgent.ts:155`).
- **Cron дэд бүтэц бэлэн** — 12 cron (`vercel.json`), түүний дотор `task-reminders`, `director-digest`.
- **`data_audit_log` схем зөв** (actor_id, entity, action, changes) — зөвхөн дуудлага дутуу.
- **Migration-д тэсвэртэй унших** — багана байхгүй үед 500 өгөхгүй degrade хийдэг.

---

## 3. Зорилтот зураглал

### 3.1 Гол зарчим: чат бол ажлын гадаргуу, дашбоард бол баталгаажуулалт

Одоо: менежер **40 цэснээс** зөвийг нь олж, **40 талбар** бөглөнө.
Зорилт: менежер **нэг талбарт** «Болд гэдэг хүн залгасан, 3 өрөө, 250 сая хүртэл, маргааш 2 цагт үзнэ» гэж бичихэд AI лийд үүсгэж, уулзалт товлож, сануулга тавина.

### 3.2 Роль тус бүрийн ажлын гадаргуу

| Роль | Чатаар хийх гол ажил | Хэрэгтэй шинэ tool |
|------|----------------------|--------------------|
| Борлуулалтын менежер | «Өнөөдөр юу хийх вэ», лийд бүртгэх, дуудлага тэмдэглэх, уулзалт товлох/хойшлуулах/дүгнэх, сануулга тавих, сарын KPI-аа авах | `get_my_day`, `list_my_leads`, `list_viewings`, `update_viewing`, `complete_viewing`, `log_activity`, `create_task`, `complete_task`, `set_reminder`, `get_my_kpi` |
| Маркетингийн менежер | Сувгийн гүйцэтгэл, төсвийн байдал, контент/пост ноорог, кампанит ажлын үр дүн | (ихэнх нь бэлэн) + `list_my_campaigns`, `log_spend` |
| Санхүү | Гэрээ, төлбөр, өр, цуглуулалт | (бэлэн) + `list_overdue`, `record_payment` |
| Гүйцэтгэх удирдлага | «Батбаяр энэ сар яаж байна», «хэн 3 хоног идэвхгүй байна», «зорилтод хүрэхгүй хэн бэ» | `get_team_activity`, `get_manager_progress`, `get_anomalies` |

### 3.3 Хяналтын давхарга: үр дүн биш, ЯВЦ

```
Үйлдэл бүр (UI ба AI аль аль нь)
        ↓  recordAudit()
   activity_log  (хэн · юуг · хэзээ · ямар entity)
        ↓
   ┌────────────┬─────────────────┬──────────────────┐
   │ Менежерийн │ Удирдлагын      │ Аномали cron     │
   │ «миний өдөр»│ шууд явцын самбар│ (0 идэвх, зорилт │
   │            │ + AI асуулт      │  эрсдэлд, хүйтэн │
   │            │                  │  лийд) → push    │
   └────────────┴─────────────────┴──────────────────┘
```

### 3.4 Яагаад энэ нь дахин бичих биш вэ

Одоо байгаа орчестратор (**planner → agents → synthesizer**) яг тохирсон бүтэц. Гурван зүйл нэмэгдэнэ:
1. **Tool-ын багц** — «дэлгүүрийн аналитик»-аас «менежерийн ажил» руу (шинэ 14 tool).
2. **Роль-ухаалаг замчлал** — planner `perms.modules`-ыг оролтоор авна, `executeDataTool` модулиар хаана.
3. **Идэвхийн лог** — `recordAudit`-ыг route-уудад тарааж, хяналтын давхаргад өгөгдөл өгнө.

---

## 4. Гүйцэтгэлийн план

### Фаз 0 — ЯАРАЛТАЙ ЗАСВАР (1 долоо хоног)
**Зорилго:** өнөөдөр менежер орж ажиллаж чаддаг болгох.

1. **Нэвтрэлтийн гинжийг бүрэн болгох** — `src/app/auth/callback/route.ts`-д session солилцсоны дараа `ensureUserBootstrap(userId)` дуудах: `user_profiles` upsert (`raw_user_meta_data.full_name`-аас), `user_roles` анхдагч, ганц shop байвал `shop_members`. Шинэ файл: `src/lib/auth/bootstrap.ts`. → B1, B2, B3
2. **Нэрийн таарцыг тэсвэртэй болгох** — `matchRosterEntry`-д `normalizeName()` (trim, олон зай нэг болгох, жижиг үсэг, «.»/«,» хасах) нэмэх. `src/lib/sales/manager-identity.ts`. Тест нэмнэ. → B5
3. **`full_name = email` fallback-ыг зогсоох** — админ маягтад нэрийг **заавал** болгож, `full_name || email`-ыг устгах (`admin/users/route.ts:178`, `invite/route.ts:60`). → B6
4. **Урилгад shop сонголтыг заавал болгох** — 2+ shop үед `shop_id` шаардах, өгөөгүй бол 400. `invite/route.ts:73-76`. → B4
5. **Оношилгооны туузыг нэмэх** — `GET /api/dashboard/mode` хариунд `diagnostics: { hasProfile, hasShop, hasRole, rosterLinked }` буцааж, дутуу үед дашбоардын дээд талд монгол хэлээр тайлбар + «Админд хандах» товч харуулах. `ManagerDashboard.tsx`. → B7
6. **`/marketing/*`-ыг `protectedRoutes`-д нэмэх** ба `workspaces.ts`-ийн 15 `module: ''`-ийг `marketing-roi` болгох. → H8, H9

**Амжилтын хэмжүүр:** шинэ хүн Google-ээр нэвтрээд 60 секундын дотор өөрийн нэртэй, дүртэй, shop-той самбар хардаг; identity зөрвөл дэлгэц дээр яг юу дутуугийн тайлбар гарна.

### Фаз 1 — AI-аар ажиллах суурь (2-3 долоо хоног)
**Зорилго:** менежерийн өдрийн ажил чатаар бүтнээрээ хийгдэнэ.

1. **«Миний» хамрах хүрээтэй унших tool** — `list_my_leads`, `list_viewings` (огноо/менежерээр), `get_my_day` (өнөөдрийн уулзалт + хугацаа хэтэрсэн лийд + дуусах ажил), `get_my_kpi`. `src/lib/ai/data-assistant/tools.ts` + `functions.ts`. Хэрэгжүүлэлт нь `resolveManagerIdentity`-г эх сурвалж болгоно. → B9, B10, H4
2. **Ажлын tool** — `create_task`, `complete_task`, `set_reminder` (`user_tasks` дээр, `remind_at` cron аль хэдийн бэлэн). → H3
3. **Уулзалтын бүтэн мөчлөг** — `update_viewing` (цаг/байр өөрчлөх), `complete_viewing` (үр дүн: ирсэн/ирээгүй/сонирхолтой/татгалзсан). Миграци: `property_viewings`-д `outcome`, `outcome_note`. → H5
4. **Идэвх бүртгэх** — `log_activity` tool + `recordAudit`-ыг лийд/уулзалт/гэрээний бүх write route-д тараах. → H7, M1
5. **Лийд шилжүүлэх** — `reassign_lead` tool (`sales_manager_name` + мэдэгдэл). → H6
6. **Түргэн бүртгэлийн зам** — дашбоардын толгойд нэг мөрт «түргэн бичих» талбар, чат руу дамжуулна. Мөн `leads/new` маягтыг «үндсэн 5 талбар + дэлгэрэнгүй нээх» болгож хуваах. → B8
7. **Streaming + timeout** — `/api/ai-assistant` дээр SSE/stream нэмж, planner→agent→synthesizer явцыг шууд харуулах. `maxDuration`-ыг 300 болгож, agent-уудыг `Promise.all`-аар зэрэгцүүлэх (`orchestrator/index.ts:74-82`). → B11, B12

**Амжилтын хэмжүүр:** менежер нэг өдрийн ажлаа (лийд бүртгэх → уулзалт товлох → дуудлага тэмдэглэх → сануулга тавих → маргаашийн хуваарь харах) **зөвхөн чатаар**, дашбоардын аль ч хуудас нээхгүйгээр гүйцэтгэнэ.

### Фаз 2 — Ролиуд (2 долоо хоног)
**Зорилго:** борлуулалтаас гадна маркетинг, санхүү, удирдлага чатаар ажиллана.

1. **Модулийн эрхийг AI зам дээр хэрэгжүүлэх** — `executeDataTool`-д `TOOL_MODULE_MAP` нэмж, `perms.modules` шалгах (`src/lib/ai/data-assistant/index.ts:52`). → H1
2. **Planner-ыг роль-ухаалаг болгох** — зөвшөөрөгдсөн agent-уудын жагсаалтыг `perms`-ээс бүрдүүлж planner-т дамжуулах; сервер талд дахин шалгах. → H2
3. **`executive` роль + agent** — `rbac.ts`-д роль нэмэх; `AGENTS`-д `executive-overseer` (баг, явц, аномали унших tool-той, бичих эрхгүй).
4. **RBAC-д `tasks` модуль нэмэх**, `workspaces.ts`-ийн цэсийг түүнд холбох. → H10, M7
5. **Маркетинг/санхүүгийн дутуу tool** — `log_spend`, `list_overdue`, `record_payment`.

**Амжилтын хэмжүүр:** маркетингийн ролийн хэрэглэгч чатаар гэрээний дата асуухад эелдэг татгалзал авна; удирдлагын ролийн хэрэглэгч «Батбаяр энэ сар яаж байна» гэж асуухад бодит хариу авна.

### Фаз 3 — Хяналтын давхарга (2-3 долоо хоног)
**Зорилго:** «дээд удирдлага ажлын явцыг хянаж шалгана» бодитоор ажиллана.

1. **`activity_log` нэгтгэсэн харагдац** — `data_audit_log` дээр суурилсан `GET /api/dashboard/activity?manager=&from=&to=`; шинэ хуудас `/dashboard/reports/activity`.
2. **Шууд явцын самбар** — `TeamOverview`-г үр дүн + **идэвх** (өнөөдрийн дуудлага, уулзалт, шинэ лийд) хослуулж, гэрээгүй менежерийг ч харуулна. → M2
3. **Удирдлагын AI tool** — `get_team_activity`, `get_manager_progress`, `get_anomalies`.
4. **Аномали cron** — `/api/cron/anomaly-watch` (өдөр бүр): 0 идэвхтэй менежер, 3+ хоног хүрээгүй лийд, зорилтын 50%-д хүрэхгүй байх эрсдэл → удирдлагад push.
5. **Дайджестийг олон хүлээн авагчтай болгох** — `DIGEST_EMAIL` env-ийн оронд `executive` рольтой хэрэглэгчид рүү. → M3
6. **`ai_audit_log`-д RLS policy нэмэх** (админ/удирдлага уншина). → M4

**Амжилтын хэмжүүр:** удирдлага нэг дэлгэцээс менежер бүрийн өнөөдрийн идэвх + сарын явцыг харна; идэвхгүй менежер автоматаар анхааруулга үүсгэнэ.

### Фаз 4 — Бататгал (үргэлжилсэн)
1. Онбординг визард (эхний нэвтрэлт: нэр баталгаажуулах → бүртгэлд холбогдох → push зөвшөөрөл).
2. PWA-г бүрэн болгох (`public/manifest.json`, `public/sw.js` бэлэн — install prompt, offline shell нэмэх).
3. Шинэ tool болон identity замд тест (`resolveManagerIdentity` нормчлол, `TOOL_MODULE_MAP` эрх, `get_my_day` цуглуулагч). → M6
4. AI rate limit-ийг рольоор ялгах (чат үндсэн гадаргуу болсны дараа 20/мин хүрэлцэхгүй). → M5
5. `CLAUDE.md`-г шинэчлэх — `finance`, `procurement`, `customer-service`, `competitor-research` модулиуд баримтжаагүй байна.

---

## 5. Шинэ схем (migration ноорог)

```sql
-- supabase/migrations/20260822120000_work_os_foundation.sql

-- 1) Уулзалтын үр дүн (Фаз 1)
ALTER TABLE property_viewings
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(24),        -- attended|no_show|interested|rejected|rescheduled
  ADD COLUMN IF NOT EXISTS outcome_note TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2) Харилцааны түүх — дуудлага/уулзалт/мессеж (Фаз 1)
CREATE TABLE IF NOT EXISTS lead_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  lead_id       UUID,
  customer_id   UUID,
  actor_id      UUID,                    -- нэвтэрсэн хэрэглэгч
  actor_name    TEXT,                    -- канон менежерийн нэр
  kind          VARCHAR(24) NOT NULL,    -- call|meeting|message|note|status_change
  outcome       VARCHAR(24),             -- reached|no_answer|callback|...
  note          TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_act_shop_time ON lead_activities(shop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_act_actor     ON lead_activities(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_act_lead      ON lead_activities(lead_id, occurred_at DESC);
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
-- Бичих: service role (API route-ууд). Унших: shop гишүүн (policy Фаз 3-д).

-- 3) Ажлыг ХАРИУЦУУЛАХ боломж (одоо user_tasks зөвхөн хувийн)
ALTER TABLE user_tasks
  ADD COLUMN IF NOT EXISTS assigned_by  UUID,          -- үүрэг өгсөн удирдлага
  ADD COLUMN IF NOT EXISTS source       VARCHAR(16) DEFAULT 'self'; -- self|manager|ai|system
-- RLS: өөрийн + assigned_by = auth.uid() уншина.

-- 4) Идэвхийн лог — data_audit_log-ийг өргөтгөх (шинэ хүснэгт биш)
ALTER TABLE data_audit_log
  ADD COLUMN IF NOT EXISTS actor_name  TEXT,
  ADD COLUMN IF NOT EXISTS surface     VARCHAR(12) DEFAULT 'ui'; -- ui|ai|webhook|cron
CREATE INDEX IF NOT EXISTS idx_data_audit_actor_time
  ON data_audit_log(actor_id, created_at DESC);

-- 5) ai_audit_log — RLS policy дутуу (M4)
CREATE POLICY "Shop members read ai audit" ON ai_audit_log
  FOR SELECT USING (
    shop_id IN (SELECT shop_id FROM shop_members WHERE user_id = auth.uid())
  );

-- 6) Аномалийн бүртгэл (Фаз 3)
CREATE TABLE IF NOT EXISTS work_anomalies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  manager_name TEXT,
  kind         VARCHAR(32) NOT NULL,   -- no_activity|cold_lead|target_risk|overdue_contract
  severity     VARCHAR(8) DEFAULT 'warn',
  detail       JSONB DEFAULT '{}'::jsonb,
  detected_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, manager_name, kind, detected_on)
);
ALTER TABLE work_anomalies ENABLE ROW LEVEL SECURITY;
```

**Тэмдэглэл:** шинэ хүснэгт нэмэхээс өмнө өргөтгөхийг эрхэмлэв — `data_audit_log` (идэвх), `user_tasks` (хариуцуулах), `property_viewings` (үр дүн) аль хэдийн зөв бүтэцтэй. Шинээр зөвхөн `lead_activities` (дуудлагын түүх) ба `work_anomalies` (хяналт) хэрэгтэй.

---

## 6. Эрсдэл ба шийдвэр гаргах цэгүүд

| # | Шийдвэр | Сонголт | Зөвлөмж |
|---|---------|---------|---------|
| 1 | **Чат эхэнд үү, маягт эхэнд үү** | (а) Чат үндсэн, дашбоард нөөц; (б) Хоёулаа тэнцүү | (а). Гэхдээ маягтыг **устгахгүй** — AI буруу ойлгосон үед унах зам хэрэгтэй |
| 2 | **Баталгаажуулалт хэр хатуу байх** | (а) Одоогийн бүх бичилтэд; (б) Зөвхөн устгах/санхүү; (в) Ролиор | (б). Лийд бүртгэх бүрд «зөвшөөрөх» дарах нь чатыг маягтаас удаан болгоно |
| 3 | **Дуудлага бүртгэх арга** | (а) Гараар «Болдод залгасан» гэж бичих; (б) Утасны интеграци (телефони) | (а)-гаар эхэлнэ. Телефони интеграци нь тусдаа төсөл, Монголын оператортой хамаарна |
| 4 | **Хяналт хэр «том ах» байх** | (а) Зөвхөн ажлын үр дүн; (б) Бүх үйлдлийн лог удирдлагад ил | Багтай урьдчилан ярилцах — итгэл алдвал менежерүүд системээс зайлсхийнэ. Эхлээд нэгтгэсэн тоо, дэлгэрэнгүйг зөвхөн шаардлагатай үед |
| 5 | **Google/Facebook нэвтрэлт үлдээх үү** | (а) Үлдээгээд bootstrap засах; (б) Зөвхөн админ урилга | (а). Хамгийн хялбар нэвтрэлт — гэхдээ Фаз 0-ийн 1-р зүйлгүйгээр энэ нь блокер хэвээр |
| 6 | **Gemini загварын хурд/өртөг** | Олон agent × tool дуудлага = хариу удаан | Фаз 1-д agent зэрэгцүүлэлт + streaming хийхгүй бол чат үндсэн гадаргуу болж чадахгүй |

---

## 7. Дараагийн алхам

Фаз 0-ийн 6 зүйл нь бие даасан, нэг долоо хоногийн ажил бөгөөд **бусад бүх фазын урьдчилсан нөхцөл**. Түүнийг хийхгүйгээр Фаз 1-ийн шинэ tool-ууд ч мөн адил хоосон дата буцаана (учир нь бүгд `resolveManagerIdentity`-д тулгуурлана).

Эхлэх дараалал: **B1→B2→B3** (нэвтрэлтийн bootstrap) → **B5/B6** (нэрийн нормчлол) → **B7** (оношилгоо) → **B4/H8/H9**.
