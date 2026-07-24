# Дотоод системийн аудит — илэрсэн сул тал ба сайжруулах төлөвлөгөө

> Аудит хийсэн огноо: 2026-07-24
> Хамрах хүрээ: `src/app/api` (132 route), `src/lib` (auth, rbac, audit, ai), `supabase/migrations` (126 migration)
> Арга: кодын статик шинжилгээ — эрхийн хяналт, олон-түрээслэгчийн тусгаарлалт, аудит мөр, өгөгдлийн бүрэн бүтэн байдал, гадаад периметр, ажиглалт, AI гадаргуу гэсэн 7 чиглэлээр

---

## 1. Яагаад энэ ажил хэрэгтэй вэ

Vertmon Hub нь одоо зөвхөн CRM биш — санхүү (ERP), худалдан авалт, гэрээ, төлбөр, маркетингийн төсөв зэрэг **мөнгөн дүнтэй үйлдлүүдийг** агуулж байна. Гэтэл систем дээр «хэн, хэзээ, юуг, яаж өөрчилсөн» гэдгийг бүрэн хэмжээнд бүртгэдэг механизм алга.

Практик дээр энэ нь дараах гурван асуудлыг үүсгэнэ:

1. **Удирдлагын хяналт алга.** Менежер лийдийн статус, гэрээний дүнг өөрчилсөн эсэхийг хожим тогтоох арга байхгүй. Маргаан гарвал «хэн буруу вэ» гэдгийг шийдэх нотолгоо байхгүй.
2. **Өгөгдөл сэргээх боломжгүй.** Гэрээний төлбөрийн дүн буруу өөрчлөгдвөл өмнөх утга хаана ч үлддэггүй.
3. **Аюулгүй байдлын мөрдлөг алга.** Эрх давсан оролдлого, өгөгдөл экспортлолт бүртгэгддэггүй тул халдлагыг илрүүлэх, мөрдөх боломжгүй.

Аудитын явцад дээрх зорилтод хүрэхэд саад болох, зарим нь **шууд ашиглагдаж болохуйц ноцтой цоорхойнууд** илэрсэн. Тэдгээрийг эхлээд хаах шаардлагатай.

---

## 2. Одоогийн байдал — тоон дүр зураг

| Үзүүлэлт | Утга | Тайлбар |
|---|---|---|
| Нийт API route | **132** | |
| Ямар нэг нэвтрэлтийн шалгалттай | **108 / 132** | Нэвтрэлт (authentication) ерөнхийдөө байна |
| Модулийн эрхийн шалгалттай (`requireModule*`) | **36 / 132** | Зөвшөөрөл (authorization) **зөвхөн 27%-д** |
| Өөрчлөлт хийдэг route (POST/PATCH/PUT/DELETE) | **86** | |
| Аудит бичдэг route | **5 / 86 (≈6%)** | `admin/users`, `admin/users/invite`, `finance/transactions`, `dashboard/customers`, `procurement/bills/[id]/pay` |
| Салангид аудит суваг | **4** | `data_audit_log`, `admin_audit_log`, `ai_audit_log`, `finance_audit_log` |
| Тест файл | **21** | Эрхийн хяналт, аудит холболтыг хамарсан тест **алга** |

### 2.1 Сайн хийгдсэн зүйлс (эдгээрийг эвдэхгүй байх)

Аудитаар шударгаар хэлэхэд суурь архитектур нь олон газар зөв тавигдсан байна:

- **`getUserShop()`** (`src/lib/auth/supabase-auth.ts`) нь `x-shop-id` header-ийг хэрэглэгчийн хандах эрхтэй дэлгүүрүүдтэй **тулгаж шалгадаг**. Өөрөөр хэлбэл «header-т дурын UUID бичээд өөр компанийн өгөгдөл харах» гэсэн сонгодог нүх энд **байхгүй**.
- **`getAccessibleShopIds()`** нь эзэмшсэн + гишүүнчлэлтэй дэлгүүрийг зөв нэгтгэдэг бөгөөд маркетингийн route-ууд үүнийг мөрддөг.
- **`POST /api/ai-assistant/action`** бол системийн хамгийн зөв бичигдсэн route: хэрэглэгчийг дахин тодорхойлж, RBAC-г дахин шалгаж, tool-ыг цагаан жагсаалттай тулгаж, shop гишүүнчлэлийг баталгаажуулаад л бодит үйлдлийг гүйцэтгэдэг. **Энэ бол бусад route-д тархаах ёстой загвар.**
- Бүх cron route нууц түлхүүрийн шалгалттай, webhook нь идемпотент (`webhook_dedup`), CI (`.github/workflows/ci.yml`) байна.

### 2.2 Гол сул талууд

Ноцтойгоор нь эрэмбэлэв.

---

#### 🔴 Ноцтой-1: Хүчингүй болсон `vertmon-session` cookie нь хаагдаагүй арын хаалга болж үлдсэн

**Нотолгоо.** `src/app/api/auth/login/route.ts:171` — нэвтрэлтийн урсгал энэ cookie-г зөвхөн **устгадаг** («Clear legacy custom cookie»). Өөрөөр хэлбэл системд үүнийг **олгодог код байхгүй болсон**. Гэтэл 8 файл түүнийг **хүлээн авсаар** байгаа бөгөөд гурван өөр, хоорондоо үл нийцэх форматаар тайлдаг:

| Файл | Тайлах арга | Эрсдэл |
|---|---|---|
| `src/app/api/marketing/facebook/route.ts:30`<br>`.../facebook/posts`, `.../facebook/publish`,<br>`.../facebook/insights`, `.../instagram` | `JSON.parse(Buffer.from(value,'base64'))` → `parsed.user_id` | **Гарын үсэг огт шалгахгүй.** Дурын хүн `base64({"user_id":"<UUID>"})` үүсгээд тухайн хэрэглэгчээр нэвтэрнэ |
| `src/middleware.ts:82-88` | JWT-г 3 хэсэгт хувааж payload-ыг base64-ээс уншаад `exp`/`sub` шалгана | Тайлбарт «Verify JWT signature» гэж бичсэн ч **гарын үсэг шалгагдахгүй**. Хуурамч cookie-гоор `/dashboard`, `/admin` хуудас нээгдэнэ |
| `src/lib/auth/resolve-user.ts:9`<br>`src/lib/admin/auth.ts:21` | AES-256-GCM тайлалт | Түлхүүр нь `SUPABASE_SERVICE_ROLE_KEY`, **эсвэл тохируулаагүй үед нийтэд ил `'fallback-secret-key-32chars-min!!'`** |

**Нөлөө.** Маркетингийн 5 route-д ямар ч түлхүүргүйгээр дурын хэрэглэгчийн нэрийн өмнөөс Facebook Page-д **пост нийтлэх**, зарлагын мэдээлэл унших боломжтой. `middleware`-ийн цоорхойгоор админ хуудасны бүрхүүл нээгдэнэ.

**Засвар нь хялбар:** энэ cookie-г хууль ёсны хэрэглэгч ашигладаггүй тул **хүлээн авах бүх замыг устгахад хэн ч хохирохгүй**. Шинэ код бичих шаардлагагүй — код хасах ажил.

---

#### 🔴 Ноцтой-2: `POST /api/ai-assistant/analyze-messages` нь нэвтрэлтгүй бөгөөд өөр компанийн чатыг уншина

**Нотолгоо.** `src/app/api/ai-assistant/analyze-messages/route.ts:8-24` — auth шалгалт **огт байхгүй**. `shopId`-г хүсэлтийн биеэс шууд аваад, RLS тойрдог `supabaseAdmin()` client-ээр `chat_history`-оос 100 мессеж уншиж Gemini рүү илгээдэг.

```ts
export async function POST(req: Request) {
    const { shopId } = await req.json();          // ← гаднаас ирсэн утга
    const supabase = supabaseAdmin();             // ← RLS тойрно
    const { data: recentChats } = await supabase
        .from('chat_history').select('role, content')
        .eq('shop_id', shopId).limit(100);        // ← ямар ч эрхийн шалгалтгүй
```

**Нөлөө.** Интернэтээс хэн ч `shopId` таамаглаад дурын компанийн **харилцагчийн бодит чат харилцааг** татаж авна (нэр, утас, хэлэлцээрийн агуулга). Түүнчлэн Gemini-ийн зардлыг хязгааргүй шатаах боломжтой.

---

#### 🟠 Өндөр-3: Зөвшөөрөл (RBAC) route-уудын 27%-д л хэрэгжсэн

**Нотолгоо.** `requireModule` / `requireWrite` / `requireDelete` нь 132 route-оос зөвхөн **36**-д дуудагдаж байна. Үлдсэн олонх нь `getUserShop()` эсвэл `resolveApiUser()`-ээр зөвхөн **«нэвтэрсэн үү»** гэдгийг шалгаад өнгөрдөг.

**Нөлөө.** `viewer` дүртэй (`canWrite: false`) хэрэглэгч нэвтэрсэн байвал бичих эрхийн шалгалтгүй route-уудаар дамжуулан өгөгдөл үүсгэх/өөрчлөх боломжтой. Эрхийн систем UI-д харагдаж байгаа ч сервер тал дээр бүрэн хэрэгжээгүй.

**Үндсэн шалтгаан.** `resolvePermissions()` (`src/lib/auth/require-permission.ts:8`) нь дүрийг **зөвхөн `user_id`-аар** тодорхойлдог — `shop_id` харгалздаггүй. Тиймээс нэг хүн бүх дэлгүүрт ижил дүртэй байна. Мөн guard функцууд shop параметр авдаггүй тул «энэ хүн энэ дэлгүүрт энэ үйлдлийг хийж болох уу» гэсэн бүрэн асуултыг нэг цэгээс хариулах боломжгүй.

---

#### 🟠 Өндөр-4: Аудит мөр 6%-ийн хамрах хүрээтэй, 4 салангид сувагт тархсан

**Нотолгоо.** 86 өөрчлөлт хийдэг route-оос **5** нь л аудит бичдэг. Дөрвөн суваг нь хоорондоо үл нийцэх схемтэй:

| Суваг | Хүснэгт | shop_id | actor | before/after | IP/UA |
|---|---|---|---|---|---|
| `recordAudit` (`lib/services/AuditService.ts`) | `data_audit_log` | ✅ | ✅ `actor_id` | ⚠️ `changes` (нэг талт) | ❌ |
| `logAdminAudit` (`lib/admin/audit.ts`) | `admin_audit_log` | ❌ **алга** | ✅ `actor_id` | ❌ `meta` | ❌ |
| `logAiAudit` (`lib/ai/data-assistant/audit.ts`) | `ai_audit_log` | ✅ | ✅ `user_id` | ❌ `args` | ❌ |
| `logFinanceAudit` (`lib/erp/audit.ts`) | `finance_audit_log` | ✅ | ❌ **алга** | ❌ `meta` | ❌ |

Онцлон тэмдэглэх зүйлс:

- **Санхүүгийн аудитад `actor_id` талбар байхгүй** — мөнгөтэй холбоотой үйлдлийг *хэн* хийснийг мэдэх боломжгүй. Энэ бол аудитын хамгийн чухал талбар.
- **Админы аудитад `shop_id` байхгүй** — олон дэлгүүрийн орчинд аль төсөлд юу болсныг ялгах боломжгүй.
- Аль ч суваг **өмнөх утгыг (before)** хадгалдаггүй → өгөгдөл сэргээх, маргаан таслах боломжгүй.
- Аль ч суваг **IP / user-agent** бүртгэдэггүй → аюулгүй байдлын мөрдлөг хийх боломжгүй.
- Дөрвүүлээ **best-effort** (алдааг `catch`-д залгидаг) тул аудит бичилт унасныг хэн ч мэдэхгүй.
- `data_audit_log`, `admin_audit_log`, `finance_audit_log`-ийг **UI-аас харах цонх огт алга** (зөвхөн `ai_audit_log`-д `/dashboard/ai-assistant/audit` байна) → бичээд хэн ч хардаггүй «үхсэн лог».
- Нэвтрэлт, амжилтгүй нэвтрэлт, дүр олголт, дэлгүүр сэлгэлт, **Excel экспорт** — эдгээрийн аль нь ч бүртгэгддэггүй.

---

#### 🟡 Дунд-5: `CRON_SECRET` тохируулаагүй үед cron route-ууд нээлттэй болно

**Нотолгоо.** `src/lib/auth/cron.ts:13` — `if (!secret) return true;` («dev — нээлттэй»).

**Нөлөө.** Production орчинд энэ хувьсагчийг тохируулж мартвал 12 cron route интернэтээс дуудагдана: `data-cleanup` (өгөгдөл цэвэрлэнэ), `overdue-check`, `task-reminders` (олон түмэнд push илгээнэ). Орчны тохиргооны алдаа шууд аюулгүй байдлын нүх болж хувирдаг **fail-open** загвар. Мөн харьцуулалт нь тогтмол хугацааны (timing-safe) биш.

---

#### 🟡 Дунд-6: Файл байршуулалтад төрөл/хэмжээний шалгалт алга

**Нотолгоо.** `src/app/api/dashboard/upload/route.ts` — нэвтрэлт байгаа ч `file.type`, `file.size` шалгагддаггүй, нийтэд нээлттэй `products` bucket руу шууд байршуулна.

**Нөлөө.** Дурын төрлийн (HTML/SVG) файл байршуулж, нийтэд нээлттэй URL-аар түгээх боломжтой. Хэмжээний хязгааргүй тул сангийн зай шавхах эрсдэлтэй.

---

#### 🟡 Дунд-7: Эрхийн шалгалтын нөөц (fallback) зам эрсдэлтэй

**Нотолгоо.** `src/lib/rbac.ts:211` — `fetchRolePermissions` дэх `catch` блок DB унасан үед `getStaticPermissions(roleName)` руу шилждэг. Статик зураглалд `admin`, `sales_manager` зэрэг дүр **бичих эрхтэй** тодорхойлогдсон.

**Нөлөө.** Хэрэв админ DB дээр дүрийн эрхийг **хасаж** тохируулсан бол DB унах үед тухайн хэрэглэгч статик зураглалын **илүү өргөн эрхийг** авна. Мөн `isValidRole()` (`rbac.ts:287`) нь `finance_manager`, `accountant` гэсэн бодит дүрүүдийг мэддэггүй тул түүнийг ашигласан газарт хүчинтэй дүрийг хүчингүй гэж үзнэ.

---

#### 🟡 Дунд-8: Тест ба CLAUDE.md-ийн цоорхой

- 21 тест файлын аль нь ч **эрхийн хяналт, shop тусгаарлалт, аудит холболтыг** шалгадаггүй. Эдгээр нь системийн хамгийн эрсдэлтэй зам боловч regression-ээс хамгаалагдаагүй.
- `CLAUDE.md` дахь модулийн жагсаалт бодит кодоос **хоцорсон**: `finance`, `procurement`, `customer-service`, `units`, `competitors`, `hubspot` модулиуд баримтжаагүй. Дараагийн агент буруу төсөөлөлтэй ажиллана.

---

## 3. Үндсэн шалтгааны дүгнэлт

Дээрх 8 асуудал нь санамсаргүй биш — **гурван системийн шалтгаанаас** урган гарч байна:

1. **Нэвтрэлтийн олон зам зэрэгцэн оршиж байна.** Supabase Auth, `vertmon-session` (3 өөр формат), `getAdminUser`, `resolveApiUser`, `getUserShop` — route бүр өөрийн гэсэн хослолыг сонгодог. Ганц цонх байхгүй тул аль нэг замд гарсан сул тал бүх системд тархдаг.
2. **Зөвшөөрөл ба аудит нь route бүрийн «сайн дурын» ажил.** Хөгжүүлэгч санаж байвал `requireModule` дуудна, санахгүй бол алгасна. Дефолт нь «хамгаалалтгүй» — **дефолт нь «хамгаалалттай» байх ёстой**.
3. **Аудит хэрэгцээ бүрийн хувьд тусад нь нэмэгдсэн.** Санхүү нэмэгдэхэд `finance_audit_log`, AI нэмэгдэхэд `ai_audit_log` үүссэн. Тиймээс схем нь хэрэгцээ болгонд өөр, нэгдсэн харагдац боломжгүй.

**Гол дүгнэлт:** 2 ба 3-р шалтгаан нь **нэг цэгээс** засагдана. Route бүр эрхээ шалгуулж, аудитаа бичдэг **нэг л туслах функц** нэвтрүүлбэл хоёр асуудал зэрэг шийдэгдэнэ. Төлөвлөгөөний гол цөм нь энэ.

---

## 4. Шийдлийн архитектур — нэгдсэн `apiContext()` + `activity_log`

### 4.1 Гол санаа

Route бүрийн эхэнд дуудагдах **ганц туслах функц** нь дараах 4 зүйлийг нэгэн зэрэг хийнэ:

1. Хэрэглэгчийг тодорхойлох (ганц зөвшөөрөгдсөн зам)
2. Модуль + бичих/устгах эрхийг шалгах
3. Зорилтот `shop_id`-г баталгаажуулах
4. Тухайн хүсэлтийн контекст (actor, shop, IP, user-agent)-оор **урьдчилан холбогдсон аудит бичигч** буцаах

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

Route дахь хэрэглээ:

```ts
export async function PATCH(req: Request, { params }: Ctx) {
    const r = await apiContext(req, { module: 'contracts', action: 'write' });
    if ('error' in r) return r.error;        // 401/403 + denied аудит автоматаар
    const { ctx } = r;

    const { id } = await params;
    const before = await loadContract(id, ctx.shopId);   // shop-оор заавал хязгаарлана
    const after  = await updateContract(id, body, ctx.shopId);

    await ctx.audit({
        entity: 'contract', entityId: id, action: 'update',
        summary: `Гэрээ ${after.contract_number}-ийн мэдээлэл шинэчлэгдлээ`,
        ...diffFields(before, after),        // зөвхөн өөрчлөгдсөн талбарууд
    });

    return NextResponse.json({ contract: after });
}
```

Ингэснээр **эрхийн шалгалт болон аудит хоёулаа route бичих ердийн урсгалын салшгүй хэсэг** болно — мартах боломж багасна.

### 4.2 `activity_log` хүснэгтийн схем

Хэрэглэгчийн сонгосон гурван зорилго (удирдлагын хяналт / аюулгүй байдал / өгөгдөл сэргээлт) тус бүрийг хангах талбарууд:

```sql
create table public.activity_log (
    id            uuid primary key default gen_random_uuid(),
    occurred_at   timestamptz not null default now(),

    -- ХЭН (удирдлагын хяналт)
    shop_id       uuid references public.shops(id) on delete set null,
    actor_id      uuid,            -- auth.users.id
    actor_name    text,            -- snapshot: хүн гарсан ч тайлан эвдэрхгүй
    actor_role    text,            -- үйлдлийн үеийн дүр (snapshot)
    source        text not null,   -- 'ui' | 'ai' | 'cron' | 'webhook' | 'import' | 'api'

    -- ЮУГ
    entity        text not null,   -- 'contract' | 'lead' | 'property' | 'user' | 'session' | ...
    entity_id     text,
    action        text not null,   -- 'create' | 'update' | 'delete' | 'export' | 'login' | 'role_change'
    summary       text,            -- монголоор, хүн уншихуйц нэг мөр

    -- ЯАЖ ӨӨРЧЛӨГДСӨН (өгөгдөл сэргээлт)
    before        jsonb,           -- зөвхөн өөрчлөгдсөн талбарууд
    after         jsonb,

    -- ХААНААС (аюулгүй байдал)
    request_ip    inet,
    user_agent    text,
    request_id    text,

    status        text not null default 'success',  -- 'success' | 'denied' | 'error'
    error_message text
);

create index on public.activity_log (shop_id, occurred_at desc);
create index on public.activity_log (entity, entity_id, occurred_at desc);
create index on public.activity_log (actor_id, occurred_at desc);
create index on public.activity_log (shop_id, status, occurred_at desc)
    where status <> 'success';     -- аюулгүй байдлын хяналтын самбарт
```

**Өөрчлөгдөшгүй (immutable) байдал** — аудитын үнэ цэнэ энд оршино:

```sql
alter table public.activity_log enable row level security;

-- Уншилт: зөвхөн өөрийн дэлгүүрийн, зөвхөн эрхтэй дүр
create policy activity_log_read on public.activity_log
    for select using (
        shop_id in (select shop_id from public.shop_members where user_id = auth.uid())
        or exists (select 1 from public.shops where id = shop_id and user_id = auth.uid())
    );

-- INSERT/UPDATE/DELETE policy ЗОРИУДААР үүсгэхгүй → зөвхөн service-role бичнэ
revoke update, delete on public.activity_log from authenticated, anon;

-- service-role ч гэсэн өөрчилж чадахгүй байх хамгаалалт
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

Хоёр зарчим:

- **Эмзэг талбарыг шүүнэ.** Нууц үг, токен, `access_token` төрлийн талбарыг `diffFields` автоматаар хасна (одоо байгаа `src/lib/crypto/tokens.ts`-тэй уялдуулна).
- **Best-effort хэвээр, гэхдээ дуугүй биш.** Аудит бичилт унавал үндсэн үйлдлийг унагахгүй, харин Sentry рүү мэдэгдэнэ — одоогийн 4 суваг шиг чимээгүй алга болохгүй.

### 4.4 Удирдлагын харагдац

- **`/dashboard/audit`** (шинэ, `reports` модулиар хамгаалагдсан) — огноо / менежер / модуль / үйлдлийн төрлөөр шүүх, өөрчлөлт бүрийн before→after харьцуулалтыг харах.
- Гэрээ, лийд, харилцагчийн **дэлгэрэнгүй хуудсанд «Өөрчлөлтийн түүх» таб** — тухайн бичлэгийн бүх өөрчлөлт цаг хугацааны дарааллаар. Одоо байгаа `EntityAttachments` компонентын хажууд байрлана.
- **Аюулгүй байдлын хэсэг** — `status <> 'success'` бичлэгүүд: эрх давсан оролдлого, амжилтгүй нэвтрэлт, сэжигтэй IP.

---

## 5. Гүйцэтгэлийн үе шатууд

Эрэмбийг **эрсдэл ÷ хөдөлмөр** харьцаагаар тогтоов.

### Үе 0 — Яаралтай нүх хаах (1–2 өдөр) ⚠️ эхлээд

Хамгийн бага хөдөлмөрөөр хамгийн том эрсдэлийг арилгана. Ихэнх нь **код хасах** ажил.

| # | Ажил | Файл |
|---|---|---|
| 0.1 | `vertmon-session`-г хүлээн авах **бүх** замыг устгах (олгодог код аль хэдийн байхгүй) | `middleware.ts:74-97`, `lib/auth/resolve-user.ts:60-67`, `lib/admin/auth.ts:49-62`, маркетингийн 5 route |
| 0.2 | `analyze-messages`-д `apiContext` эсвэл `getUserShop()` заавал нэмэх; `shopId`-г биеэс авахаа болих | `api/ai-assistant/analyze-messages/route.ts` |
| 0.3 | `CRON_SECRET` тохируулаагүй үед production-д **татгалзах** (dev-д л нээлттэй); `crypto.timingSafeEqual` ашиглах | `lib/auth/cron.ts` |
| 0.4 | Upload-д MIME цагаан жагсаалт + хэмжээний хязгаар (жишээ нь 10MB) | `api/dashboard/upload`, `api/properties/upload` |

> **Тэмдэглэл:** 0.1 нь код хасах ажил учир регресс эрсдэл бага. Гэхдээ Supabase Auth сесс бүрэн ажиллаж байгааг эхлээд баталгаажуулна.

### Үе 1 — Суурь тавих (3–5 өдөр)

| # | Ажил |
|---|---|
| 1.1 | `activity_log` migration (схем + индекс + RLS + immutable trigger) |
| 1.2 | `src/lib/audit/log.ts` — `logActivity`, `diffFields`, эмзэг талбарын шүүлт |
| 1.3 | `src/lib/api/context.ts` — `apiContext()`; эрхгүй үед `status:'denied'` автомат бичилт |
| 1.4 | `resolvePermissions`-ийг `shop_id`-аар дүр тодорхойлдог болгох; `rbac.ts` дэх fallback-ийг «илүү эрх өгөхгүй» болгож нягтлах; `isValidRole()`-г засах эсвэл хасах |
| 1.5 | Нэгжийн тест: `diffFields`, `apiContext`-ийн зөвшөөрлийн матриц (дүр × модуль × үйлдэл) |

### Үе 2 — Route-уудыг шилжүүлэх (2 долоо хоног, модуль тус бүрээр)

86 mutating route-ыг `apiContext()` рүү шилжүүлнэ. **Мөнгө ба хувийн мэдээлэлтэй холбоотойг эхэнд** нь:

1. `contracts`, `finance`, `procurement` — мөнгөн дүн (~18 route)
2. `leads`, `customers`, `viewings` — хувийн мэдээлэл (~20 route)
3. `properties`, `marketing`, `surveys`, `tasks` (~28 route)
4. `admin/*` — дүр, хэрэглэгч, тохиргоо (~12 route)
5. Үлдсэн (~8 route)

Модуль бүрийн дараа: тухайн модулийн route бүр эрхийн шалгалттай, аудит бичдэг болсныг **скриптээр тоолж** баталгаажуулна.

### Үе 3 — Харагдац ба хамрах хүрээг гүйцээх (1 долоо хоног)

| # | Ажил |
|---|---|
| 3.1 | `/dashboard/audit` хуудас — шүүлтүүр, before→after харагдац |
| 3.2 | Гэрээ / лийд / харилцагчийн дэлгэрэнгүйд «Өөрчлөлтийн түүх» таб |
| 3.3 | Нэвтрэлтийн үйл явдал: амжилттай/амжилтгүй нэвтрэлт, гарах, дүр солих, дэлгүүр сэлгэх |
| 3.4 | **Экспортын бүртгэл** — `export/excel`, `finance/reports/export`: хэн ямар өгөгдөл татсан (өгөгдөл алдагдлын гол суваг) |
| 3.5 | Cron / webhook / AI-гаар хийгдсэн үйлдлийг `source` талбараар ялган бүртгэх |

### Үе 4 — Нэгтгэл ба тогтвортой байдал (3–5 өдөр)

| # | Ажил |
|---|---|
| 4.1 | Хуучин 4 сувгийг `activity_log` руу шилжүүлэх; хуучин хүснэгтүүдийг зөвхөн унших архив болгох |
| 4.2 | Хадгалах хугацааны бодлого (24 сар) + сар бүрийн партиц эсвэл архивлах cron |
| 4.3 | CI-д хамгаалалтын хаалга: `apiContext` ашиглаагүй шинэ mutating route нэмэгдвэл **build унана** (`ci.yml`-д скрипт) |
| 4.4 | `CLAUDE.md`-г шинэчлэх: `finance`, `procurement`, `customer-service` модуль + аудитын шинэ дүрэм |

---

## 6. Батлах арга (verification)

Үе шат бүрийн дараа дараах шалгалтуудыг гүйцэтгэнэ.

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

1. `vertmon-session` cookie-г гараар үүсгээд `/api/marketing/facebook?shop_id=<uuid>` рүү хүсэлт илгээх → **401 буцах ёстой** (өмнө нь 200 буцдаг байсан).
2. Нэвтрэлтгүйгээр `POST /api/ai-assistant/analyze-messages` `{"shopId":"<uuid>"}` → **401**.
3. Хэвийн нэвтэрсэн хэрэглэгчээр дашборд, маркетинг, санхүүгийн хуудсууд ажиллаж байгааг шалгах (регресс шалгалт).

**Аудитын чанарыг шалгах (Үе 2-ын дараа):**

1. Гэрээний дүнг UI-аас өөрчлөх → `activity_log`-д `before`/`after` зөв, `actor_name` бөглөгдсөн эсэхийг шалгах.
2. `viewer` дүртэй хэрэглэгчээр бичих оролдлого хийх → 403 буцаж, `status:'denied'` бичлэг үүссэн эсэхийг шалгах.
3. `activity_log`-ийн мөрийг SQL-ээр UPDATE хийж үзэх → **exception шидэх ёстой**.

---

## 7. Хамрах хүрээнээс гадуур (энэ удаад хийхгүй)

- **Олон-түрээслэгчийн бүрэн шинэчлэл.** `shops` хүснэгтийн ачааллыг задлах ажил CLAUDE.md-д тусдаа төлөвлөгөө гэж тэмдэглэгдсэн — энэ аудитын хүрээнд оруулаагүй.
- **`customers` хүснэгтийн legacy багана** (`total_orders`, `total_spent`, `is_vip`) устгах — тусдаа destructive migration шаардана.
- **Гүйцэтгэлийн оптимизац** (N+1 query, хуудаслалт) — аудитын явцад тэмдэглэгдсэн ч аюулгүй байдлын ажилтай хольж хийхгүй.

---

## 8. Хураангуй

| | Одоо | Зорилт |
|---|---|---|
| Эрхийн шалгалттай route | 36 / 132 | **132 / 132** |
| Аудит бичдэг mutating route | 5 / 86 | **86 / 86** |
| Аудит суваг | 4 салангид | **1 нэгдсэн** |
| before/after хадгалалт | ❌ | ✅ |
| IP / user-agent | ❌ | ✅ |
| Өөрчлөгдөшгүй лог | ❌ | ✅ |
| Удирдлагын харагдац | зөвхөн AI | **бүх модуль** |
| Нэвтрэлтийн зам | 3 зэрэгцээ | **1** |

**Эхний алхам:** Үе 0 — хоёр ноцтой нүхийг хаах. Энэ нь ихэвчлэн код хасах ажил учир нэг өдрийн дотор хийгдэж, хамгийн том эрсдэлийг арилгана.
