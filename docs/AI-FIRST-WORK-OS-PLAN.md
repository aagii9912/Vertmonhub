# Vertmon Hub — Асуудлын бүртгэл ба гүйцэтгэлийн план

> Огноо: 2026-08-22 · Хамрах хүрээ: бүх код (132 API route, 36 dashboard хуудас, 39 AI tool, 7 orchestrator agent)
> Зорилго: «Борлуулалтын менежер AI чаттай ярилцаад өдрийн ажлаа хийдэг, маркетинг/санхүү нэгддэг, гүйцэтгэх удирдлага явцыг хардаг» орчинд шилжих.
> Энэ баримт дахь **асуудал бүрийг кодоос уншиж баталгаажуулсан** (файл:мөр). Баталгаажаагүй таамаглалыг оруулаагүй. Ажиллаж байгаа зүйлийг зориуд асуудал болгож бичээгүй.

---

## 1. ХУРААНГУЙ

Борлуулалтын менежер өнөөдөр энэ бүтээгдэхүүнийг ашиглаж чадахгүй байгаа нь функц дутсандаа биш — **өдрийн ажлыг нь хүлээж авдаг оролт байхгүй, хийсэн ажил нь өөрийнх нь нэр дээр буудаггүй, гар утсан дээрх үндсэн гадаргуу нь физикээр эвдэрсэн** гэсэн гурван шалтгаанд байна. Менежер өглөө лид рүү залгаад «залгасан, маргааш 2 цагт үзнэ» гэж бичих газар системд байхгүй (`leads.next_followup_at`-д бичих зам огт байхгүй, дуудлагын бүртгэлийн хүснэгт байхгүй), тиймээс тэмдэглэл нь утсандаа буцаж очдог. Гэрээ хаагаад «Гэрээ болгох» товч дарахад үүсэх гэрээний мөрөнд менежерийн нэр ч, үнэ ч бичигдэхгүй тул борлуулалт нь бүх орлогын харагдацаас алга болдог (`supabase/migrations/20260608150000_link_contracts_to_leads.sql:28-34`). Дашбоард дээрх тоо тэг харагдвал яагаад гэдгийг хэлэх газар байхгүй — учир нь ажлыг чөлөөт текст нэрээр (`sales_manager_name`) холбодог бөгөөд «Б.Батсайхан» ба «Батсайхан» хоёр өөр хүн болно, харин анхааруулах ёстой баннер нь үхмэл код (`src/app/api/dashboard/my-stats/route.ts:262` дээр `onboarding: false` хатуу бичигдсэн). Гар утсан дээр AI чат нээхэд 288px өргөнтэй ярианы хажуу самбар нээлттэй гарч чатанд ~87px үлдэж, бичих талбар нь доод навигацийн 88px-ийн ард дардаг тул асуулт бичих ч боломжгүй (`src/app/dashboard/ai-assistant/layout.tsx:9`, `src/components/dashboard/MobileNav.tsx:107-108`, `src/components/ai-assistant/ConversationSidebar.tsx:146`). Хэрэв тэнд хүрсэн ч гэсэн 39 tool-ын аль нь ч «миний лийдүүд» гэж шүүж чаддаггүй, уулзалт уншдаг tool байхгүй, ажил/сануулга тавих tool байхгүй тул чат нь маягтаас илүү муу хувилбар болдог. Эцэст нь удирдлагын талд **үйл ажиллагааны өгөгдөл огт байхгүй** — зөвхөн үр дүн (гэрээ, орлого) бүртгэгддэг тул «Болд өчигдөр юу хийсэн бэ?» гэдэгт бүтээгдэхүүн хариулах чадваргүй.

**Гурван үндсэн шалтгаан:**

- **А. Гар утсан дээрх ажлын гадаргуу ажиллахгүй.** AI чат нь зарлагдсан үндсэн интерфейс мөртлөө утсан дээр бичих боломжгүй, орох зам нэг, гарах зам байхгүй, хариу нь 60 секундын хананд чимээгүй унадаг.
- **Б. «Хэн бэ» гэдэг гинж чөлөөт текст нэр дээр тогтдог.** Нэвтрэлт (OAuth) профайл/эрх/shop үүсгэдэггүй, AI зам ба дашбоард зам хоёр өөр нэр тодорхойлогч ашигладаг, бүртгэлийн нэрийг засах/нэгтгэх боломжгүй, 9 модуль сервер талдаа огт шалгагддаггүй. Үр дүн нь чимээгүй тэг ба итгэл алдалт.
- **В. Систем үр дүнг бүртгэдэг, ажлыг бүртгэдэггүй.** Дуудлага, тэмдэглэл, дагалт, үйл ажиллагааны бүртгэл гэсэн өдрийн гогцоо ямар ч хүснэгтэд буудаггүй. Ийм учраас менежерт дадал үүсэхгүй, удирдлагад харах зүйл үлдэхгүй, AI-д хэлэх үнэн байхгүй.

---

## 2. АСУУДЛЫН ЖАГСААЛТ

Нийт **29 асуудал**. Ноцтой байдал: **Блокер** = өнөөдөр ашиглалтыг зогсоож байна · **Өндөр** = ажил хийгдэх боловч итгэл/зорилгыг эвдэж байна · **Дунд** = мэдэгдэхүйц саад. Хэлбэр: *[эвдэрсэн]* = байгаа боловч буруу ажиллана · *[байхгүй]* = функц огт байхгүй · *[ашиглах боломжгүй]* = байгаа боловч хүрэх/ашиглах боломжгүй.

### А бүлэг — Гар утсан дээрх ажлын гадаргуу (7)

| # | Асуудал | Ноцтой | Нотолгоо | Нөлөө |
|---|---------|--------|----------|-------|
| А1 | **AI чат утсан дээр ашиглах боломжгүй** *[эвдэрсэн]* — composer доод навигацийн ард, ярианы sidebar 288px анхдагчаар нээлттэй | **Блокер** | `src/app/dashboard/ai-assistant/layout.tsx:9` (`h-[calc(100vh-var(--header-h))] overflow-hidden`) + `src/components/dashboard/MobileNav.tsx:107-108` (`fixed bottom-0 h-[72px]` + `pb-safe` ≥88px) + `src/components/ai-assistant/ConversationSidebar.tsx:146` (`w-72`, responsive хамгаалалтгүй) + `src/app/dashboard/ai-assistant/page.tsx:70` (`useState(false)`) | 390px дэлгэцэнд чатанд ~87px үлдэж, илгээх товч 88px-ийн зурвасын ард. Зарлагдсан үндсэн интерфейс эхний секундэд хаагдана |
| А2 | **AI ажлын талбараас гарах зам байхгүй; борлуулалтын доод самбарт AI байхгүй** *[ашиглах боломжгүй]* | Өндөр | `src/lib/navigation/workspaces.ts:102-106` (sales mobilePrimary-д AI алга), `:176-200` (AI workspace-д `/dashboard` холбоос алга), `src/components/dashboard/Sidebar.tsx:139,166` (WorkspaceSwitcher зөвхөн `hidden md:flex`), `MobileNav.tsx:35-46` | AskAIHero (`ManagerDashboard.tsx:108`) л оруулна, буцах зам нь браузерын back — PWA (`manifest.json:7 standalone`) дээр тэр ч байхгүй |
| А3 | **AI хариунд streaming, цуцлах товч, deadline байхгүй** *[ашиглах боломжгүй]* | Өндөр | `src/app/api/ai-assistant/route.ts:27` (`maxDuration = 60`), `src/lib/ai/orchestrator/index.ts:74` (agent-ууд **дараалан**), `planner.ts:16` MAX_STEPS=3 × `runAgent.ts:133` 6 tool round, `retry.ts:5-19` (429 дээр ~10.5s backoff), `page.tsx:109-121` (ганц fetch, AbortController алга) | 2-3 агентын асуулт 30-60 сек чимээгүй хүлээлт → 504 → «Уучлаарай, алдаа гарлаа». Хэрэглэгчийн асуулт хадгалагдахгүй (route.ts:104-152 нь дууссаны дараа бичдэг) |
| А4 | **Rate limit зөвхөн IP-д суурилсан** *[эрсдэлтэй]* | Өндөр | `src/lib/utils/rate-limiter.ts:331-334` (`key = clientId:routeType`, user/shop ордоггүй), `:222-225` (strict 20/мин, standard 100/мин), `src/middleware.ts:46-59` | Нэг оффисын NAT-аар 5 менежер орвол минутад нийт 20 AI хүсэлт хуваана. Дашбоардын нэг ачаалалт хэд хэдэн API дуудлага хийдэг тул квот хурдан дуусч бүгдэд англи 429 буцна |
| А5 | **Алдааны мессежүүд ялгагдахгүй, ихэнх нь англи** *[эвдэрсэн]* | Дунд | `src/app/dashboard/ai-assistant/page.tsx:120,144-145` (429/403/504 бүгд нэг текст), `src/lib/utils/rate-limiter.ts:283-284` («Too Many Requests»), `src/hooks/useMyStats.ts:89` («My stats failed: 500») + `src/components/providers/QueryProvider.tsx:10-14` (Error.message-ийг шууд toast), session дуусахад `ManagerDashboard.tsx:76-91` «Сүлжээгээ шалгана уу» | Эрхгүй / квот дууссан / сүлжээ муу / session дууссан — ялгагдахгүй. Менежер «програм эвдэрсэн» гэж ойлгоно, админд юу гэж хэлэхээ мэдэхгүй |
| А6 | **Push мэдэгдэл: зөвшөөрөл асуудаггүй, дарахад үргэлж нүүр хуудас, icon 404** *[эвдэрсэн]* | Дунд | `public/sw.js:98` (`data: { url: '/' }` — илгээгчийн url-ыг хаядаг), `:82,96` (`/icons/icon-192x192.png` — `public/icons/` фолдер байхгүй), `src/hooks/usePushNotifications.ts:78` (`requestPermission` зөвхөн `NotificationButton.tsx:16`-аас), 3 cron url илгээдэг (`task-reminders:70`, `channel-expiry:60`, `ai-digest:41`) | Утсыг ажлын гадаргуу болгодог хоёр функц (сануулга, гар дамжуулалт) анхдагчаар унтраалттай; ирсэн ч буруу хуудас нээнэ |
| А7 | **Мобайл жагсаалт ба хүнд хариу** *[ашиглах боломжгүй]* — гэрээ/харилцагч десктоп хүснэгт, гэрээний API 1600+ мөрийг бүтнээр илгээнэ, customer-health 1000 мөрд чимээгүй тасарна | Дунд | `src/app/dashboard/contracts/page.tsx:439` ба `customers/page.tsx:778` (`md:hidden` карт хувилбар алга; `leads/page.tsx:600,614`-д бий), `src/app/api/dashboard/contracts/route.ts:36-40,64-75` (`select('*')` + бүх хуудсыг цуглуулна), `src/app/api/dashboard/customer-health/route.ts:27-58` (`.limit()` байхгүй, JS-д тоолно) | Талбай дээрх 4G-д гэрээний хуудас 15-40 сек; 1000-аас олон харилцагчтай төсөлд удирдлагын тоо **буруу** харагдана |

### Б бүлэг — «Хэн бэ» гэдэг гинж: бүртгэл, нэр, эрх (9)

| # | Асуудал | Ноцтой | Нотолгоо | Нөлөө |
|---|---------|--------|----------|-------|
| Б1 | **OAuth-аар нэвтэрсэн хүнд профайл/роль/shop үүсдэггүй** *[эвдэрсэн]* | **Блокер** | `src/app/auth/callback/route.ts:7,33,36` (зөвхөн `exchangeCodeForSession` + redirect, DB бичилт 0), `supabase/migrations/20260322_drop_auth_triggers.sql:7-8` (триггер устгасан, «апп код үүсгэнэ» гэсэн), `src/app/auth/login/page.tsx:50-84,139-160` (Google/Apple/Facebook товчнууд байсаар) | Хүчинтэй session-той мөртлөө: `/api/dashboard/stats` тэг, `/api/dashboard/tasks` 401 «Нэвтрэх шаардлагатай», `/api/ai-assistant` 403. Урилгын зам (`invite/route.ts:58-82`) provisioning хийдэг тул энэ нь зориудын шийдвэр биш, орхигдол |
| Б2 | **Нэр бүртгэлтэй таарахгүй бол бүх тоо тэг — анхааруулга нь үхмэл код** *[эвдэрсэн]* | Өндөр | `src/app/api/dashboard/my-stats/route.ts:262` (`onboarding: false` хатуу), `:259-260` (`inRoster`/`hasAccount` илгээгддэг ч `src/hooks/useMyStats.ts:51`-ээс цааш **хэн ч уншдаггүй**), `src/components/dashboard/my/ManagerDashboard.tsx:163-178` (баннер зөвхөн `data.onboarding`-д), `src/lib/sales/manager-identity.ts:45-51` (`r.name === fullName`, trim/case нормчлолгүй), мөн адил `kpi-report/route.ts:276` | «Б.Батсайхан» vs «Батсайхан» → бүрэн бүтэн харагдацтай тэг самбар, тайлбар нэг ч газар байхгүй. Профайл хуудас байхгүй тул хэрэглэгч ямар нэрээр хайгдаж байгаагаа **харах ч, засах ч** боломжгүй (`find src/app -iname '*profile*'` = 0; header нэр нь `AuthContext.tsx:219` `user_metadata`, attribution нь `user_profiles.full_name`) |
| Б3 | **AI зам ба дашбоард зам хоёр өөр нэр тодорхойлогчтой** *[эвдэрсэн]* | Өндөр | AI: `src/lib/ai/data-assistant/functions.ts:716-720` `resolveSalesManagerName` = `full_name \|\| email` (бүртгэлд огт хандахгүй), `src/app/api/ai-assistant/route.ts:92`, `action/route.ts:77`. Дашбоард: `src/app/api/dashboard/leads/route.ts:6,124,143` `resolveManagerIdentity` (бүртгэлийн каноник нэр) | **Яг зорилтот урсгал чимээгүй эвдэрнэ**: чатаар үүсгэсэн лид тухайн хүний «Миний самбар», `manager_performance`, KPI тайланд харагдахгүй. `user_profiles` мөргүй бол лид `bat@gmail.com` нэр дээр мөнхөрнө |
| Б4 | **Attribution нь uuid биш чөлөөт текст; бүртгэлийн мөрийг нэрээр түлхүүрлэсэн, нэр солих боломжгүй** *[эрсдэлтэй]* | Өндөр | `src/app/api/dashboard/my-stats/route.ts:145,157,170` (`.eq('sales_manager_name'/'sales_manager', targetName)`), `supabase/migrations/20260701140000:73-82` (`UNIQUE(shop_id,name)`, `user_id` nullable), `src/app/api/admin/sales-targets/route.ts:158-160` (`onConflict: 'shop_id,name'` — нэр солиход **шинэ мөр**), `leads.assigned_to uuid` (`20260128210000:133`) хэн ч уншдаггүй/бичдэггүй, `sales_manager_name`-д индекс байхгүй | Excel импортын нэг зай эсвэл кирилл зөрүү менежерийн бүх самбарыг чимээгүй тэг болгоно. Админы «+ Батсайхан» чип дарахад **хоёр дахь** бүртгэлийн мөр үүсч менежер хоосон мөр рүү шилжинэ; засах ганц арга нь SQL |
| Б5 | **Нэвтрэлтийн сүүлийн миль: нууц үг сэргээх байхгүй, урилгын холбоос унана, deep link алдагдана** *[байхгүй/эвдэрсэн]* | Өндөр | `grep resetPasswordForEmail src/` = 0; `src/app/auth/login/page.tsx` (165 мөр, «мартсан» холбоос алга, footer: «админтай холбогдоно уу»). `src/app/auth/callback/route.ts:7` зөвхөн `code` уншина — `token_hash`/`verifyOtp`/fragment зохицуулалт байхгүй; `:36` хатуу `/dashboard` (redirect_url/next уншихгүй) | Түгжигдсэн менежер super_admin компьютер нээх хүртэл гацна. Урилгын хэрэглэгч нууц үггүй тул fallback ч байхгүй |
| Б6 | **Сервер талын модуль шалгалт дутуу: 9 модуль хамгаалалтгүй, /marketing бүхэлдээ RBAC-аас гадуур** *[эвдэрсэн]* | Өндөр | 132 route-оос 26-д `requireModule*`; 114 нь `supabaseAdmin` (RLS хамгаалалт байхгүй). Хамгаалагдаагүй: dashboard, viewings, customers, customer-service, inbox, reports-leads, surveys, ai-settings, settings. Жишээ: `src/app/api/dashboard/customers/route.ts:14` (GET дээр зөвхөн `getUserShop()`), `export/excel/route.ts:8-18`, `src/app/api/dashboard/team/route.ts` (шалгалт огт байхгүй). `src/middleware.ts:8` `protectedRoutes = ['/dashboard','/admin']` — `/marketing` алга; `src/lib/navigation/workspaces.ts:206-241` (12 зүйл `module: ''`); `api/marketing/channels/route.ts:50` ба `contracts/route.ts:63` POST дээр **write guard огт байхгүй** | `viewer` роль CRM-ийн бүх утасны дугаарыг GET хийж, Excel-ээр татаж, маркетингийн суваг/гэрээ **үүсгэж** чадна. Хажуугийн цэс нуудаг, API өгдөг |
| Б7 | **AI orchestrator роль мэддэггүй** *[эвдэрсэн]* | Өндөр | `src/lib/ai/orchestrator/planner.ts:18-20` (VALID_IDS глобал AGENT_LIST-ээс, context авдаггүй), `orchestrator/index.ts:75` (plan→execute хооронд эрхийн шалгалт алга), `runAgent.ts:25-36` (зөвхөн `canWrite`/`canDelete`/`super_admin`; **readTools модулиар огт шүүгддэггүй**), `types.ts:23-42` (`AgentDefinition`-д `modules` талбар байхгүй), `rbac.ts:118-130` (marketing роль-д `contracts` байхгүй) vs `agents.ts:67-81` (finance-analyst гэрээ уншина/үүсгэнэ) | Маркетингийн хэрэглэгч чатаар бүх гэрээний бүртгэл (үйлчлүүлэгчийн нэр, үнэ, үлдэгдэл) авна. Энэ нь ролиудыг чат руу нэмэх **шилжилтийн блокер** |
| Б8 | **Роль/эрхийн бүртгэл бүрэн бус** *[эвдэрсэн]* | Дунд | (а) DB seed ↔ код зөрүү: `20260315100000_dynamic_roles.sql:132-181` (admin-д customer-service/finance/procurement алга; sales_manager-д customer-service алга) ба **client/server split-brain** — `src/lib/rbac.ts:184-190` анон клиент үүсгэдэг, RLS `TO authenticated` (`20260315100000:42-44,53-55`) тул сервер **статик мапыг**, браузер **DB-г** уншина. (б) `finance_manager`/`accountant`/`super_admin` `roles` хүснэгтэд байхгүй тул `/admin/users`-аас **томилох боломжгүй** (`api/admin/roles/route.ts:18-23`). (в) `admin` роль `/admin`-д ороход хаалттай (`src/lib/admin/auth.ts:103-119`) хэдий ч `rbac.ts:96` `canAccessAdmin: true`. (г) `user_roles`-д `shop_id` байхгүй, `UNIQUE(user_id)` (`20260309110000:5-12`) | Цэсний зүйл алга болно, API нээлттэй хэвээр. Санхүүгийн багт роль олгох боломжгүй; бүх түгжээ ганц super_admin дээр төвлөрч Б1/Б2/Б5-ийг минутын оронд өдрийн ажил болгоно |
| Б9 | **Хяналтын эрхийн дүрэм буруу: борлуулдаг захирал хаагдаж, viewer бусдын утас хардаг** *[эвдэрсэн]* | Дунд | `src/app/api/dashboard/mode/route.ts:38-40` (`canViewTeam = !personal && ...` — бүртгэлд байгаа удирдлага хувийн горимд түгжигдэнэ), `src/app/dashboard/page.tsx:29-30` (эрт `return`), мөн адил `my-stats:117-118`, `kpi-report:95-96`. Нөгөө талд `viewer` (`rbac.ts:141-142` modules `['dashboard','reports']`) → `canViewOthers = true` → `my-stats:143,283` `recentLeads`-д **customer_phone** орно | Борлуулалт хийдэг захирал (энэ зах зээлийн хамгийн түгээмэл хэлбэр) леадерборд, drill-in-ээ алдана; «Зөвхөн харагч» бусдын үйлчлүүлэгчийн утсыг үзнэ |

### В бүлэг — Өдрийн ажил бүртгэгддэггүй (13)

| # | Асуудал | Ноцтой | Нотолгоо | Нөлөө |
|---|---------|--------|----------|-------|
| В1 | **«Гэрээ болгох» товч эзэнгүй, үнэгүй гэрээ үүсгэнэ** *[эвдэрсэн]* | **Блокер** | `supabase/migrations/20260608150000_link_contracts_to_leads.sql:28-34` — INSERT баганын жагсаалтад `sales_manager` **байхгүй**, `total_price := NEW.conversion_value`; `src/app/dashboard/leads/page.tsx:258-263` `JSON.stringify({})` илгээнэ → `conversion_value` null. Дараагийн үр дагавар: `20260707140000:31,49` `WHERE sales_manager IS NOT NULL` тул мөр `manager_performance` ба `manager_monthly_sales`-аас **хасагдана**; `my-stats/route.ts:170` `.eq('sales_manager', targetName)` | Хаасан борлуулалт бүх орлогын харагдацад алга: MyKpiCards «Идэвхтэй гэрээ»/«Сарын борлуулалт», MyTargetWidget, `/dashboard/reports/kpi`, удирдлагын леадерборд. Менежер гэрээ хийж, систем тэг гэж мэдээлнэ |
| В2 | **`leads.next_followup_at`-д бичих зам огт байхгүй** *[эвдэрсэн]* | **Блокер** | 5 газар уншина (`src/lib/dashboard/my-stats.ts:97-110`, `leads/pipeline/page.tsx:137,139,205,211`, `cron/morning-leads/route.ts:40`, `my-stats/route.ts:143`, `data-assistant/functions.ts:131`), бичих зам 0: `api/dashboard/leads/[id]/route.ts:27-46` зөвхөн status/notes/lost_reason/sales_manager_name; `CreateLeadSchema` (`leads/route.ts:78-91`) талбаргүй; `leads/new/page.tsx:26-36` огнооны хяналт алга; AI tool байхгүй | Pipeline дээрх бүх нээлттэй лид мөнхөд «Дараагийн алхамгүй» → хамгийн том анхааруулга 100% чимээ. «Өнөөдөр хэнд залгах вэ?» гэдэгт **бүтцийн хариу байхгүй** — CRM-ийг өдрийн дадал болгодог цорын ганц гогцоо байхгүй |
| В3 | **Дуудлага/тэмдэглэлийн бүртгэл огт байхгүй** *[байхгүй]* | **Блокер** | `grep 'activity_log\|lead_interactions' supabase/ src/` = 0. `leads.last_contact_at` (`20260128210000:124`) хэн ч бичдэггүй (триггер ч алга). Лидийн Sheet (`leads/page.tsx:749-905`) — тэмдэглэл бичих талбар байхгүй, «Мессеж» товч (`:875-878`) onClick-гүй. `service_logs` GET нь `lead_id`-гаар шүүж чаддаггүй (`api/dashboard/service-logs/route.ts:22-40`). AI-ийн `addLeadNote` (`functions.ts:613-630`) нь ганц `leads.notes` текст баганад залгаж бичдэг, зохиогч бүртгэдэггүй (`userName` параметр ч байхгүй), PATCH нь бүхэлд нь дарж бичнэ (`leads/[id]/route.ts:37`). `data_audit_log` бүхэл системд **1 endpoint**-оос бичигддэг (`customers/route.ts:165,234`), уншдаг endpoint 0 | Залгасны дараа бичих газар байхгүй → өдрийн ажил утсан дээр үлдэнэ, гар дамжуулалт боломжгүй. Удирдлагад «Болд өчигдөр юу хийсэн бэ?» гэдэгт **хариулах өгөгдөл байхгүй** |
| В4 | **AI-д хувийн хамрах хүрээ байхгүй — «миний лийдүүд» гэж шүүх параметр алга** *[байхгүй]* | **Блокер** (зорилгын) | `src/lib/ai/data-assistant/tools.ts:62-73` (`list_leads`: status/source/urgency/limit), `functions.ts:128-152` (`fetchLeads`-д `sales_manager_name` огт байхгүй), `get_dashboard_stats` (`tools.ts:13-21`), `get_customer_insights` (`:86-98`) — менежерийн аргумент алга. 39 tool-оос менежерээр шүүдэг нь ганцхан `list_contracts.sales_manager` (`:108`). Нэр нь бэлэн байгаа — `runAgent.ts:110-112` prompt-д, `:155` `executeDataTool(..., ctx.userName)` — гэхдээ **read tool-д хүлээж авах параметр байхгүй** | «Өнөөдөр би хэнтэй холбогдох ёстой вэ?» гэхэд компани даяарх 10 санамсаргүй лид ирнэ, өөрийнх нь самбартай хэзээ ч тулахгүй, бусад менежерийн pipeline асуусан хүн бүрт нээгдэнэ. Зорилтот загварын гол цоорхой |
| В5 | **AI-д ажил/сануулга/дагалт/KPI/багийн tool байхгүй** *[байхгүй]* | Өндөр | `grep 'user_tasks\|kpi-report\|my-stats\|manager-identity' src/lib/ai/` = 0 — хувийн ажлын бүх давхарга orchestrator-т үл үзэгдэнэ. `tools.ts`-д task/followup/сануулга tool алга; `get_kpi_report` байхгүй (гэтэл `src/lib/dashboard/kpi-report.ts` `formatKpiReportText` бэлэн, unit-тест хийгдсэн); `get_manager_performance`/`list_managers` байхгүй. `addLeadNote` нь `last_contact_at`-г шинэчилдэггүй (`functions.ts:628`) | «Маргааш 10 цагт Болдод залгахаа сануул», «Миний энэ сарын гүйцэтгэл», «Батын гүйцэтгэл ямар байна?» — бүгд tool-гүй. Чатаар ажилласан тусам дашбоардын дагалтын өгөгдөл хуучирна |
| В6 | **Уулзалтын давхарга: AI зөвхөн бичнэ, байргүй уулзалт татгалзана, хуудас нь RBAC алгасана, аналитик нь менежергүй** *[байхгүй/эвдэрсэн]* | Өндөр | `tools.ts:341-355` `schedule_viewing` + `:461-473` `delete_viewing` — `list_viewings`/`update_viewing`/`complete_viewing` **байхгүй**; `delete_viewing` нь `runAgent.ts:30-32`-т `canDelete:false` үед бүр зарлагддаггүй тул sales_manager цуцалж чадахгүй. `functions.ts:892,898` байр заавал шаардана — гэтэл `20260630140000_meeting_nullable_property.sql` нь оффисын зөвлөгөөг зөвшөөрөхөөр `property_id`-г nullable болгосон; `meeting_type` бичигддэггүй (`functions.ts:918-924`). `viewings/page.tsx:101,127,142,175,213` браузераас шууд бичнэ (RBAC шалгалтгүй). `meeting_monthly_summary` (`20260624130000:28-44`) — `sales_manager_name` хэмжээсгүй, `deleted_at` шүүлтгүй, `security_invoker` тохируулаагүй | «Маргааш 2 цагт оффис дээр уулзана» → «Байр олдсонгүй». «Өнөөдөр ямар уулзалттай вэ?» → tool байхгүй. Уулзалт бол энэ бүтээгдэхүүний ЦОРЫН ГАНЦ бодит идэвхийн хэмжүүр — тэр нь менежерээр задлагдахгүй бөгөөд устгасан уулзалтыг давхар тоолно |
| В7 | **AI бодит нөөцийг харахгүй; байрны хайлт хаана ч байхгүй** *[эвдэрсэн]* | Өндөр | `src/app/dashboard/properties/page.tsx:3-7` — бүхэлдээ `redirect('/dashboard/properties/blocks')`, комментод `properties` хоосон, нөөц нь `property_units` гэж бичсэн. Гэтэл `functions.ts:102-104` `fetchProperties` нь `properties`-оос уншина (`index.ts:71` `list_properties`), `property_units`-д **read tool байхгүй** (зөвхөн бичих `updateUnitStatus`, `functions.ts:564,588`). Blocks хуудсанд хайлтын `<input>` байхгүй (`blocks/page.tsx`, 72px хавтангууд `max-h-[560px] overflow-y-auto` дотор), `/api/dashboard/units/route.ts:34-36` зөвхөн phase/block/category, уулзалтын байр сонгогч хоосон хүснэгтээс хайна (`viewings/page.tsx:866-872`) | «3 өрөө, 300 сая хүртэл юу үлдсэн бэ?» → хоосон эсвэл зохиомол хариу. AI нь **харж чаддаггүй нөөцөө өөрчилж чадна**. «201-440 тоот» гэхэд утсан дээр гараар хавтан ширтэнэ; уулзалт `property_id` null-аар хадгалагдана |
| В8 | **Устгасан e-commerce эх сурвалж амьд: орлого `orders`-оос уншигдана** *[эвдэрсэн]* | Өндөр | `functions.ts:52-75` `fetchDashboardStats` нь `orders`-оос 2 удаа уншиж `totalRevenue`/`totalOrders` буцаана — `property_contracts` огт хөндөхгүй. Энэ tool 7 агентын 5-д бүртгэлтэй (`agents.ts:32,74,89,102,125`). `list_orders` (`tools.ts:23-32`) ба `get_product_stats` (`:34-43`, property-expert-т `agents.ts:45`) — `products`/`orders` нь CLAUDE.md-ийн «устгасан» жагсаалтад | Орлого/гэрээний тоо асуувал **0₮** гэж итгэлтэй хариулна. Менежер эсвэл захирал үүнийг нэг удаа хармагц системийн бүх тоонд итгэхээ болино |
| В9 | **6 write tool баталгаажуулалт/audit-гүй ажиллана; tool тайлбарууд «ЗӨВХӨН Super Admin» гэж худал** *[эрсдэлтэй/эвдэрсэн]* | Өндөр | `src/lib/ai/data-assistant/index.ts:82-87` — `updatePropertyStatus`, `updateUnitStatus`, `updatePropertyPrice`, `updateLeadStatus`, `addLeadNote`, `processContractAction` нь **`confirm` параметргүй** дуудагдана (доорх create/delete нь дамжуулдаг), impl-үүд нь шууд мутац хийнэ (`functions.ts:515-548,596-630,659-710`). `logAiAudit` нь `index.ts:113` дээр `&& confirm` гэж хаалттай, `runAgent.ts:155` үргэлж `confirm=false` → эдгээр 6 үйлдэл **аудитад хэзээ ч бүртгэгдэхгүй**. Тайлбарууд: `tools.ts:5,198,227,240,253,266` «ЗӨВХӨН Super Admin» — гэтэл `rbac.ts:99-105` sales_manager-т `canWrite:true` | Аюулгүй байдлын загвар урвуу: «лид үүсгэе» зөвшөөрөл асуудаг, «үнийг 380 сая болго» чимээгүй бичдэг, буцаах ч, ул мөр ч байхгүй. Нөгөө талд менежерийн хамгийн түгээмэл 2 үйлдэл (төлөв солих, тэмдэглэл) худал «эрхгүй» шошготой тул санамсаргүй татгалзана |
| В10 | **Хувийн самбарын доорх жагсаалтууд компанийн хэмжээнд** *[ашиглах боломжгүй]* | Өндөр | Эх сурвалж нь scope-той (`my-stats/route.ts:145,157,170`), очих газар нь биш: `leads/page.tsx:126` `useState('all')`, `leads/pipeline/page.tsx:357` (`pageSize=1000`, менежерийн шүүлтгүй), `viewings/page.tsx:101-106` (shop даяар), `contracts/page.tsx:104-114` (`manager` параметр илгээдэггүй хэдий ч API дэмждэг — `contracts/route.ts:43`). Widget холбоос нүцгэн: `src/lib/dashboard/my-stats.ts:108,124` | «Идэвхтэй лид 4» дарахад олон зуун мөр гарна. Хувийн тоо ба жагсаалт хэзээ ч тулахгүй → самбар итгэл төрүүлэхээ болино |
| В11 | **Бүртгэлийн оролт: түргэн бүртгэл байхгүй, суваг default гажуудуулна, гэрээг зөвхөн Excel-ээр оруулна** *[байхгүй]* | Өндөр | FAB байхгүй (`AppShell.tsx:37-42`, `ManagerDashboard.tsx:130-160` — үүсгэх товчгүй); walk-in зам 4 шат гүнд (`workspaces.ts:102-106,129`) бөгөөд `viewings/page.tsx:193` `source: 'other'` хатуу; `leads/new/page.tsx:30` `source: 'website'` анхдагч. Гэрээ: `contracts/page.tsx:285-300` үндсэн үйлдэл нь «Excel импорт», «Гэрээ үүсгэх» нь зөвхөн PDF хэвлэгч (`contracts/generate/page.tsx:296`, POST байхгүй); `api/dashboard/contracts/route.ts:94-118` POST нь **зөвхөн файл** хүлээж авдаг; менежер нь чөлөөт текст `<input>` (`contracts/page.tsx:765-767`). Эхний өдөр: 6 widget-ийн `EmptyState`-үүдийн аль нь ч `action`-гүй (`MyLeadsWidget.tsx:92-94`, `MyViewingsWidget.tsx:43`, `MyTargetWidget.tsx:79-81`) | Ширээн дээр үйлчлүүлэгч байхад хамгийн хурдан зам 4 навигаци цаана, нэр нь цаасан дээр үлдэнэ. Аль замаар ч бүртгэсэн **сувгийн атрибуци гажна** (walk-in→«Бусад», утас→«Вэбсайт») → marketing-roi, reports/leads, төсвийн модуль бүхэлдээ буруу. Шинэ менежерийн эхний session 0 бичлэгээр дуусна |
| В12 | **Хэмжилт бүх цаг үеийн: леадерборд all-time, drill-in өнгөрсөнг харуулахгүй** *[эвдэрсэн]* | Өндөр | `20260707140000:14-33` `manager_performance` — огнооны нөхцөл огт байхгүй; `api/dashboard/reports/manager-performance/route.ts:23-27` `GET()` (Request ч авдаггүй тул параметр уншиж чадахгүй); `TeamOverview.tsx:48-52` параметргүй, гэтэл дээрх ахиц бар нь `:88-109` **тухайн жилийн** тоо → нэг картан дээр хоёр өөр цаг. `my-stats/route.ts:158` уулзалтыг `dayStart`-аас хойш (өчигдрийн уулзалт **байхгүй**), `:165-174` гэрээнд огнооны хязгаар алга, `periodStart` (`:133`) ганцхан газар (`:266`) ашиглагдана; `activeLeads`/`leadsByStatus` мөн үечлэлгүй бөгөөд 500 мөрөөр таслагдсан (`:146`) | «Сар» сонгоход 6 картын 1 нь өөрчлөгдөнө. Менежер өчигдөр хийсэн уулзалтаа хаанаас ч олохгүй. Ажлаас гарсан менежер их дүнтэй хуучин гэрээгээрээ мөнхөд 🥇 барина — шууд бонусын буруу шийдвэрт хүргэнэ |
| В13 | **Удирдлагын идэвхтэй давхарга байхгүй: хувийн зорилт, аномали сануулга, зөв хүлээн авагч, ажил оноох, аудит** *[байхгүй]* | Дунд | Хувийн зорилт: `20260701140000:15` `DROP TABLE sales_targets` → зөвхөн `team_sales_targets(shop_id,year,month)`; MyTargetWidget нь үүнийг **шударгаар** «багийн %» гэж бичдэг (`:37-41,58-60`) тул худал биш, харин хувь хүний квот **хаана ч байхгүй**. Аномали: 12 cron-ы аль нь ч менежерээр тооцдоггүй (`cron/*`), `leads.stage_changed_at` (`20260630120000:11`) зөвхөн badge-д. Хүлээн авагч: `cron/director-digest/route.ts:20` `process.env.DIGEST_EMAIL` + `:22` бүх shop-ийн давталт → нэг хаяг руу бүх төслийн дата; `report_subscriptions` байхгүй. Ажил оноох: `user_tasks` (`20260721120000:15-29`) — assignee/entity талбаргүй, RLS `user_id = auth.uid()`, `api/dashboard/tasks/route.ts:47-49,92-95`; `entity_comments` байхгүй. Аудит: `/dashboard/ai-assistant/audit` руу **нэг ч холбоос байхгүй** (`grep` = 0), API нь `.limit(100)` шүүлтгүй (`ai-audit/route.ts:24-29`), `ai_audit_log`-д RLS асаалттай бөгөөд **нэг ч policy байхгүй** (`20260608230000:17`), entity_id багана байхгүй | Захирал «Болд: 500 сая» гэж тавих газаргүй, «Сараа 5 хоног идэвхгүй» гэж мэдэх арга байхгүй, менежер рүү ажил/тайлбар буцаах суваг байхгүй (Messenger рүү явна), хийсэн өөрчлөлтийг шалгах цонх нь холбоосгүй хуудас |

**Хассан/залруулсан өмнөх дүгнэлтүүд (шударга байхын тулд):** (1) «Бүх push мэдэгдэл огт ирдэггүй» — service worker-ийн `install` унадаг гэсэн таамаг **няцаагдсан** (`cache.addAll` redirect дагадаг). (2) «Утаснаас AI руу орох зам огт байхгүй» — **буруу**, `AskAIHero` (`ManagerDashboard.tsx:108`, `OrgDashboard.tsx:117`) бодит оролт; асуудал нь **буцах зам**. (3) «Лидийн жагсаалтын „Сүүлд холбогдсон" багана худал тоо харуулна» — тийм багана **байхгүй** (`leads/page.tsx:421` толгой нь «Үүссэн»). (4) MyTargetWidget багийн зорилтыг хувийнх мэт харуулдаггүй — шударгаар шошголсон. (5) `checkRateLimitSync` үргэлж `allowed:true` буцаадаг (`rate-limiter.ts:248-258`) — гэхдээ **хэн ч ашигладаггүй** тул устгах ажил, асуудал биш.

---

## 3. ЗОРИЛТОТ ЗУРАГЛАЛ

### 3.1 Зарчим

AI чат нь **роль тус бүрийн ажлын гадаргуу** болно: хэрэглэгч «юу хийхээ» хэлнэ, систем «хаана хийхээ» өөрөө мэднэ. Маягтууд алга болохгүй — тэд нарийвчилсан засварын гадаргуу болж үлдэнэ (чат нь ганц зам болбол алдаа гарахад гарц үлдэхгүй). Гурван давхарга нэмэгдэнэ: **ХЭН БЭ** (identity), **ЮУ ХИЙСЭН БЭ** (activity), **ХЭН ХАРЖ БОЛОХ ВЭ** (role scope).

```
                       ┌──────────────────────────────────────────┐
   Менежер (утас)      │  AI чат (нэг оролт, роль тус бүрт өөр)   │
   Маркетинг           │  streaming · confirm карт · хавсралт      │
   Санхүү              └───────────────┬──────────────────────────┘
   Гүйцэтгэх удирдлага                  │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  OrchestratorContext (ӨРГӨЖИНӨ)        │
                    │  shopId · userId                       │
                    │  + managerId/managerName (каноник)     │  ← Б3, Б4
                    │  + modules[] · canViewOthers           │  ← Б7, Б9
                    └───────────────┬───────────────────────┘
                                    ▼
   PLANNER (одоо байгаа)  →  зөвхөн ЗӨВШӨӨРӨГДСӨН агентуудаас сонгоно
                                    ▼
   AGENTS (одоо 7 + 1 шинэ)  crm · property · finance · marketing ·
                             data-analyst · advisor · ops-admin · **team-lead**
                             AgentDefinition.modules[] шинээр
                                    ▼
   TOOL EXECUTOR (одоо байгаа)  executeDataTool(tool, args, shopId, perms, confirm, userId, userName)
     • TOOL_MODULE map-аар модуль шалгана
     • canViewOthers=false үед args.manager := ctx.managerName (албадана)
     • бүх мутацид confirm → ActionConfirmCard → /api/ai-assistant/action
     • бүх мутац → ai_audit_log + data_audit_log + activity_log
                                    ▼
   SYNTHESIZER (одоо байгаа)  → { text, data, chart, trace, pendingActions }
                                    ▼
   ┌────────────────────────────────────────────────────────────┐
   │ activity_log (ШИНЭ) ← UI зам БА AI зам хоёул бичнэ          │
   └──────────────┬─────────────────────────────────────────────┘
                  ▼
   ХЯНАЛТЫН ДАВХАРГА:  идэвхийн урсгал → үечилсэн гүйцэтгэл →
                        аномали cron → push (report_subscriptions)
```

### 3.2 Роль бүр чатаар юу хийх вэ

| Роль | Чатаар хийх өдрийн ажил | Шаардлагатай tool (шинэ нь **тод**) |
|------|--------------------------|-------------------------------------|
| **Борлуулалтын менежер** | «Өнөөдөр хэнд залгах вэ», «Батад залгасан, авсангүй, маргааш дахин», «Маргааш 2 цагт оффис дээр уулзана», «3 өрөө юу үлдсэн бэ», «Энэ сарын гүйцэтгэл минь» | **list_leads(mine)**, **list_viewings**, **log_interaction**, **set_lead_followup**, **create_task/list_my_tasks/complete_task**, **list_units**, **get_kpi_report(self)**, create_lead, schedule_viewing, update_lead_status |
| **Маркетингийн менежер** | «Билбордоос энэ сард хэдэн лид ирсэн», «Төсөв хэр зарцуулагдав», «Радиогийн гэрээ хэзээ дуусах вэ», «Постын ноорог бэлдэж өг» | get_marketing_summary, get_marketing_budget_status, get_market_indicators, create_social_post, **list_leads(by_source)** — **гэрээ/санхүүгийн tool-д хандахгүй** |
| **Санхүү** | «Хугацаа хэтэрсэн төлбөр», «Энэ сарын цуглуулалт», «Гэрээ №120-г төлөгдсөн болго» | list_contracts, get_contracts_summary, process_contract_action (confirm), **create_contract** |
| **Гүйцэтгэх удирдлага** | «Батын энэ сарын гүйцэтгэл», «Хэн хоцорч байна», «Сараад 5 лид оноож ажил үүсгэ», «Өнөөдөр баг юу хийсэн бэ» | **get_manager_performance**, **list_managers**, **get_team_activity**, **assign_task**, **list_pending_approvals/decide_approval**, get_kpi_report(any) |

### 3.3 Хяналт хэрхэн дээр нь суух вэ

1. **Үйл ажиллагааны бүртгэл (activity_log).** UI ба AI хоёулаа нэг хүснэгтэд бичнэ. Энэ бол одоо байхгүй ганц эх сурвалж — үүнгүйгээр хяналт зөвхөн үр дүнг хардаг.
2. **Амьд явц.** `manager_performance`-ийг үечилсэн эх сурвалжаар (`manager_monthly_sales` + `src/lib/sales/targets.ts:49-74` дэх бэлэн `getMonthlyActualsByManager`) солино; `my-stats`-д огнооны цонх нэмнэ; уулзалтын харагдацад менежерийн хэмжээс нэмнэ.
3. **Аномали сануулга.** Өдөр бүрийн cron: 24ц/7 хоногт идэвхгүй менежер, 14+ хоног хөдөлгөөнгүй лид, сарын зорилтын явцаас хоцролт → `report_subscriptions`-оор зөвхөн зохих хүнд push/имэйл.
4. **Захирлын чат.** `team-lead` агент дээрх бүх зүйлийг унших боловч **бичих эрхгүй** (ажил оноох, зөвшөөрөл шийдэхээс бусад).

### 3.4 Яагаад энэ нь дахин бичилт биш вэ

Дараах зүйлс аль хэдийн бэлэн бөгөөд ажиллаж байна: planner→agents→synthesizer гинж (`src/lib/ai/orchestrator/`), 39 tool-ын executor ба RBAC хаалт (`data-assistant/index.ts:56-66`), confirm→ActionConfirmCard→`/api/ai-assistant/action` гинж (create/delete tool-уудад), trace + `ai_audit_log`, `resolveManagerIdentity` (`src/lib/sales/manager-identity.ts`), `my-stats`/`kpi-report`-ийн цэвэр функцүүд unit-тесттэйгээ (`src/lib/dashboard/`), WorkspaceSwitcher (тесттэй), `sendPushNotificationToUser` (`src/lib/notifications.ts:135`), cron дэд бүтэц (12 ажил). **Ажлын дийлэнх нь шинэ архитектур биш — байгаа хэсгүүдийг холбох, дутуу tool бичих, нэг схемийн давхарга нэмэх.** Шинээр бичих томоохон зүйл гэвэл: `activity_log` бүртгэл, streaming зам, `team-lead` агент, роль мэддэг tool шүүлт.

---

## 4. ГҮЙЦЭТГЭЛИЙН ПЛАН

Нийт ~15 долоо хоног. Фаз бүр өмнөхөөсөө хамаарна — Фаз 1-ийн tool-ууд Фаз 0-ийн identity засваргүйгээр буруу нэр дээр бичих тул дарааллыг эргүүлж болохгүй.

### Фаз 0 — ЯАРАЛТАЙ ЗАСВАР (1 долоо хоног)

**Зорилго:** Өнөөдөр ашиглалтыг зогсоож буй блокеруудыг арилгах. Бүгд жижиг өөрчлөлт, шинэ схем бараг шаардахгүй.

| Ажил | Файл / арга |
|------|-------------|
| AI чатын composer ба sidebar-ыг мобайлд засах | `src/app/dashboard/ai-assistant/layout.tsx:9` → `h-[calc(100dvh-var(--header-h)-88px)] md:h-[calc(100dvh-var(--header-h))]`; `ConversationSidebar.tsx:146` → `hidden md:flex` + мобайлд Sheet; `ai-assistant/page.tsx:70` → мобайлд анхдагч хумиастай |
| Утаснаас гарах зам | `src/lib/navigation/workspaces.ts:249-252` BOTTOM_ITEMS-д «Нүүр» (`/dashboard`) нэмэх + `:102-106` sales mobilePrimary-д AI нэмэх |
| Лид→гэрээ триггерийг засах + буцаан дүүргэх | Шинэ migration: `create_contract_on_lead_won()`-г `sales_manager` баганатайгаар дахин үүсгэх (`NEW.sales_manager_name`); `UPDATE property_contracts c SET sales_manager = l.sales_manager_name FROM leads l WHERE c.lead_id = l.id AND c.sales_manager IS NULL;` + `total_price`. `api/dashboard/leads/[id]/convert/route.ts:31-36` select өргөтгөж `conversion_value = body ?? budget_max` |
| `next_followup_at` бичих зам | `api/dashboard/leads/[id]/route.ts:47` дараа талбар нэмэх + `leads/page.tsx:880` дээр «Маргааш / 3 хоног / 7 хоног» чип |
| Бүртгэлийн нэрийн анхааруулга + нормчлол | `my-stats/route.ts:262` → `onboarding: isSelf && !targetRoster`; `kpi-report/route.ts:276` мөн адил; `ManagerDashboard.tsx:163` нөхцөлд `!inRoster` нэмж хайж буй нэрийг харуулах; `manager-identity.ts:45-51`-д trim/lowercase + `/^[А-ЯӨҮ]\.\s*/` хувилбар |
| AI ба дашбоардын нэрийг нэгтгэх | `functions.ts:715-720` `resolveSalesManagerName` устгах; `api/ai-assistant/route.ts:92` ба `action/route.ts:77`-д `resolveManagerIdentity` дуудах; нэр null бол create tool-уудыг **татгалзуулах** (имэйлээр бичихгүй) |
| Устгасан e-commerce эх сурвалж | `functions.ts:52-75` `fetchDashboardStats`-ыг `property_contracts` + `manager_monthly_sales` дээр дахин бичих; `list_orders`/`get_product_stats` (`tools.ts:23-43`, `index.ts:70-71`, `agents.ts:45`) устгах; `handleDataAssistantQuery` (`index.ts:167-220`) устгах |
| Tool тайлбарын худал эрх | `tools.ts:5,198,227,240,253,266` → «Бичих эрхтэй ажилтан ашиглана»; regression тест нэмэх |
| OAuth шийдвэрийг хэрэгжүүлэх | Шийдвэр (§6.3): (а) `login/page.tsx:50-84,139-160` товчнуудыг хасах, эсвэл (б) `src/lib/auth/ensure-provisioned.ts` бичиж `auth/callback/route.ts:33` дараа болон `api/auth/login/route.ts:55` дараа дуудах |
| Push deep link ба icon | `public/sw.js:98` → `data.url \|\| '/dashboard'`; `:82,96` → `/icon-192.png` |
| Алдааны мессеж | `ai-assistant/page.tsx:120` статус уншиж 429/403/504-г ялгах; `rate-limiter.ts:283-284` монгол болгох; `useMyStats.ts:89` гэх мэт 9 англи `throw`-г монгол болгох |

**Амжилтын хэмжүүр:**
- 390×844 дэлгэцэнд AI чатын бичих талбар **гүйлгэлгүйгээр** харагдаж, асуулт илгээгдэнэ (e2e тест).
- Лид «closed_won» болгосны дараа үүссэн гэрээ тухайн менежерийн «Миний самбар»-ын «Идэвхтэй гэрээ»-д **тэр даруй** харагдана.
- Лид дээр 2 товшилтоор дагалтын огноо тавигдана; pipeline дээрх «Дараагийн алхамгүй» badge бодит утга харуулна.
- AI-аас «энэ сарын орлого» асуухад `property_contracts`-ын бодит дүн буцна (0₮ биш).

### Фаз 1 — AI-аар ажиллах суурь (4 долоо хоног)

**Зорилго:** Менежер өдрийн ажлынхаа дийлэнхийг чатаар гүйцэтгэх боломжтой болгох; ажлыг бүртгэдэг хүснэгт бий болгох.

**Хийх ажлууд:**
1. **Идэвхийн бүртгэл.** `activity_log` migration (§5.1). Бичих цэгүүд: `api/dashboard/leads/[id]/route.ts:62`, `leads/route.ts` POST, шинэ viewings route-ууд, `data-assistant/index.ts:113` (`logAiAudit`-ийн хажууд). Лидийн Sheet-д «Залгасан / Авсангүй / Уулзсан» гэсэн 3 нэг товшилтын чип + тэмдэглэлийн талбар (`leads/page.tsx:880`), `last_contact_at`-г мөн шинэчлэх. `service_logs`-д `lead_id` багана + GET шүүлт (`service-logs/route.ts:29-40`).
2. **Хувийн хамрах хүрээний tool.** `list_leads`-д `mine`/`manager` (`tools.ts:62-73` + `functions.ts:131`), мөн `get_customer_insights`, `get_dashboard_stats`. `OrchestratorContext`-д `managerName`/`canViewOthers` нэмж (`orchestrator/types.ts:58-69`) `executeDataTool`-д албадах. Шинэ `get_my_day` (`src/lib/dashboard/my-stats.ts`-ийн бэлэн функцүүдээр).
3. **Ажил/дагалт/уулзалтын tool.** `create_task`, `list_my_tasks`, `complete_task`, `set_lead_followup`, `log_interaction`, `list_viewings`, `update_viewing`, `complete_viewing`, `cancel_viewing` (устгал биш — `status='cancelled'`, ингэснээр `canDelete:false` роль ажиллана). `schedule_viewing`-ийг байргүй уулзалт зөвшөөрөхөөр засах + `meeting_type`, `sales_manager_name`-г анхны INSERT-д оруулах (`functions.ts:890-924`). `riskTiers.ts:13-18`-д нэрсийг тусгах, эс бөгөөс drift тест унана.
4. **Нөөцийн харагдац.** `list_units` read tool (`property_units_with_buyer` view дээр), `/api/dashboard/units`-д `?q=` хайлт, blocks хуудсанд хайлтын талбар, уулзалтын байр сонгогчийг тэр рүү чиглүүлэх.
5. **Streaming + цуцлалт + session.** `/api/ai-assistant`-ыг SSE болгож `runOrchestrator`-т `onStep` callback нэмэх; клиентэд `AbortController` + «Зогсоох» товч; `ai_messages`-д `shop_id/user_id/attachments` (§5.6) нэмж хавсралтыг хадгалах.
6. **Оролтын хурд.** AppShell-д FAB (`md:hidden`, `bottom-[88px]`) → утас+нэр+сувгийн 6 чип+дагалтын preset бүхий нэг Sheet, `POST /api/dashboard/leads` рүү. `viewings/page.tsx:193` хатуу `'other'`-ыг талбар болгох, `leads/new/page.tsx:30` анхдагчийг хоослох. Шинэ `POST /api/dashboard/contracts/create` (Zod, `requireModuleWrite('contracts')`, менежерийг сервер талд stamp) + ContractEditForm-ыг үүсгэх Sheet болгон ашиглах; менежерийн чөлөөт `<input>`-ыг Select болгох.
7. **Жагсаалтын хамрах хүрээ.** `useDashboardMode`-оор leads/pipeline/viewings/contracts хуудсуудад `manager` анхдагчийг тавьж «Миний / Бүгд» сэлгүүр нэмэх; widget href-үүдэд `?manager=` (`my-stats.ts:108,124`).
8. **6 write tool-д confirm.** `index.ts:82-87` дуудлагад `confirm` дамжуулж impl-үүдэд `confirmNeeded` буцаалт нэмэх → аудит автоматаар асна.
9. Жижиг: `add_lead_note`-д олон таарц шалгах + `deleted_at` (`functions.ts:612-629`, `:596`); `create_lead`-ийн сувгийн жагсаалтыг `src/types/property.ts:15`-аас гаргаж импортлох.

**Амжилтын хэмжүүр:**
- Шинэ менежер **3 товшилтоор** лид бүртгэнэ (FAB → утас/нэр → Хадгалах).
- «Өнөөдөр хэнд залгах вэ?» гэсэн асуултад **зөвхөн өөрийнх нь** лидүүд, дагалтын огноогоор эрэмбэлэгдэж буцна.
- «Батад залгасан, авсангүй, маргааш дахин залгая» гэсэн нэг өгүүлбэрээр: `activity_log` мөр + `last_contact_at` + `next_followup_at` бүгд бичигдэнэ.
- Чатаар үүсгэсэн лид/уулзалт 100% тухайн менежерийн самбарт харагдана (unit тестээр лацдана).
- AI хариу эхний 2 секундэд урсаж эхэлнэ; 90 сек дээр цуцлах товч ажиллана.

### Фаз 2 — Ролиуд (3 долоо хоног)

**Зорилго:** Маркетинг, санхүү, гүйцэтгэх удирдлагыг чат руу аюулгүйгээр оруулах; эрхийг сервер талд бодитоор хэрэгжүүлэх.

**Хийх ажлууд:**
1. `AgentDefinition.modules[]` (`orchestrator/types.ts:23-42`) + `AssistantPerms.modules` (`data-assistant/index.ts:34-38`); `planner.ts:20`-г `buildPlannerInstruction(allowed)` болгож VALID_IDS-ийг хүсэлт тутам тооцох; `orchestrator/index.ts:75`-д зөвшөөрөгдөөгүй алхмыг алгасаж trace-д `skipped` бичих; `tools.ts`-д `TOOL_MODULE` мап нэмж `runAgent.ts:25` ба `executeDataTool` хоёуланд шалгах.
2. `src/lib/auth/route-modules.ts` — зам→модуль мап + `withModule()` wrapper; эхлээд `customers`, `viewings`, `inbox`, `surveys`, `ai-settings`, `export/excel`, `stats`, `team`. Мапд ороогүй шинэ route унадаг vitest нэмэх.
3. `/marketing`-ийг `middleware.ts:8` protectedRoutes-д оруулах; `marketing` модуль нэмж `workspaces.ts:207-241`-ийн `module: ''`-уудыг солих; `api/marketing/channels/route.ts:50` ба `contracts/route.ts:63` POST-д `requireModuleWrite`.
4. Ролийн эвлэрүүлэх migration (§5.9): `executive`, `project_manager`, `service`, `finance_manager`, `accountant`, `super_admin`-г `roles`+`role_permissions`-д суулгах; `sales_manager`-т `customer-service`, `admin`-д `finance`/`procurement` нэмэх; `team-oversight` ба `tasks` модуль үүсгэх. `fetchRolePermissions`-ийг сервер талд `supabaseAdmin`-аар дуудах (split-brain арилгах).
5. `mode/route.ts:40` `canViewTeam = isAdmin || modules.includes('team-oversight')` (хувийн горимоос салгах); `dashboard/page.tsx:29-30`-г эрт `return`-гүй болгож ManagerDashboard дээр TeamOverview нэмэх; `my-stats:283` `recentLeads`-аас `customer_phone`-ыг өөрийнх биш үед хасах.
6. Identity-ийн үлдсэн ажил: профайл хуудас (`/dashboard/profile` + `GET/PATCH /api/dashboard/profile`, `user_profiles.full_name` ба `user_metadata`-г нэг handler-т бичих), roster нэр солих/нэгтгэх `PATCH /api/admin/sales-targets/managers/[id]` (Postgres функцээр нэг транзакцид `leads`/`property_viewings`/`customers`/`property_contracts`-ын нэрийг дагалдуулан солих), roster мөрөнд акаунт холбох Select (API аль хэдийн `user_id` хүлээж авдаг — `sales-targets/route.ts:153`).
7. Нэвтрэлтийн сүүлийн миль: `/auth/forgot`, `/auth/reset`, `callback/route.ts`-ыг `code` / `token_hash` / fragment гэсэн 3 хэлбэрт салаалуулж `next` параметрийг хүндэтгэх; `middleware.ts:11-21` publicRoutes; `admin` ролийг `/admin`-д оруулах (`src/lib/admin/auth.ts:103-116`).
8. Rate limit-ийг хэрэглэгчийн id-д шилжүүлэх (`rate-limiter.ts:328-336`, `middleware.ts` session-ий дараа).

**Амжилтын хэмжүүр:**
- Маркетингийн ролиор чатаар гэрээний мэдээлэл авах оролдлого **100% татгалзана** (автомат тест: planner finance-analyst сонгосон ч алхам алгасагдана).
- Админ шинэ менежерийг **3 минутад** урьж → роль өгч → roster-т холбож → тэр хүн эхний лидээ бүртгэнэ.
- Борлуулалт хийдэг захирал өөрийн самбар **ба** багийн леадербордыг нэг дэлгэцэнд харна.
- `viewer` ролиор `/api/dashboard/customers`, `/api/dashboard/export/excel`, `/api/marketing/channels` (POST) — бүгд 403.

### Фаз 3 — Хяналтын давхарга (4 долоо хоног)

**Зорилго:** Удирдлага явцыг бодит цагт хараад, хоцролтыг өөрөө мэдэгддэг болгох.

**Хийх ажлууд:**
1. **Идэвхийн урсгал:** `GET /api/dashboard/activity?manager=&from=&to=` (`requireModule('team-oversight')`) + ManagerSelector-ийн Sheet дотор timeline (`ManagerSelector.tsx:92-94`); `data_audit_log`-д `actor_name/source/summary` нэмж бүх мутацийн route-д `recordAudit` холбох.
2. **Үечилсэн гүйцэтгэл:** `reports/manager-performance/route.ts:12` → `GET(request)` + `?year=&month=&period=`, эх сурвалжийг `getMonthlyActualsByManager` (`src/lib/sales/targets.ts:49-74`) болгох; `TeamOverview.tsx:76` дээр сарын Select; `my-stats`-д `from/to` цонх (уулзалт `:158`, гэрээ `:165-174`, `activeLeads`/`leadsByStatus`) + `MyKpiCards.tsx:21-41`-ийн бүх шошгыг `PERIOD_LABEL`-аар; `meeting_monthly_summary`-г менежерийн хэмжээстэй, `deleted_at`-гүй, `security_invoker`-тэйгээр дахин үүсгэх.
3. **Хувийн зорилт:** `manager_sales_targets` (§5.3) + `getManagerTargets()` + `MyTargetWidget`-д `isPersonal` салаа + `/dashboard/reports/targets` засварын хуудас (`requireModuleWrite('team-oversight')`).
4. **Аномали:** `GET/POST /api/cron/manager-anomalies` (vercel.json, өдөрт 1) — 24ц/7хоног идэвхгүй, 14+ хоног хөдлөөгүй лид (`idx_leads_shop_status_stage` ашиглана), сарын зорилтын явц; үр дүнг `TeamOverview`-д «Анхаарах» блок + `report_subscriptions`-оор push.
5. **Хүлээн авагчид:** `report_subscriptions` (§5.5) + `director-digest`/`weekly-report`-ыг shop тус бүрийн захиалагчид руу (`process.env.DIGEST_EMAIL`-ыг зөвхөн fallback болгох).
6. **Захирлын чат:** `team-lead` агент (`agents.ts`) + `get_manager_performance`, `list_managers`, `get_team_activity`, `get_kpi_report(manager)` — `buildManagerMonth()`-ыг `src/lib/dashboard/kpi-report.ts`-д гаргаж route ба tool хоёр нэг кодоор ажиллана.
7. **Буцах холбоо:** `user_tasks`-д `assignee_id/assigned_by/priority/entity_type/entity_id` (§5.2) + RLS шинэчлэл + `assign_task` tool + push; `entity_comments` (§5.4) + лидийн Sheet ба drill-in дээр тайлбар.
8. **Зөвшөөрөл:** `approvals` (§5.4) + `request_approval` / `list_pending_approvals` / `decide_approval`; HIGH_RISK tool-уудыг (үнэ өөрчлөх, гэрээ хаах, устгал) `canAccessAdmin` биш үед шууд гүйцэтгэхийн оронд хүсэлт үүсгэх.
9. **Аудитыг харагдуулах:** хуудсыг `/dashboard/reports/audit` руу зөөж навигацид бүртгэх; API-д огноо/менежер/entity шүүлт + cursor; `ai_audit_log`-д `entity_type/entity_id/changes/duration_ms` + policy; хоёр аудит хүснэгтийг **append-only** болгох (UPDATE/DELETE-д триггер).

**Амжилтын хэмжүүр:**
- Захирал чатаар «Батын энэ сарын гүйцэтгэл» гэж асуухад лид/уулзалт/гэрээ/орлого/зорилтын гүйцэтгэл **5 секундэд** бодит тоогоор ирнэ.
- «Өчигдөр баг юу хийсэн бэ?» гэсэн асуултад `activity_log`-оос менежер тус бүрийн дуудлага/уулзалт/тэмдэглэлийн тоо гарна.
- 7 хоног идэвхгүй менежер илэрвэл маргааш өглөө зөвхөн захиалсан хүнд push очно.
- Леадерборд дээрх сар сонгоход бүх мөр өөрчлөгдөнө (all-time мөр үлдэхгүй).

### Фаз 4 — Өргөтгөл, бататгал (3 долоо хоног)

**Зорилго:** Дахин ухрахаас хамгаалах, шинэ хэрэглэгч дангаараа эхлэх.

**Хийх ажлууд:**
- **Тест:** 390×844 viewport дээр AI composer-ийн e2e regression (`e2e/smoke.spec.ts`); `rate-limiter` түлхүүр үүсгэлт; `retry.ts` backoff; `msw`-ээр `/api/dashboard/{stats,contracts,customer-health}` route smoke; tool тайлбарт «Super Admin» гарахгүй байх guard; чатаар үүсгэсэн лидийн нэр my-stats-ын шүүлттэй таарах unit тест; API route бүр модулийн мапд байх тест.
- **Onboarding:** эхний session-д 3 алхамт чеклист (`ManagerDashboard.tsx` — лид нэмэх / уулзалт товлох / мэдэгдэл асаах), `EmptyState`-үүдэд `action` prop, `src/app/help/page.tsx`-ыг борлуулалтын өдрийн гогцоо дээр дахин бичих (одоо чатботын тохиргооны FAQ).
- **PWA/офлайн:** `manifest.json:2-4` Vertmon Hub + өнгө нийцүүлэх; `/offline` хуудас + `sw.js:14-18` precache-аас `/dashboard` хасах; `useOnlineStatus` + монгол баннер; лид/ажлын маягтын ноорог localStorage-д.
- **Гүйцэтгэл:** `sales_manager_name` индексүүд, `next_followup_at` хэсэгчилсэн индекс, `contracts` API-д хуудаслалт + баганын шүүлт, `customer-health`-ыг SQL талд тоолох, `stats/route.ts:52-110`-ийг `Promise.all`.
- **Схемийн эцсийн алхам:** `sales_manager_id` (uuid) баганууд + view-үүдийг дагуулан шинэчлэх, `leads.assigned_to` устгах; `property_units`/`service_logs`-д `deleted_at`; `ai_conversations` устгалыг зөөлөн болгох.
- **Баримт:** CLAUDE.md-д activity_log, роль/модуль, tool бүртгэлийн дүрмүүдийг нэмэх; `docs/AI-FIRST-WORK-OS-PLAN.md`-ийг энэ баримтаар солих.
- **Gemini загварын ID-г төвлөрүүлэх:** `src/lib/ai/config/models.ts` + `GEMINI_MODEL` env + `/api/health`-д бодит ping (одоо 11 газарт хатуу бичигдсэн).

**Амжилтын хэмжүүр:**
- `npm run test` + `npm run lint` + e2e (мобайл viewport орсон) CI-д ногоон.
- Шинэ менежер **тусламжгүйгээр**, эхний 10 минутад: лид бүртгэх → дагалт тавих → уулзалт товлох → мэдэгдэл асаах.
- Гэрээний хуудас 4G дээр 3 секундэд ачаална (одоо 15-40 сек).

---

## 5. ШИНЭ СХЕМ

> Бүх шинэ хүснэгт: `shop_id` заавал, `deleted_at` (зөөлөн устгал шаардлагатай газарт), `updated_at` триггер, RLS асаалттай **бөгөөд policy-тэй** (одоо `ai_audit_log` policy-гүй RLS-тэй — давтахгүй). View бүр `WITH (security_invoker = on)`.

### 5.1 `activity_log` — үйл ажиллагааны цорын ганц бүртгэл (Фаз 1)

```sql
CREATE TABLE activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  actor_id     uuid,                       -- auth.users.id (үнэн эх сурвалж)
  actor_name   text,                       -- харуулах хуулбар (каноник roster нэр)
  entity_type  text NOT NULL CHECK (entity_type IN ('lead','customer','viewing','contract','property','unit','task')),
  entity_id    uuid,
  kind         text NOT NULL CHECK (kind IN ('call','sms','messenger','meeting','viewing','note','status_change','assign','create','update','delete','message_sent')),
  direction    text CHECK (direction IN ('out','in')),
  outcome      text CHECK (outcome IN ('connected','no_answer','busy','wrong_number','scheduled','n/a')),
  body         text,
  duration_sec int,
  source       text NOT NULL DEFAULT 'ui' CHECK (source IN ('ui','ai','webhook','import','cron')),
  payload      jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX idx_activity_shop_actor ON activity_log (shop_id, actor_name, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_activity_entity     ON activity_log (shop_id, entity_type, entity_id, occurred_at DESC);
-- RLS: SELECT — өөрийн мөр ЭСВЭЛ team-oversight эрхтэй; INSERT — зөвхөн service_role
--      (бүх бичилт server route-аар явна). Мөр засах/устгах policy ҮҮСГЭХГҮЙ (append-only).
```

### 5.2 `user_tasks` өргөтгөл — оноож болдог ажил (Фаз 3)

```sql
ALTER TABLE user_tasks
  ADD COLUMN assignee_id  uuid,             -- backfill := user_id, дараа нь NOT NULL
  ADD COLUMN assigned_by  uuid,
  ADD COLUMN priority     text CHECK (priority IN ('low','normal','high')) DEFAULT 'normal',
  ADD COLUMN entity_type  text CHECK (entity_type IN ('lead','viewing','contract','customer')),
  ADD COLUMN entity_id    uuid;
CREATE INDEX idx_user_tasks_assignee ON user_tasks (shop_id, assignee_id, due_at) WHERE deleted_at IS NULL;
-- RLS: 20260721120000-ийн user_tasks_self_access-ыг СОЛИНО →
--      USING (assignee_id = auth.uid() OR assigned_by = auth.uid())
-- ⚠ tasks/route.ts:10-12 дэх «ХАТУУ ХУВИЙН» коммент шинэчлэгдэнэ (инвариант өөрчлөгдөж байгаа)
```

### 5.3 `manager_sales_targets` — хувь хүний зорилт (Фаз 3)

```sql
CREATE TABLE manager_sales_targets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  manager_id         uuid,                          -- ирээдүйн каноник холбоос
  sales_manager_name text NOT NULL,                 -- өнөөгийн нэгдэх түлхүүр
  year               int  NOT NULL,
  month              int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount      numeric(18,2) NOT NULL DEFAULT 0,
  leads_target       int, viewings_target int, calls_target int,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE (shop_id, sales_manager_name, year, month)
);
-- RLS: SELECT — өөрийн мөр ЭСВЭЛ team-oversight; INSERT/UPDATE — team-oversight (service_role-оор).
-- Зорилт байхгүй бол fallback: team_sales_targets[month] / COUNT(sales_managers WHERE is_active)
```

### 5.4 `approvals` ба `entity_comments` — шийдвэр ба буцах холбоо (Фаз 3)

```sql
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  requested_by uuid, requested_by_name text,
  kind text NOT NULL CHECK (kind IN ('price_change','discount','contract_close','delete','custom')),
  entity_type text, entity_id uuid,
  payload jsonb NOT NULL,            -- tool нэр + args (зөвшөөрөгдвөл яг үүгээр дахин ажиллуулна)
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_at timestamptz DEFAULT now(), expires_at timestamptz
);
CREATE INDEX idx_approvals_pending ON approvals (shop_id, status, created_at DESC);

CREATE TABLE entity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  author_id uuid, author_name text, body text NOT NULL,
  created_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX idx_comments_entity ON entity_comments (shop_id, entity_type, entity_id, created_at DESC);
-- RLS: хоёуланд нь — тухайн shop-ийн гишүүн уншина; approvals-ыг шийдэх нь team-oversight эрхтэй хүн.
```

### 5.5 `report_subscriptions` — тайлан хэнд очих вэ (Фаз 3)

```sql
CREATE TABLE report_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report  text NOT NULL CHECK (report IN ('daily_digest','weekly','anomaly')),
  channel text NOT NULL CHECK (channel IN ('email','push')),
  active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (shop_id, user_id, report, channel)
);
-- RLS: өөрийн захиалгаа уншина/засна; cron нь service_role-оор бүгдийг уншина.
-- ⚠ Үүнийг оруулснаар director-digest/weekly-report дахь БҮХ shop-ийн давталт (route.ts:22-25) нэг
--    хаяг руу илгээхээ болино — олон төслийн дата холилдох эрсдэл хаагдана.
```

### 5.6 Одоо байгаа хүснэгтүүдийн засвар

```sql
-- Чатын түүх бүрэн бус (Фаз 1)
ALTER TABLE ai_messages ADD COLUMN shop_id uuid REFERENCES shops(id),
                        ADD COLUMN user_id uuid,
                        ADD COLUMN attachments jsonb;
UPDATE ai_messages m SET shop_id = c.shop_id, user_id = c.user_id
  FROM ai_conversations c WHERE c.id = m.conversation_id;
CREATE INDEX idx_ai_messages_shop ON ai_messages (shop_id, created_at DESC);

-- Аудит (Фаз 3)
ALTER TABLE data_audit_log ADD COLUMN actor_name text,
                           ADD COLUMN source text CHECK (source IN ('ui','ai','webhook','import','cron')),
                           ADD COLUMN summary text;
CREATE INDEX idx_data_audit_actor ON data_audit_log (shop_id, actor_id, created_at DESC);
ALTER TABLE ai_audit_log ADD COLUMN entity_type text, ADD COLUMN entity_id uuid,
                         ADD COLUMN changes jsonb, ADD COLUMN duration_ms int;
-- ai_audit_log-д RLS асаалттай атлаа policy БАЙХГҮЙ (20260608230000:17) — тодорхой policy нэмнэ.

-- Дуудлагын бүртгэлийг сервисийн бүртгэлтэй холбох (Фаз 1)
ALTER TABLE service_logs ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
                         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_service_logs_lead ON service_logs (shop_id, lead_id);

-- Индексүүд (Фаз 0/4)
CREATE INDEX IF NOT EXISTS idx_leads_manager    ON leads (shop_id, sales_manager_name, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_viewings_manager ON property_viewings (shop_id, sales_manager_name, scheduled_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_followup   ON leads (shop_id, next_followup_at)
  WHERE deleted_at IS NULL AND status NOT IN ('closed_won','closed_lost');

-- Зөөлөн устгал (Фаз 4)
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

### 5.7 Триггер ба view засвар

```sql
-- Фаз 0: гэрээ үүсгэх триггер эзэнтэй болно
CREATE OR REPLACE FUNCTION create_contract_on_lead_won() ... -- INSERT баганын жагсаалтад sales_manager
--   VALUES (..., NEW.sales_manager_name, ...), total_price := COALESCE(NEW.conversion_value, NEW.budget_max)
UPDATE property_contracts c SET sales_manager = l.sales_manager_name
  FROM leads l WHERE c.lead_id = l.id AND c.sales_manager IS NULL;

-- Фаз 3: уулзалтын харагдац менежерийн хэмжээстэй болно (CREATE OR REPLACE reloption хадгалахгүй тул DROP+CREATE)
DROP VIEW IF EXISTS meeting_monthly_summary;
CREATE VIEW meeting_monthly_summary WITH (security_invoker = on) AS
  SELECT v.shop_id, v.sales_manager_name, date_trunc('month', v.scheduled_at)::date AS month, ...
  FROM property_viewings v LEFT JOIN leads l ON l.id = v.lead_id
  WHERE v.deleted_at IS NULL
  GROUP BY v.shop_id, v.sales_manager_name, date_trunc('month', v.scheduled_at);
```

### 5.8 Attribution-ыг uuid болгох (Фаз 4, эрсдэлтэй — §6.4)

```sql
ALTER TABLE leads              ADD COLUMN sales_manager_id uuid;
ALTER TABLE property_viewings  ADD COLUMN sales_manager_id uuid;
ALTER TABLE customers          ADD COLUMN sales_manager_id uuid;
ALTER TABLE property_contracts ADD COLUMN sales_manager_id uuid;
-- backfill: sales_managers.name ↔ nэрээр нэг удаа, ГАРААР ХЯНАЖ баталсны дараа.
-- Шилжилтийн үед унших нөхцөл: .or('sales_manager_id.eq.<uid>,sales_manager_name.eq.<name>')
-- Дуусахад: manager_performance / manager_monthly_sales-ыг id-гаар GROUP BY болгож,
--           leads.assigned_to (хэн ч уншдаггүй) баганыг УСТГАНА.
```

### 5.9 Роль ба олон төсөл (Фаз 2)

```sql
-- Модуль нэмэлт: 'marketing', 'team-oversight', 'tasks' → src/lib/rbac.ts ALL_MODULES + MODULE_LABELS
-- Дутуу ролиудыг DB-д суулгах (одоо TypeScript-д л байгаа): super_admin, finance_manager, accountant
-- Шинэ ролиуд: executive (canWrite=false, canDelete=false, + team-oversight), project_manager, service
-- role_permissions-ыг ROLE_PERMISSIONS-той эвлэрүүлэх (admin→customer-service/finance/procurement,
--   sales_manager→customer-service; sales_manager-аас 'reports'-ыг үлдээж 'team-oversight' ОЛГОХГҮЙ)

ALTER TABLE user_roles ADD COLUMN shop_id uuid REFERENCES shops(id);
UPDATE user_roles ur SET shop_id = sm.shop_id FROM shop_members sm WHERE sm.user_id = ur.user_id;
ALTER TABLE user_roles DROP CONSTRAINT user_roles_user_id_key;      -- UNIQUE(user_id)
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_shop_key UNIQUE (user_id, shop_id);
ALTER TABLE roles ADD COLUMN shop_id uuid REFERENCES shops(id);      -- NULL = системийн глобал роль
-- 20260315100000:46-49 дэх «Super admins can manage roles» policy нь бодитоор USING(true) —
-- жинхэнэ super_admin шалгалт болгож чангатгана.

ALTER TABLE user_profiles ADD COLUMN active_shop_id uuid REFERENCES shops(id);  -- localStorage-ийн оронд
```

---

## 6. ЭРСДЭЛ БА ШИЙДВЭР ГАРГАХ ЦЭГҮҮД

**6.1 Чат нэгдүгээрт үү, маягт нэгдүгээрт үү?**
Зорилт нь чат боловч энэ аудит харуулж байгаагаар чат нь өнөөдөр маягтаас **сул** (tool дутуу, mobile эвдэрсэн, streaming байхгүй). Санал: Фаз 1-2-т **хоёулаа заавал ажиллана** — чатаар хийж болох бүх зүйл маягтаар ч хийгдэнэ, эсрэгээрээ биш. Фаз 3-ын төгсгөлд хэмжилт хийж («үйлдлийн хэдэн хувь чатаар хийгдэв») дараа нь л маягтуудыг гүнзгий цэс рүү зөөх эсэхийг шийднэ. *Шийдвэр: чат-онли горим руу шилжих огноог одоо тогтоох уу, эсвэл хэмжилтээр шийдэх үү?*

**6.2 Баталгаажуулалт хэр чанга байх вэ?**
Одоогийн байдал урвуу: лид үүсгэхэд зөвшөөрөл асууж, **үнэ өөрчлөхөд асуудаггүй**. Хоёр сонголт: (а) бүх мутацид confirm карт — аюулгүй боловч чатыг удаашруулж «дахин дарах» ядаргаа үүсгэнэ; (б) эрсдэлийн түвшинтэй — тэмдэглэл/төлөв/дагалт шууд, харин үнэ, гэрээ хаах, устгал, дахин оноолт зөвхөн confirm (+ өндөр эрсдэлтэйд `approvals` мөр). Санал: (б). *Шийдвэр: аль үйлдэл менежерийн эрхэд, аль нь захирлын зөвшөөрөлд байх ёстой вэ — жагсаалтыг эзэн батална.*

**6.3 OAuth товчнуудыг хаах уу, автоматаар бүртгэх үү?**
Google/Facebook товч ажиллаж байгаа мөртлөө үхмэл акаунт үүсгэдэг (Б1). (а) Товчнуудыг хасаж зөвхөн урилга+имэйл үлдээх — 1 цагийн ажил, одоогийн «админтай холбогдоно уу» гэсэн бодлоготой нийцнэ. (б) `ensureUserProvisioned` бичиж профайл+shop гишүүнчлэл автоматаар үүсгэх (роль автоматаар **олгохгүй**, «эрх хүлээгдэж байна» төлөв харуулах). Санал: богино хугацаанд (а), Фаз 2-т (б). *Шийдвэр: шинэ хэрэглэгч өөрөө бүртгүүлж болох уу, эсвэл зөвхөн урилгаар уу?*

**6.4 Нэрээс uuid рүү шилжих — хэзээ, хэн хянах вэ?**
`sales_manager_name` дээр тогтсон бүх атрибуци эмзэг (Б4), гэхдээ шилжилт нь түүхэн өгөгдлийг гараар тааруулахыг шаардана (Excel-ээс импортлогдсон «Б.Батсайхан» гэх мэт). Эрсдэл: буруу нэгтгэл менежерийн түүхэн борлуулалтыг өөр хүн рүү шилжүүлж болно. Санал: Фаз 0-д нэрийн нормчлол + roster нэр солих багаж, Фаз 4-т л uuid шилжилт, backfill-ийг **борлуулалтын дарга гараар баталсны дараа**. *Шийдвэр: түүхэн гэрээний эзнийг хэн эцэслэн батлах вэ?*

**6.5 Нэг төсөл үү, олон түрээслэгч үү?**
`user_roles`-д `shop_id` байхгүй (нэг хүн бүх төсөлд нэг роль), `roles.name` глобал, digest бүх shop-ийг нэг хаяг руу илгээдэг, идэвхтэй shop нь localStorage-д. Нэг төслийн (Mandala) хүрээнд эдгээр нь онолын асуудал; **хоёр дахь төслийг оруулсан өдөр блокер** болно. *Шийдвэр: хоёр дахь төслийг хэзээ оруулах вэ — тэр огноог мэдвэл §5.9-ийг Фаз 2 эсвэл Фаз 4-т байрлуулна.*

**6.6 Дуудлагын бүртгэл: гараар уу, телефон системтэй холбох уу?**
«Хэн хэдэн дуудлага хийсэн» гэдэг нь борлуулалтын давхаргын гол өдрийн хэмжүүр. Гараар (нэг товшилтын чип) — хямд, 100% хяналттай, гэхдээ бүрэн бус бөглөгдөнө. Телефон/PBX холболт (Mobicom/Unitel эсвэл виртуал дугаар) — бодит боловч гуравдагч талын интеграци, сар бүрийн төлбөр, хувийн мэдээллийн бодлого шаардана. Санал: Фаз 1-д гараар эхэлж, 1 сарын дараа бөглөлтийн хувийг хэмжээд шийдэх. *Шийдвэр: телефон интеграцид төсөв гаргах уу, эсвэл гараар бүртгэлээр үлдэх үү?*

**6.7 (Нэмэлт, техникийн) Эхний өдөр шалгах зүйлс.**
(а) `gemini-3.5-flash` гэсэн загварын ID 11 газарт хатуу бичигдсэн бөгөөд төслийн бусад хэсэг өөр гэр бүлийн нэр (`gemini-3-pro`) ашигладаг — API түлхүүрээр `models` жагсаалтыг шалгаж баталгаажуулна. Хэрэв ID хүчингүй бол энэ нь **ирээдүйн эрсдэл биш, өнөөдрийн блокер**. (б) Урилгын холбоос PKCE (`?code=`) эсэх — нэг урилга дарж шалгавал Б5-ын ажлын хэмжээ тодорхой болно. (в) `maxDuration = 60`-ыг 300 болгох нь Vercel багцаас хамаарна (Фаз 1-ийн streaming үүнийг зөөлрүүлнэ).

---

## 7. БАТАЛГААЖУУЛАЛТЫН ТЭМДЭГЛЭЛ

Энэ баримт 7 чиглэлийн аудит (105 баталгаажсан илрүүлэлт) дээр суурилсан. Дараах **гол блокеруудыг нэмж, бие даан кодоос дахин шалгаж** баталсан:

| Дүгнэлт | Шалгасан газар | Үр дүн |
|---------|----------------|--------|
| AI чат мобайлд ашиглах боломжгүй | `ai-assistant/layout.tsx:9` (`h-[calc(100vh-var(--header-h))] overflow-hidden`), `MobileNav.tsx:107-108` (`fixed bottom-0` + `h-[72px]` + `pb-safe`), `ConversationSidebar.tsx:146` (`w-72`, responsive хамгаалалтгүй), `ai-assistant/page.tsx:70` (`useState(false)`) | ✅ Батлагдав |
| Лид→гэрээ триггер менежерийн нэр бичдэггүй | `20260608150000_link_contracts_to_leads.sql:27-34` — INSERT баганын жагсаалтад `sales_manager` **алга**, `total_price := NEW.conversion_value` | ✅ Батлагдав |
| `onboarding` талбар үхмэл | `my-stats/route.ts:262` — `onboarding: false` хатуу бичигдсэн | ✅ Батлагдав |
| `leads.next_followup_at` бичих зам байхгүй | `src/`-д 9 уншилт (cron, my-stats, types) — лидэд бичих газар **нэг ч алга**; `customer-followups:65` нь `customers`-ыг snooze хийдэг | ✅ Батлагдав |
| Push мэдэгдэл буруу хуудас нээж, icon 404 | `public/sw.js:98` (`data: { url: '/' }` — payload-ын url-ыг хаядаг), `:82,96` (`/icons/icon-192x192.png`); `public/icons/` фолдер **байхгүй** (`public/icon-192.png` өөр нэртэй) | ✅ Батлагдав |
| Нэвтрэлтийн гинж (OAuth) | `auth/callback/route.ts` — зөвхөн `exchangeCodeForSession` + redirect; `20260322_drop_auth_triggers.sql:7-8` триггер устгасан; `getUserShop()` `supabase-auth.ts:192-197` shop олдохгүй бол `null` | ✅ Батлагдав |
| Нэрийн яг таарц | `manager-identity.ts:48` — `r.name === fullName` (trim/case/цэг үл тооцно) | ✅ Батлагдав |
| AI зам модулийн эрх шалгадаггүй | `data-assistant/index.ts:52-61` — зөвхөн `canWrite/canDelete/super_admin`; `perms.modules` AI зам дээр хаана ч ашиглагдаагүй | ✅ Батлагдав |
| Орчестратор дараалан ажиллана, streaming алга | `orchestrator/index.ts:74-82` (`for` гогцоо), `api/ai-assistant/route.ts:27` (`maxDuration = 60`), route нь `NextResponse.json` буцаана | ✅ Батлагдав |
| «Миний лийд» шүүлт, уулзалт унших tool алга | `data-assistant/tools.ts:62-73` — `list_leads`-д менежерийн параметр алга; `tools.ts`-д `list_viewings` **байхгүй** | ✅ Батлагдав |
| `/marketing/*` хамгаалалтгүй | `middleware.ts:8` `protectedRoutes = ['/dashboard','/admin']`; `marketing/layout.tsx` нь хамгаалалтгүй client layout; `workspaces.ts:212-241` 15 цэс `module: ''`; `Sidebar.tsx:64` `module === '' → үргэлж харагдана` | ✅ Батлагдав (API нь 401 өгдөг тул **дата алдагдахгүй** — эвдэрсэн бүрхүүл харагдана) |
| Аудитын дэд бүтэц ашиглагдаагүй | `data_audit_log` (`20260616130000`) схем зөв; `recordAudit` дуудлага 132 route-оос **1**-д (`api/dashboard/customers/route.ts:10`) | ✅ Батлагдав |
| `ai_audit_log`-д RLS policy алга | `20260608230000_ai_audit_log.sql:17` — `ENABLE ROW LEVEL SECURITY`, policy **нэг ч алга** | ✅ Батлагдав |

### 7.1 Хамгийн ноцтой нэг зүйл: AI «0₮ орлого» гэж хариулдаг

`get_dashboard_stats` нь **7 агентын 5-д** залгагдсан (`agents.ts:32,74,89,102,125`) хамгийн их ашиглагддаг унших tool. Гэтэл түүний хэрэгжүүлэлт `fetchDashboardStats` (`data-assistant/functions.ts:52-75`) нь **устгагдсан e-commerce-ийн `orders` хүснэгтээс** орлогыг уншдаг:

```ts
supabaseAdmin.from('orders').select('total_amount')...   // functions.ts:56
const totalRevenue = revenueRes.data?.reduce(...) || 0;   // үргэлж 0
```

`orders` нь `001_initial_schema_safe.sql`-д үлдсэн боловч үл хөдлөхийн апп түүн рүү **хэзээ ч бичдэггүй** — бодит орлого `property_contracts` дээр байдаг. Үр дүн: менежер эсвэл захирал AI-аас «энэ сарын орлого хэд вэ?» гэж асуухад **итгэлтэйгээр 0₮ гэж хариулна**. Мөн `get_product_stats` (устгагдсан `products`) `property-expert` агентад залгаастай (`agents.ts:45`), `list_orders` `index.ts:70`-д бүртгэлтэй.

Энэ нь AI-д итгэх итгэлийг эвдэх ганц хамгийн том шалтгаан бөгөөд Фаз 0-д багтсан.

### 7.2 Эхний өдөр шалгах: Gemini загварын ID

Кодод **5 өөр загварын ID, 16 газарт** хатуу бичигдсэн, төвлөрсөн тогтмол байхгүй:

| ID | Тоо | Гол ашиглалт |
|----|-----|--------------|
| `gemini-3.5-flash` | 11 | `orchestrator/planner.ts:15`, `runAgent.ts:22`, `orchestrator/index.ts:23` |
| `gemini-3-pro` | 5 | `lib/ai/config/plans.ts` |
| `gemini-3-flash` | 1 | — |
| `gemini-3-nano` | 1 | — |
| `gemini-1.5-flash` | 1 | — |

`gemini-3.5-flash` нь орчестраторын гурван гол цэгт бүгдэд нь ашиглагдаж байгаа тул **хэрэв энэ ID хүчингүй бол AI чат бүхэлдээ ажиллахгүй** — өөрөөр хэлбэл энэ нь ирээдүйн эрсдэл биш, өнөөдрийн блокер байж болзошгүй. API түлхүүрээр `models.list` дуудаж эхний өдөр баталгаажуулах шаардлагатай; дараа нь `src/lib/ai/config/models.ts` + `GEMINI_MODEL` env рүү төвлөрүүлнэ (Фаз 4, §4).

### 7.3 Ажиллаж байгаа зүйлс (эвдэхгүй байх)

- **Чатын түүх хадгалагдана**, RLS зөв — `ai_conversations` / `ai_messages` (`20260322000000`, `user_id = auth.uid()`).
- **Баталгаажуулалтын урсгал** бодитоор ажиллаж, `logAiAudit` зөвхөн жинхэнэ гүйцэтгэл дээр бичдэг.
- **`data_audit_log` схем зөв** (`actor_id`, `entity`, `action`, `changes`) — зөвхөн дуудлага дутуу, шинэ хүснэгт хэрэггүй.
- **Cron дэд бүтэц бэлэн** — 12 cron (`vercel.json`), түүний дотор `task-reminders`, `director-digest`.
- **Migration-д тэсвэртэй унших** — багана байхгүй үед 500 өгөхгүй degrade хийдэг.
- **PWA-ийн суурь бэлэн** — `public/manifest.json`, `public/sw.js` байгаа (icon зам ба deep link л засагдана).
