# Дотоод системийн аудит — илэрсэн сул тал ба сайжруулах төлөвлөгөө

> Аудит хийсэн огноо: 2026-07-24
> Хамрах хүрээ: `src/app/api` (132 route), `src/lib` (auth, rbac, audit, ai, erp), `src/app/dashboard`, `supabase/migrations` (126 migration), CI тохиргоо
> Арга: 7 чиглэлээр кодын статик шинжилгээ хийж, олдвор бүрийг **сөрөг шалгуураар** (өөр шалгагч кодыг дахин уншиж унагаах гэж оролдох) баталгаажуулав
> Үр дүн: **94 олдвор**, нэг ч унагаагдаагүй — 49 бүрэн батлагдсан, 45 хэсэгчлэн (нөлөө нь тодотгогдсон)

---

## 1. Яагаад энэ ажил хэрэгтэй вэ

Vertmon Hub нь одоо зөвхөн CRM биш — санхүү (ERP), худалдан авалт, гэрээ, төлбөрийн хуваарь, маркетингийн төсөв зэрэг **мөнгөн дүнтэй үйлдлүүдийг** агуулж байна. Гэтэл систем дээр «хэн, хэзээ, юуг, яаж өөрчилсөн» гэдгийг бүртгэдэг механизм бараг хэрэгжээгүй.

Аудитаар энэ нь дангаараа биш, **гурван эрсдэл давхарласан** байдлаар илэрлээ:

1. Эргэлт буцалтгүй үйлдэл (гэрээ бүрмөсөн устгах) —
2. ул мөр үлдээхгүй (аудит бичигдэхгүй) —
3. хангалтгүй эрхээр хийгдэнэ (устгах эрх шалгагдахгүй).

Энэ гурав нэг дор давхацсан газар бол системийн хамгийн эмзэг цэг. Мөн зэрэгцээд **гадны халдагч ашиглаж болох нүхнүүд** илэрсэн тул тэдгээрийг эхлээд хаах ёстой.

---

## 2. Одоогийн байдал — тоон дүр зураг

| Үзүүлэлт | Утга | Тайлбар |
|---|---|---|
| Нийт API route | **132** | |
| Ямар нэг нэвтрэлтийн шалгалттай | **108 / 132** | Нэвтрэлт (authentication) ерөнхийдөө байна |
| Модулийн эрхийн шалгалттай | **36 / 132** | Зөвшөөрөл (authorization) **зөвхөн 27%-д** |
| Өөрчлөлт хийдэг route (POST/PATCH/PUT/DELETE) | **86** | |
| Аудит бичдэг route | **5 / 86 (≈6%)** | |
| Салангид аудит суваг | **5** | `data_audit_log`, `admin_audit_log`, `ai_audit_log`, `finance_audit_log`, `ai_attachments` |
| Аудит логийг UI-аас харах боломж | **1 / 5** | Зөвхөн `ai_audit_log` |
| Server талын модуль шалгалттай dashboard хуудас | **0 / 36** | Эрх нь зөвхөн Sidebar-ын client filter |
| Тест файл | **21** | Эрх, tenant, аудит, мөнгө — критик замуудад **0 тест** |
| Ажиллаж буй алдааны хяналт | **0** | Sentry гурван config-той ч ачаалагддаггүй |

### 2.1 Сайн хийгдсэн зүйлс (эдгээрийг эвдэхгүй байх)

Аудит шударга байх ёстой — суурь архитектур олон газар зөв тавигдсан:

- **`getUserShop()`** (`src/lib/auth/supabase-auth.ts`) нь `x-shop-id` header-ийг хэрэглэгчийн хандах эрхтэй дэлгүүрүүдтэй **тулгаж шалгадаг**. «Header-т дурын UUID бичээд өөр компанийн өгөгдөл харах» гэсэн сонгодог нүх энд **байхгүй**. Энэ нь олон route-ыг аварсан.
- **`getAccessibleShopIds()`** нь эзэмшсэн + гишүүнчлэлтэй дэлгүүрийг зөв нэгтгэдэг.
- **`POST /api/ai-assistant/action`** — хэрэглэгчийг дахин тодорхойлж, RBAC-г дахин шалгаж, tool-ыг цагаан жагсаалттай тулгаж, shop гишүүнчлэлийг баталгаажуулдаг. Бусад route-д тархаах ёстой загвар.
- Webhook нь гарын үсэг шалгадаг, идемпотент (`webhook_dedup`), 12/12 cron route нууц түлхүүрийн шалгалттай, CI бий, `manager_performance` view-үүд `security_invoker`-той.

### 2.2 🔴 Ноцтой (critical) — нэн даруй засах

#### C-1. Гэрээг бүрмөсөн (hard) устгадаг бөгөөд ул мөр үлдээхгүй

`src/app/api/dashboard/contracts/[id]/route.ts:50-56`

```ts
const supabase = supabaseAdmin();
const { error } = await supabase
    .from('property_contracts')
    .delete()                                   // ← HARD DELETE
    .eq('id', id).eq('shop_id', authShop.id);
```

Устгал нь **эргэлт буцалтгүй**: каскадаар төлбөрийн хуваарь, хүлээлцэх акт устаж, кассын гүйлгээ өнчирнө. Мөн аудит бичилт хийгддэггүй тул **хэн устгасныг хожим тогтоох боломжгүй**. `property_contracts.deleted_at` багана migration `20260617120000`-д аль хэдийн нэмэгдсэн, AI давхарга түүнийг ашигладаг атал UI-ийн устгал hard delete хэвээр байсан — хоёр зам зөрчилдөж байв.

> Залруулга: эрхийн шалгалт нь **байгаа** — `requireModuleDelete('contracts')` мөр 42-т дуудагддаг. Аудитын эхний хувилбарт энэ нь дутуу гэж бичсэн нь буруу байсан.

#### C-2. Төлбөр бүртгэхэд гэрээний нийт дүн шинэчлэгддэггүй

`src/app/api/dashboard/contracts/[id]/payments/route.ts:69-96` — гэрээг зөвхөн **оршин байгаа эсэхийг** шалгахаар `select('id')` хийгээд (мөр 70-74), бичилтийг `payment_schedules`-д л хийдэг. `property_contracts.paid_amount` болон `balance` **хэзээ ч шинэчлэгддэггүй**.

Үр дагавар: цуглуулалтын бүх KPI, `manager_monthly_sales`, санхүүгийн тайлан, дашбордын орлого — бүгд бодит байдлаас зөрнө. Энэ бол чимээгүй, өдөр бүр хуримтлагддаг алдаа.

#### C-3. `PATCH /api/admin/users` дурын дүрийг шалгалтгүй онооно

Админ эрхтэй (гэхдээ `super_admin` биш) хэрэглэгч өөрийгөө `super_admin` болгож чадна. Дүрийн нэр цагаан жагсаалттай тулгагддаггүй.

#### C-4. `/api/ai-assistant/analyze-messages` нь нэвтрэлтгүй, өөр компанийн чатыг уншина

`src/app/api/ai-assistant/analyze-messages/route.ts:8-24` — auth шалгалт **огт байхгүй**. `shopId`-г хүсэлтийн биеэс аваад, RLS тойрдог `supabaseAdmin()`-аар `chat_history`-оос 100 мессеж уншиж Gemini рүү илгээдэг.

```ts
const { shopId } = await req.json();          // ← гаднаас ирсэн утга
const supabase = supabaseAdmin();             // ← RLS тойрно
await supabase.from('chat_history')
    .select('role, content').eq('shop_id', shopId).limit(100);
```

Интернэтээс хэн ч дурын компанийн **харилцагчийн бодит чат харилцааг** (нэр, утас, хэлэлцээрийн агуулга) татна. Хажуугийн `api/ai-assistant/route.ts:38-75` дээр яг зөв хамгаалалт (`resolveApiUser` → модуль шалгалт → `shopId`-г гишүүнчлэлтэй тулгах) байгаа — энэ route түүнийг л хуулж авахад хангалттай.

> Нарийвчлал: `middleware.ts:24` дэх `aiRoutes`-д `/api/ai-assistant` багтдаг тул энэ зам strict rate-limit-д ордог. Энэ нь Gemini-ийн зардал шавхах эрсдэлийг хязгаарладаг ч **өгөгдөл алдагдах гол эрсдэлд огт нөлөөлөхгүй**.

#### C-5. Хүчингүй болсон `vertmon-session` cookie нь хаагдаагүй арын хаалга

`src/app/api/auth/login/route.ts:171` — нэвтрэлтийн урсгал энэ cookie-г зөвхөн **устгадаг** («Clear legacy custom cookie»). Өөрөөр хэлбэл системд үүнийг **олгодог код байхгүй болсон**. Гэтэл 8 файл түүнийг хүлээн авсаар, гурван үл нийцэх форматаар:

| Файл | Тайлах арга | Эрсдэл |
|---|---|---|
| `marketing/facebook/{route,posts,publish,insights}`, `marketing/instagram` | `JSON.parse(Buffer.from(v,'base64'))` → `parsed.user_id` | **Гарын үсэг огт шалгахгүй** — `base64({"user_id":"<UUID>"})` үүсгээд тухайн хэрэглэгчээр нэвтэрнэ |
| `src/middleware.ts:82-88` | JWT-г хувааж payload уншаад `exp`/`sub` шалгана | Тайлбарт «Verify JWT signature» гэж бичсэн ч **гарын үсэг шалгагдахгүй** |
| `lib/auth/resolve-user.ts:9`, `lib/admin/auth.ts:21` | AES-256-GCM | Түлхүүр тохируулаагүй үед нийтэд ил `'fallback-secret-key-32chars-min!!'` |

Маркетингийн 5 route дээр хамгийн ноцтой: халдагч `Cookie: vertmon-session=base64({"user_id":"<UUID>"})` илгээхэд `getAccessibleShopIds(userId)` хохирогчийн **бүх** дэлгүүрийг буцаах тул гишүүнчлэлийн шалгалт утгагүй болно. Үр дүнд нь өөр компанийн Facebook Page-д **нэрийн өмнөөс нийтлэл тавих** боломжтой.

> Нарийвчлал: мөлжихийн тулд хохирогчийн UUID урьдчилан хэрэгтэй (UUIDv4 таамаглах боломжгүй, түүнийг задруулдаг endpoint аудитаар олдсонгүй). Тиймээс «дурын хүн шууд» биш — гэхдээ UUID нь урилга, профайлаар алдагддаг тул нэвтрэлт тойрох (authentication bypass) шинж чанар нь хэвээр.

**Засвар хялбар:** хууль ёсны хэрэглэгч ашигладаггүй тул хүлээн авах бүх замыг **устгахад хэн ч хохирохгүй** — код хасах ажил. Анхаар: `requireModule` нь `getUserId()` (зөвхөн Supabase cookie)-д тулгуурладаг тул шилжүүлэхдээ `resolveApiUser()` загварыг ашиглана.

#### C-6. DM AI гадны хүнд бусдын гэрээ, төлбөрийн үлдэгдлийг гаргаж өгнө

Facebook/Instagram-аар бичсэн **хэн ч** `check_payment_status` tool-оор дамжуулан өөр худалдан авагчийн гэрээ, төлсөн дүн, үлдэгдлийг гаргуулж авах боломжтой. Хувийн мэдээлэл гадагш алдагдах шууд суваг.

#### C-7. Sentry огт ачаалагддаггүй — бүх алдаа замхардаг

`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` гурвуулаа байгаа боловч:

- `instrumentation.ts` **байхгүй** (Next.js 16 Sentry-г үүгээр ачаалдаг)
- `next.config.ts`-д `withSentryConfig` **холбоогүй**

Тиймээс бүх `captureException` хоосон руу явна. Production дээр юу эвдэрсэнийг мэдэх арга байхгүй.

#### C-8. Cron-ууд алдаа гарсан ч `success: true` буцаана

Аль нэг cron 3 хоног унасан ч (жишээ нь `task-reminders` сануулга илгээхгүй байх) хэн ч мэдэхгүй. C-7-тэй хослоод систем **бүрэн харалган** болно.

#### C-9. `finance_audit_log`-д actor хэзээ ч бичигддэггүй

`src/lib/erp/audit.ts:8-25` — `logFinanceAudit` нь `actorId` параметр **авдаггүй**. Хүснэгтэд `created_by` багана байсаар атал үргэлж NULL. **Мөнгөтэй холбоотой үйлдлийг хэн хийснийг мэдэх боломжгүй** — аудитын хамгийн чухал талбар дутуу.

### 2.3 🟠 Өндөр (high)

| # | Олдвор | Байршил |
|---|---|---|
| H-1 | **Сервер тал дээр DB-ийн эрх огт уншигддаггүй.** `resolvePermissions` → `fetchRolePermissions(role)`-г client-гүй дууддаг тул **anon** client үүсч, RLS-д хаагдаад үргэлж static fallback руу унана. Админ UI-аас тохируулсан эрх сервер дээр **хэзээ ч мөрдөгддөггүй** | `lib/auth/require-permission.ts:22`, `lib/rbac.ts:176-196` |
| H-2 | 20+ mutating route `canWrite` огт шалгахгүй — зөвхөн session + shop гишүүнчлэлээр бичдэг | олон |
| H-3 | `/api/dashboard/export/excel` эрхийн шалгалтгүйгээр бүх лийд, харилцагчийг Excel болгож гаргана | `api/dashboard/export/excel` |
| H-4 | `/api/ai-settings` модуль ч, бичих эрх ч шалгахгүй — дурын гишүүн үйлчлүүлэгчид хариулдаг AI-ийн мэдлэгийг өөрчилнө | `api/ai-settings` |
| H-5 | Зөөлөн устгасан гэрээ жагсаалт, статистик, Excel экспорт, санхүүгийн тайланд **дахин гарч ирдэг** (менежерийн view-тай зөрчилддөг) | олон GET |
| H-6 | Мөнгөний нэгтгэлүүд `.limit(1000)`-д чимээгүй тасарч бодитоос **бага дүн** харуулна (Мандала 1600+ гэрээтэй) | `my-stats:171`, `kpi-report:141` |
| H-7 | `PATCH /contracts/[id]/payments` Zod шалгалтгүй — body шууд DB рүү (mass assignment + аудитгүй мөнгө засвар) | `contracts/[id]/payments` |
| H-8 | `/api/auth/instagram/accounts` auth-гүйгээр Page access token-ыг browser руу задална | `api/auth/instagram/accounts` |
| H-9 | Instagram OAuth callback нь Page access token-уудыг **production лог руу ил хэвлэдэг** | `api/auth/instagram/callback` |
| H-10 | Middleware дахь «JWT баталгаажуулалт» гарын үсгийг шалгадаггүй — хуурамч cookie-гоор `/dashboard`, `/admin` нээгдэнэ | `middleware.ts:82-88` |
| H-11 | Cron-ууд `CRON_SECRET` тохируулаагүй үед **бүрэн нээлттэй** (fail-open, 12/12) | `lib/auth/cron.ts:13` |
| H-12 | `/api/dashboard/upload` файлын төрөл/хэмжээ шалгалгүй нийтэд нээлттэй bucket руу байршуулна | `api/dashboard/upload` |
| H-13 | Нэхэмжлэхийн төлбөрт read-modify-write race — зэрэг хийсэн хоёр төлбөрийн нэг нь алга болно | `procurement/bills/[id]/pay` |
| H-14 | Лийдийг `closed_won` болгоход **менежергүй, дүнгүй хий гэрээ** үүсч борлуулалтын тайлангаас унана | `leads/[id]/convert` |
| H-15 | `overdue_days` хэзээ ч 0 болж буцдаггүй — төлбөрөө барагдуулсан гэрээ мөнхөд «хугацаа хэтэрсэн» | `cron/overdue-check` |
| H-16 | Excel гэрээ импорт: upsert бүтэлгүйтвэл чимээгүй энгийн insert рүү унаж **давхардсан гэрээ** үүсгэнэ | `admin/import` |
| H-17 | `executeDataTool` модулийн эрхийг шалгадаггүй — AI-аар дамжуулан эрхгүй модулийн өгөгдөл унших/бичих | `lib/ai/data-assistant` |
| H-18 | 6 бичих tool баталгаажуулалтгүй ШУУД гүйцэтгэгдэж, `ai_audit_log`-д бүртгэгддэггүй | `lib/ai/data-assistant/tools.ts` |
| H-19 | `remember_fact` аудитгүй бичиж, `ai_shop_memory` нь дараагийн **бүх** ажиллагааны системийн зааварт шигдэнэ (persistent prompt injection) | `lib/ai/orchestrator` |
| H-20 | `invite_user` tool өөр төслийн хэрэглэгчийн нууц үгийг дахин тохируулж **чатад ил гаргана** | `lib/ai/data-assistant` |
| H-21 | Нийтийн `/api/leads` бүх лидийг «хамгийн эртний дэлгүүр» рүү хатуу бичдэг — tenant хоорондын лид холилдоно | `api/leads` |
| H-22 | Аудит хүснэгтүүд **өөрчлөгдөх/устгах боломжтой** — append-only хамгаалалт байхгүй | migrations |
| H-23 | Нэвтрэлтийн үйл явдал огт бүртгэгддэггүй (амжилттай/амжилтгүй login, logout, shop сэлгэлт) | — |
| H-24 | Excel экспорт — өгөгдөл гадагш гарах гол суваг — ямар ч ул мөр үлдээхгүй | — |
| H-25 | Роль үүсгэх/өөрчлөх/устгахыг **API-аар** хийвэл бүртгэгддэггүй, **AI-аар** хийвэл бүртгэгддэг (урвуу байдал) | `admin/roles` |
| H-26 | 5 аудит хүснэгтийн 4-ийг UI/API-аас харах зам байхгүй — «dead log» | — |
| H-27 | RBAC guard, shop scoping, cron auth, гэрээний мөнгө — критик замуудад **нэг ч тест байхгүй** | — |
| H-28 | CI-д lint нь `continue-on-error: true` — аюулгүй байдлын дүрэм хэзээ ч блоклодоггүй | `.github/workflows/ci.yml` |
| H-29 | `/api/health` нь DB, Gemini, Meta холболтыг шалгадаггүй — env хувьсагч байгаа эсэхээр л 200 буцаана | `api/health` |
| H-30 | `POST /api/ai-assistant/action` клиентээс ирсэн tool+args-д итгэдэг — AI-ийн санал болгосон үйлдэлтэй холбогдоогүй (RBAC-аар хязгаарлагддаг ч) | `api/ai-assistant/action` |

### 2.4 🟡 Дунд ба бага (сонгож авсан)

- `user_roles`-д `shop_id` байхгүй (`UNIQUE(user_id)`) — дүр бүх tenant дээр **глобал**. `assign_role` нь `shopId`-г огт ашигладаггүй тул дүр бусад төсөлд шилжинэ.
- Тусгайлан бичсэн `assertShopAccess()` баталгаажуулагч **хаана ч дуудагдаагүй dead code**.
- `conversationId`-ийн эзэмшил шалгагддаггүй → өөр хэрэглэгчийн AI ярианд мессеж шигтгэх.
- Аудит бичилтэд **өмнөх утга (before) хадгалагддаггүй** — сэргээх, маргаан таслах боломжгүй.
- Харилцагчийн бүрмөсөн устгалт (merge, Meta data-deletion) бүртгэгддэггүй; merge нь transaction-гүй тул хагас нэгтгэл үлдэнэ.
- Аудит бичилт бүтэлгүйтвэл **чимээгүй алгасагдана** — дохио, дахин оролдлого байхгүй.
- Facebook Lead Ads webhook-ийн гарын үсгийн шалгалт нөхцөлт (fail-open), гол webhook-оос ялгаатай.
- Нээлттэй лидийн форм дээр 3 давхар fail-open (origin, CORS, captcha).
- Rate limit нь клиентийн өгсөн `x-forwarded-for`-ийн эхний утгад тулгуурлана.
- 126 migration гараар тавигддаг, ямар нь тавигдсаныг мэдэх арга байхгүй; код 14 газар чимээгүй degrade хийдэг.
- `/marketing/*` хуудсууд `protectedRoutes`-д ороогүй.
- `errorHandler.ts` бүхэлдээ dead code — 19 тест ажиллахгүй кодыг шалгаж coverage-ийг хуурамчаар өсгөнө.
- `isValidRole()` хуучирсан — `finance_manager`, `accountant`-ыг мэдэхгүй.
- `CLAUDE.md` кодоос хоцорсон: `finance`, `procurement`, `customer-service`, `units`, `hubspot`, `erp` баримтжаагүй.

---

## 3. Үндсэн шалтгааны дүгнэлт

94 олдвор нь санамсаргүй биш — **дөрвөн системийн шалтгаанаас** урган гарч байна:

1. **Нэвтрэлтийн олон зам зэрэгцэн оршдог.** Supabase Auth, `vertmon-session` (3 формат), `getAdminUser`, `resolveApiUser`, `getUserShop` — route бүр өөрийн хослолыг сонгодог. Ганц цонх байхгүй тул нэг замын сул тал бүх системд тархдаг.
2. **Зөвшөөрөл ба аудит нь route бүрийн «сайн дурын» ажил.** Санаж байвал `requireModule` дуудна, санахгүй бол алгасна. Дефолт нь «хамгаалалтгүй» — **дефолт нь «хамгаалалттай» байх ёстой**.
3. **Аудит хэрэгцээ бүрийн хувьд тусад нь нэмэгдсэн.** Санхүү нэмэгдэхэд `finance_audit_log`, AI нэмэгдэхэд `ai_audit_log` үүссэн. Тиймээс схем нь тус бүрдээ өөр, нэгдсэн харагдац боломжгүй, зарим нь actor эсвэл shop талбаргүй.
4. **Алдааг нуух зуршил кодод шингэсэн.** `catch {}`, `safeCount → 0`, `success: true`, best-effort аудит, чимээгүй fallback — эдгээр нь тус тусдаа зөв санаа боловч давхарласнаар систем **эвдэрсэн ч эрүүл харагддаг** болсон. C-7 (Sentry үхмэл), C-8 (cron худал success), H-5 (устгасан гэрээ эргэж ирэх) бүгд энэ загварын үр дагавар.

**Гол дүгнэлт:** 2 ба 3-р шалтгаан **нэг цэгээс** засагдана. Route бүр эрхээ шалгуулж, аудитаа бичдэг **нэг туслах функц** нэвтрүүлбэл хоёр асуудал зэрэг шийдэгдэнэ.

---

## 4. Шийдлийн архитектур — нэгдсэн `apiContext()` + `activity_log`

### 4.1 Гол санаа

Route бүрийн эхэнд дуудагдах **ганц туслах функц** 4 зүйлийг нэгэн зэрэг хийнэ:

1. Хэрэглэгчийг тодорхойлох (ганц зөвшөөрөгдсөн зам)
2. Модуль + бичих/устгах эрхийг шалгах
3. Зорилтот `shop_id`-г баталгаажуулах
4. Хүсэлтийн контекст (actor, shop, IP, UA)-оор **урьдчилан холбогдсон аудит бичигч** буцаах

```ts
// src/lib/api/context.ts  (шинэ)

export interface ApiContext {
    userId: string;
    userName: string;          // user_profiles.full_name — тайланд ашиглана
    role: string;
    permissions: RolePermissions;
    shopId: string;
    /** actor/shop/IP/UA урьдчилан бөглөгдсөн аудит бичигч */
    audit: (e: Omit<AuditEvent, 'shopId' | 'actor' | 'request'>) => Promise<void>;
}

/**
 * Route-ийн эхэнд дуудна. Эрхгүй бол NextResponse (401/403) буцаана —
 * тэр тохиолдолд status:'denied' аудит бичилт АВТОМАТААР хийгдэнэ.
 */
export async function apiContext(
    req: Request,
    opts: { module: DashboardModule; action?: 'read' | 'write' | 'delete' },
): Promise<{ ctx: ApiContext } | { error: NextResponse }>;
```

Хэрэглээ:

```ts
export async function DELETE(req: Request, { params }: Ctx) {
    const r = await apiContext(req, { module: 'contracts', action: 'delete' });
    if ('error' in r) return r.error;        // 401/403 + denied аудит автоматаар
    const { ctx } = r;

    const { id } = await params;
    const before = await loadContract(id, ctx.shopId);
    await softDeleteContract(id, ctx.shopId);   // hard delete БИШ

    await ctx.audit({
        entity: 'contract', entityId: id, action: 'delete',
        summary: `${before.contract_number} гэрээг устгав`,
        before, after: null,
    });

    return NextResponse.json({ success: true });
}
```

Ингэснээр эрхийн шалгалт ба аудит хоёулаа route бичих **ердийн урсгалын салшгүй хэсэг** болно.

### 4.2 `activity_log` схем

Хэрэглэгчийн сонгосон гурван зорилго (удирдлагын хяналт / аюулгүй байдал / өгөгдөл сэргээлт) тус бүрийг хангах талбарууд:

```sql
create table public.activity_log (
    id            uuid primary key default gen_random_uuid(),
    occurred_at   timestamptz not null default now(),

    -- ХЭН (удирдлагын хяналт)
    shop_id       uuid references public.shops(id) on delete set null,
    actor_id      uuid,
    actor_name    text,            -- snapshot: хүн гарсан ч тайлан эвдэрхгүй
    actor_role    text,            -- үйлдлийн үеийн дүр (snapshot)
    source        text not null,   -- 'ui' | 'ai' | 'cron' | 'webhook' | 'import' | 'api'

    -- ЮУГ
    entity        text not null,
    entity_id     text,
    action        text not null,   -- 'create'|'update'|'delete'|'export'|'login'|'role_change'
    summary       text,            -- монголоор, хүн уншихуйц нэг мөр

    -- ЯАЖ ӨӨРЧЛӨГДСӨН (өгөгдөл сэргээлт)
    before        jsonb,           -- зөвхөн өөрчлөгдсөн талбарууд
    after         jsonb,

    -- ХААНААС (аюулгүй байдал)
    request_ip    inet,
    user_agent    text,
    request_id    text,

    status        text not null default 'success',  -- 'success'|'denied'|'error'
    error_message text
);

create index on public.activity_log (shop_id, occurred_at desc);
create index on public.activity_log (entity, entity_id, occurred_at desc);
create index on public.activity_log (actor_id, occurred_at desc);
create index on public.activity_log (shop_id, status, occurred_at desc)
    where status <> 'success';     -- аюулгүй байдлын самбарт
```

**Өөрчлөгдөшгүй (append-only) байдал** — H-22-ийн шийдэл, аудитын үнэ цэнэ энд оршино:

```sql
alter table public.activity_log enable row level security;

create policy activity_log_read on public.activity_log
    for select using (
        shop_id in (select shop_id from public.shop_members where user_id = auth.uid())
        or exists (select 1 from public.shops where id = shop_id and user_id = auth.uid())
    );

-- INSERT/UPDATE/DELETE policy ЗОРИУДААР үүсгэхгүй → зөвхөн service-role бичнэ
revoke update, delete on public.activity_log from authenticated, anon;

-- service-role ч гэсэн өөрчилж чадахгүй
create or replace function public.activity_log_immutable()
returns trigger language plpgsql as $$
begin
    raise exception 'activity_log нь өөрчлөгдөшгүй (append-only)';
end $$;

create trigger activity_log_no_update before update or delete
    on public.activity_log for each row execute function public.activity_log_immutable();
```

### 4.3 Бичих туслах

```ts
// src/lib/audit/log.ts  (шинэ)
export async function logActivity(e: AuditEvent): Promise<void>;

/** before/after-оос ЗӨВХӨН өөрчлөгдсөн талбарыг ялгана — лог хөөрөгдөхгүй */
export function diffFields<T extends object>(
    before: T | null, after: T | null, ignore?: string[],
): { before: Partial<T>; after: Partial<T> };
```

- **Эмзэг талбарыг шүүнэ** — нууц үг, `access_token` төрлийн талбарыг автоматаар хасна (`lib/crypto/tokens.ts`-тэй уялдуулна). H-9-тэй мөн холбоотой.
- **Best-effort хэвээр, гэхдээ дуугүй биш** — бичилт унавал үндсэн үйлдлийг унагахгүй, харин Sentry рүү мэдэгдэнэ (C-7 засагдсаны дараа энэ утга учиртай болно).

### 4.4 Удирдлагын харагдац

- **`/dashboard/audit`** (шинэ, `reports` модулиар хамгаалагдсан) — огноо / менежер / модуль / үйлдлээр шүүх, before→after харьцуулалт.
- Гэрээ, лийд, харилцагчийн дэлгэрэнгүйд **«Өөрчлөлтийн түүх» таб** — `EntityAttachments`-ийн хажууд.
- **Аюулгүй байдлын хэсэг** — `status <> 'success'`: эрх давсан оролдлого, амжилтгүй нэвтрэлт, сэжигтэй IP.

---

## 5. Гүйцэтгэлийн үе шатууд

Эрэмбийг **эрсдэл ÷ хөдөлмөр** харьцаагаар тогтоов.

### Үе 0 — Яаралтай ✅ ХИЙГДСЭН

| # | Ажил | Олдвор | Төлөв |
|---|---|---|---|
| 0.1 | `vertmon-session` хүлээн авах **бүх** замыг устгав (middleware, `resolve-user`, `admin/auth`, маркетингийн 5 route) | C-5, H-10 | ✅ |
| 0.2 | `analyze-messages`-д нэвтрэлт + модулийн эрх + `assertShopAccess()` нэмэв | C-4 | ✅ |
| 0.3 | `admin/users` PATCH-д `super_admin` шаардаж, дүрийн цагаан жагсаалт нэмэв | C-3 | ✅ |
| 0.4 | Гэрээний устгалыг `deleted_at` (зөөлөн) болгож, `recordAudit` нэмэв | C-1 | ✅ |
| 0.4b | Гэрээний уншилтад `deleted_at` шүүлт нэмэв — 12 файл, 15 query | H-5 | ✅ |
| 0.5 | `src/instrumentation.ts` + `instrumentation-client.ts` + `withSentryConfig`; CSP-д Sentry ingest | C-7 | ✅ |
| 0.6 | DM AI `check_payment_status` — нэрээр хайхыг хааж, утсаар баталгаажуулдаг болгов | C-6 | ✅ |
| 0.7 | Page token-ыг логоос болон `instagram/accounts` хариунаас хасав; auth нэмэв | H-8, H-9 | ✅ |
| 0.8 | `CRON_SECRET` production-д заавал; `timingSafeEqual` | H-11 | ✅ |
| 0.9 | `dashboard/upload`-д MIME цагаан жагсаалт + 10MB хязгаар | H-12 | ✅ |
| 0.10 | `.claude/settings.local.json`-г `.gitignore`-т оруулав (DB нууц үг агуулж байсан) | — | ✅ |

**Шалгалт:** `typecheck` цэвэр, `275/275` тест ногоон, `lint` 0 алдаа, production build амжилттай.

> ⚠️ **Дагалдах үйлдэл:** `.claude/settings.local.json` дотор Supabase DB-ийн нууц үг ил байсан бөгөөд git түүхэнд үлдсэн. Файлыг цаашид мөрдөхөө болиулсан ч **нууц үгийг Supabase дээр заавал солих (rotate) шаардлагатай** — түүхээс арилахгүй.

> 0.4-ийн улмаас гэрээний уншилтууд заавал шүүгдэх ёстой болсон тул H-5-ийн гэрээтэй холбоотой хэсгийг Үе 1-ээс урагшлуулж хийв. Лийд/харилцагч/уулзалтын зөөлөн устгалын шүүлт Үе 1-д хэвээр.

### Үе 1 — Мөнгө ба өгөгдлийн бүрэн бүтэн байдал (3–5 өдөр)

| # | Ажил | Олдвор |
|---|---|---|
| 1.1 | Төлбөр бүртгэхэд гэрээний `paid_amount`/`balance` шинэчлэх (DB trigger нь давхар бичилтээс хамгаална) | C-2 |
| 1.2 | `.limit(1000)` / `.limit(500)` нэгтгэлүүдийг бүрэн тоолол эсвэл SQL `sum()` болгох | H-6 |
| 1.3 | Зөөлөн устгалын шүүлтийг бүх GET, экспорт, статистикт нэгтгэх | H-5 |
| 1.4 | `payments` PATCH-д Zod схем нэмэх | H-7 |
| 1.5 | `overdue_days` сэргэх логик; `closed_won` хөрвүүлэлтэд менежер/дүн шаардах | H-14, H-15 |
| 1.6 | Cron-ууд бодит үр дүн буцаадаг болгох + уналтыг мэдэгдэх | C-8 |

### Үе 2 — Суурь тавих (3–5 өдөр)

| # | Ажил |
|---|---|
| 2.1 | `activity_log` migration (схем + индекс + RLS + immutable trigger) |
| 2.2 | `src/lib/audit/log.ts` — `logActivity`, `diffFields`, эмзэг талбарын шүүлт |
| 2.3 | `src/lib/api/context.ts` — `apiContext()`; эрхгүй үед `status:'denied'` автомат бичилт |
| 2.4 | **H-1 засах**: `fetchRolePermissions`-д service-role client дамжуулж, DB эрх бодитоор уншигддаг болгох |
| 2.5 | `user_roles`-д `shop_id` нэмэх (дүр tenant тус бүрээр); `assign_role`-ыг залгах |
| 2.6 | Нэгжийн тест: `diffFields`, `apiContext`-ийн зөвшөөрлийн матриц (дүр × модуль × үйлдэл) |

### Үе 3 — Route шилжүүлэлт (2 долоо хоног, модуль тус бүрээр)

86 mutating route-ыг `apiContext()` рүү шилжүүлнэ. **Мөнгө ба хувийн мэдээлэлтэйг эхэнд:**

1. `contracts`, `finance`, `procurement` (~18 route)
2. `leads`, `customers`, `viewings` (~20 route)
3. `properties`, `marketing`, `surveys`, `tasks` (~28 route)
4. `admin/*` (~12 route)
5. Үлдсэн (~8 route)

Модуль бүрийн дараа §6-ийн скриптээр хамрах хүрээг **тоолж** баталгаажуулна.

### Үе 4 — Харагдац ба хамрах хүрээг гүйцээх (1 долоо хоног)

| # | Ажил | Олдвор |
|---|---|---|
| 4.1 | `/dashboard/audit` хуудас — шүүлтүүр, before→after | H-26 |
| 4.2 | Гэрээ / лийд / харилцагчийн «Өөрчлөлтийн түүх» таб | — |
| 4.3 | Нэвтрэлтийн үйл явдал (login/logout/амжилтгүй/shop сэлгэлт) | H-23 |
| 4.4 | **Экспортын бүртгэл** — `export/excel`, `finance/reports/export` | H-3, H-24 |
| 4.5 | Dashboard хуудсуудад server талын модуль шалгалт | §2.2 |
| 4.6 | AI гадаргуу: `executeDataTool`-д модулийн шалгалт, баталгаажуулалтгүй 6 tool-ыг гарцад оруулах | H-17, H-18, H-19 |

### Үе 5 — Нэгтгэл ба тогтвортой байдал (3–5 өдөр)

| # | Ажил | Олдвор |
|---|---|---|
| 5.1 | Хуучин 4 сувгийг `activity_log` руу шилжүүлэх; хуучин хүснэгтийг зөвхөн унших архив болгох | C-9 |
| 5.2 | Хадгалах хугацаа (24 сар) + архивлах cron | — |
| 5.3 | CI: lint-ийн `continue-on-error` устгах; `apiContext`-гүй шинэ mutating route нэмэгдвэл **build унана** | H-28 |
| 5.4 | `/api/health`-д бодит холболтын шалгалт | H-29 |
| 5.5 | `CLAUDE.md` шинэчлэх: `finance`, `procurement`, `customer-service` + аудитын шинэ дүрэм | §2.4 |

---

## 6. Батлах арга (verification)

**Автомат:**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

**Хамрах хүрээний хэмжүүр** (үе бүрийн ахиц тоогоор харагдана):

```bash
# Эрхийн шалгалттай route (зорилт: 36 → 132)
grep -rlE "apiContext|requireModule|requireWrite|requireDelete" src/app/api --include=route.ts | wc -l

# Аудит бичдэг mutating route (зорилт: 5 → 86)
for f in $(grep -rlE "export async function (POST|PATCH|PUT|DELETE)" src/app/api --include=route.ts); do
  grep -qE "ctx\.audit|logActivity" "$f" || echo "АУДИТГҮЙ: $f"
done
```

**Гараар шалгах (Үе 0-ийн дараа заавал):**

1. `vertmon-session` cookie гараар үүсгээд `/api/marketing/facebook?shop_id=<uuid>` → **401** (өмнө нь 200).
2. Нэвтрэлтгүйгээр `POST /api/ai-assistant/analyze-messages {"shopId":"<uuid>"}` → **401**.
3. `sales_manager` дүрээр гэрээ устгах оролдлого → **403**.
4. Санаатай алдаа үүсгэж Sentry-д бодитоор ирж байгааг шалгах.
5. Хэвийн нэвтэрсэн хэрэглэгчээр дашборд, маркетинг, санхүүгийн хуудсууд ажиллаж байгааг шалгах (регресс).

**Мөнгөний зөв байдал (Үе 1-ийн дараа):**

1. Гэрээнд төлбөр нэмэх → гэрээний `paid_amount`/`balance` шинэчлэгдсэн эсэх, дашбордын орлого тоотой таарч байгаа эсэх.
2. 1000-аас олон гэрээтэй дэлгүүрийн KPI нийт дүнтэй тулгах.
3. Гэрээ устгаад жагсаалт, статистик, Excel экспорт гурвуулаас **алга болсон** эсэхийг шалгах.

**Аудитын чанар (Үе 3-ын дараа):**

1. Гэрээний дүнг UI-аас өөрчлөх → `activity_log`-д `before`/`after` зөв, `actor_name` бөглөгдсөн эсэх.
2. `viewer` дүрээр бичих оролдлого → 403 буцаж, `status:'denied'` бичлэг үүссэн эсэх.
3. `activity_log`-ийн мөрийг SQL-ээр UPDATE хийж үзэх → **exception шидэх ёстой**.

---

## 7. Хамрах хүрээнээс гадуур (энэ удаад хийхгүй)

- **Олон-түрээслэгчийн бүрэн шинэчлэл** — `shops` хүснэгтийн ачааллыг задлах ажил CLAUDE.md-д тусдаа төлөвлөгөө гэж тэмдэглэгдсэн.
- **`customers` хүснэгтийн legacy багана** (`total_orders`, `total_spent`, `is_vip`) — тусдаа destructive migration.
- **Гүйцэтгэлийн оптимизац** (N+1, `select('*')`, pagination) — тэмдэглэгдсэн ч аюулгүй байдлын ажилтай хольж хийхгүй.

---

## 8. Хураангуй

| | Одоо | Зорилт |
|---|---|---|
| Эрхийн шалгалттай route | 36 / 132 | **132 / 132** |
| Аудит бичдэг mutating route | 5 / 86 | **86 / 86** |
| Аудит суваг | 5 салангид | **1 нэгдсэн** |
| before/after хадгалалт | ❌ | ✅ |
| IP / user-agent | ❌ | ✅ |
| Өөрчлөгдөшгүй лог | ❌ | ✅ |
| Санхүүгийн аудитад actor | ❌ | ✅ |
| Удирдлагын харагдац | зөвхөн AI | **бүх модуль** |
| Нэвтрэлтийн зам | 3 зэрэгцээ | **1** |
| Алдааны хяналт | үхмэл | **ажиллагаатай** |
| Гэрээ устгалт | hard, эрхгүй, ул мөргүй | **soft, эрхтэй, бүртгэлтэй** |

**Эхний алхам:** Үе 0 — 9 яаралтай засвар. Ихэнх нь код хасах ажил тул 1–2 өдөрт багтаж, хамгийн том эрсдэлийг арилгана.
