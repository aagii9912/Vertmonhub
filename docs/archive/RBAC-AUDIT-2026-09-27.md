# RBAC аудит — 2026-09-27

**Дүгнэлт: RBAC бүрэн зөв ажиллахгүй байна.** Нэвтрэлт, shop-ийн тусгаарлалт, модулийн эрх, бичих/устгах эрхийг зарим замд шалгаж байгаа боловч API болон DB-ийн шууд хандалт дээр зөрчил байна. API хамгаалалтыг дангаар нь засахад DB-ийн цоорхой үлдэнэ.

Шалгасан хувилбар: `main`, HEAD `2d12c6b`, шалгалт эхлэхэд байсан commit хийгдээгүй өөрчлөлтүүдийг оролцуулсан ажлын код. Энэ аудитаар application code, production өгөгдөл, policy өөрчлөөгүй; push/deploy хийгээгүй. Зөвхөн энэ тайлан болон `output/rbac-audit-2026-09-27/` доторх аудитын материал нэмсэн.

Баталгааны хүрээ:

- 228 экспортлогдсон API handler-ийн auth/module дуудлагыг жагсааж, доорх замуудыг дэлгэрэнгүй мөрдсөн. Энэ тоо нь 228 handler бүрийг бүх дүрээр ажиллуулсан гэсэн үг биш.
- `.env.local`-ийн DB холболтоор **READ ONLY** transaction ашиглан live roles, grants, policies, helper function, RBAC trigger-үүдийг уншсан. Нууц түлхүүр, хэрэглэгчийн нэр/имэйл тайланд хадгалаагүй.
- Live DB-д `authenticated` дүрээр, одоо байгаа admin/sales/marketing хэрэглэгчийн `auth.uid()` нөхцөлийг тавьж зөвхөн SELECT шалгалт хийсэн.
- API-ийн бодит route болон permission helper-үүдийг live дүрийн тохиргоотой, DB/storage/network mock ашиглан шалгасан. Эдгээр HTTP status нь **local handler test**-ийн үр дүн; deployed API руу бичсэн хүсэлт биш.
- Live policy/helper-үүдийн хуулбарыг PGlite-ийн тусгаарласан PostgreSQL дээр synthetic мөрүүдээр ажиллуулсан. Production дээр дүр өөрчлөх, лид устгах, мессеж илгээх үйлдэл хийгээгүй.
- UI-ийн sidebar, AuthContext, layout, AI тохиргооны хуудсыг кодоор мөрдсөн. Browser дээр бүх дүрээр нэвтэрсэн end-to-end туршилт хийгдээгүй.

**1. [P1] `admin` хэрэглэгч DB-ээр өөрийгөө `super_admin` болгох боломжтой.**

Аппын [admin guard](/Users/aagii/Vertmonhub/src/lib/admin/auth.ts:55) зөвхөн `super_admin` зөвшөөрдөг. Харин live `user_roles`, `roles`, `role_permissions` хүснэгтийн `FOR ALL TO authenticated` policy нь `is_active_admin()` ашигладаг. Тэр function `admin` болон `super_admin` хоёуланг зөвшөөрдөг бөгөөд хэрэглэгч/shop-ийн хязгааргүй. Эх үүсвэр нь [security migration](/Users/aagii/Vertmonhub/supabase/migrations/20260609130000_security_hardening_linter.sql:32).

Live шалгалтаар жирийн admin-д `is_active_admin() = true`, `user_roles` UPDATE grant = true, нийт 9 role assignment харагдсан. Local policy replay дээр admin өөрийн дүрийг `super_admin` болгосон, мөн өөр shop-ийн хэрэглэгчийн дүрийг өөрчилсөн; тус бүр 1 мөр өөрчлөгдсөн. `user_roles.role` нь зөвхөн хоосон бус string шалгах constraint-тай; role өөрчлөлтийг хориглох trigger илрээгүй.

Засах чиглэл: RBAC хүснэгтийн шууд browser mutation-ийг хааж, server-ийн баталгаажуулсан super_admin замаар өөрчлөх; эсвэл policy-г яг ижил super_admin/self-change дүрэмтэй болгох. Одоо байгаа өргөн policy-г үлдээгээд шинэ restrictive-looking permissive policy нэмэх нь хамгаалалт болохгүй.

**2. [P1] CRM-ийн шууд DB хандалт модулийн болон бичих/устгах эрхийг тойрч байна.**

Live `leads`, `properties` policy нь `FOR ALL`, нөхцөл нь зөвхөн `shop_id IN get_user_shop_ids()`. [Тусгаарлалтын migration](/Users/aagii/Vertmonhub/supabase/migrations/20260618120000_per_project_isolation_hardening.sql:17) shop-ийн хил тогтоосон ч RBAC-ийн `modules`, `can_write`, `can_delete`-ийг шалгадаггүй. `authenticated` нь эдгээр хүснэгтэд INSERT/UPDATE/DELETE grant-тай.

Тусгаарласан DB дээр батлагдсан:

| Дүр ба тохиргоо | Хориглох ёстой үйлдэл | Бодит үр дүн |
| --- | --- | --- |
| sales_manager, canDelete=false | Өөрийн shop-ийн лид устгах | 1 мөр устсан |
| marketing, properties модульгүй | Өөрийн shop-ийн property унших | 1 мөр уншсан |
| viewer, canWrite=false | Өөрийн shop-д лид нэмэх | 1 мөр нэмсэн |

Ижил төрлийн shop-only write policy `surveys`, `survey_responses`, `projects`, Storage `products`/`property-images` дээр мөн байна; эдгээрийн mutation-ийг ажиллуулаагүй, policy inspection-оор тогтоосон. Одоогийн live viewer assignment 0 боловч viewer дүр болон role assignment байхгүй үед ашиглах viewer fallback бий.

Засах чиглэл: server-only write урсгалуудын authenticated DML grant/policy-г хаах, эсвэл DB дээр module + operation эрхийг давхар шалгах. Browser realtime уншилт шаардлагатай хүснэгтүүдийн SELECT болон shop тусгаарлалтыг хадгална.

**3. [P1] Зарим API зөвхөн нэвтрэлт/shop эсвэл ерөнхий canWrite шалгаж байна.**

Local API тестийн үр дүн:

| Хэрэглэгч | Хүсэлт | Хүлээсэн | Бодит |
| --- | --- | --- | --- |
| viewer | POST /api/ai-settings | 403 | 200, FAQ insert дуудагдсан |
| viewer | DELETE /api/ai-settings | 403 | 200, FAQ delete дуудагдсан |
| viewer | GET /api/dashboard/customers | 403 | 200 |
| viewer | POST /api/properties/upload | 403 | 200, storage upload дуудагдсан |
| marketing, properties модульгүй | POST /api/properties | 403 | 201, property insert дуудагдсан |

[AI settings](/Users/aagii/Vertmonhub/src/app/api/ai-settings/route.ts:116), [customer list](/Users/aagii/Vertmonhub/src/app/api/dashboard/customers/route.ts:12), [property upload](/Users/aagii/Vertmonhub/src/app/api/properties/upload/route.ts:9) нь module/operation guard-гүй. [Property create](/Users/aagii/Vertmonhub/src/app/api/properties/route.ts:58) нь `requireWrite()` хэрэглэдэг тул өөр модульд бичих эрхтэй marketing нэвтэрнэ. Property PATCH болон customer mutation/reply зэрэг sibling handler-үүдэд мөн ерөнхий write guard байна.

Sidebar [модулиар цэс шүүдэг](/Users/aagii/Vertmonhub/src/components/dashboard/Sidebar.tsx:45), гэхдээ энэ нь API-ийн хамгаалалт биш. AI settings хуудас өөрөө module guard-гүй тул URL-ийг шууд оруулахад эрхийг API шалгах шаардлагатай.

Засах чиглэл: handler бүрийн read/write/delete үйлдэлд `requireModule`, `requireModuleWrite`, `requireModuleDelete` тохируулах. Shared lookup зэрэг олон модульд хэрэгтэй уншилтыг `requireAnyModule`-оор зориуд зөвшөөрөх.

**4. [P1] canDelete=false хэрэглэгч маркетингийн өгөгдөл устгаж байна.**

[Market indicators DELETE](/Users/aagii/Vertmonhub/src/app/api/marketing/indicators/route.ts:97) нь `requireWrite()`, [competitors DELETE](/Users/aagii/Vertmonhub/src/app/api/dashboard/competitors/route.ts:98) нь `requireModuleWrite('marketing-roi')` шалгадаг. Live marketing дүр canWrite=true, canDelete=false. Хоёр local API тест хоёул 403-ийн оронд 200 буцааж, indicator soft-delete болон competitor hard-delete query-д хүрсэн.

Засах чиглэл: хоёуланд `requireModuleDelete('marketing-roi')` хэрэглэж, UI delete товчийг ижил эрхээр шүүх.

**Нэмэлт тохиргоо, хэрэглээний зөрүү.**

- Live `roles` хүснэгтэд admin, sales_manager, marketing, viewer гэсэн 4 дүр байна. Assignment нь admin 3, sales_manager 4, marketing 1, super_admin 1. `super_admin`-ийн `roles` мөр байхгүй тул [static fallback](/Users/aagii/Vertmonhub/src/lib/rbac.ts:200) ашиглагдаж байна. Үүнийг DB-ийн мөр нөхөхгүйгээр шууд fail-closed болговол одоогийн super_admin-ийн урсгалд нөлөөлнө.
- Live admin-ийн module list-д `finance`, `procurement`, `customer-service`, `erp-imports` байхгүй; sales_manager-д `customer-service`, `erp-imports` байхгүй. Static mapping-ийг өөрчлөх нь DB-defined дүрд автоматаар эрх нэмэхгүй. ERP-ийн 2026-09-27 migration хүлээгдэж байгаа нь тусдаа release нөхцөл; аудитын үеэр migration ажиллуулаагүй.
- [Legacy getAuthUserShop](/Users/aagii/Vertmonhub/src/lib/auth/auth.ts:33) зөвхөн `shops.user_id` шалгадаг; `shop_members`-ийг тооцдоггүй. Үүнийг ашигладаг inbox reminder нь гишүүн менежерт 401 өгөх кодын замтай. Shared [getUserShop](/Users/aagii/Vertmonhub/src/lib/auth/supabase-auth.ts:173) эзэн болон гишүүнийг тооцдог. Энэ ялгааг source inspection-оор тогтоосон; live reminder илгээгээгүй.
- [AuthContext](/Users/aagii/Vertmonhub/src/contexts/AuthContext.tsx:201) ижил хэрэглэгчийн TOKEN_REFRESHED event дээр `/api/me` дахин татдаггүй. Админ эрх өөрчилсний дараа нээлттэй цэс reload хүртэл хуучин байж болно. Current shared server guard нь service client-ээр шинэ эрх уншдаг тул зөв guard-тай API-д хуучин UI нь өөрөө эрх олгохгүй.

**Зөв ажилласан хамгаалалт ба тестийн хязгаар.**

- Shared permission helper-ийн unauthenticated=401, viewer write=403, module-гүй marketing property write=403, sales manager lead write зөвшөөрөх/delete хориглох control-ууд зөв.
- Local RLS replay дээр sales_manager өөр shop-ийн лид хараагүй, өөрийн дүрийг өөрчилж чадаагүй.
- Өмнө байсан RBAC/admin/AI confirmation/payment/marketing access чиглэлийн **110 тест, 10 файл бүгд давсан**.
- Шинэ аудитын **18 probe-оос 6 control давж, 12 хамгаалалтын expectation унасан**: API 7/11, RLS 5/7. Энэ нь 12 өөр root cause гэсэн үг биш; дээрх дөрвөн бүлгийн олон жишээ юм.
- `node scripts/rls-audit.mjs` “RLS аудит цэвэр” буцаасан. Тэр script RLS асаалттай эсэх, view security, өргөн true policy шалгадаг; module/operation эрхийн зөв эсэхийг шалгадаггүй.
- [route-auth-guard тест](/Users/aagii/Vertmonhub/src/app/api/__tests__/route-auth-guard.test.ts:30) файлд ямар нэг auth helper байгаа эсэхийг шалгадаг. `getUserShop()` дангаараа байхад давдаг тул дээрх цоорхойг илрүүлэхгүй.

Дахин ажиллуулах аудитын командууд (цоорхой хэвээр бол exit 1):

```bash
rtk npx vitest run --config output/rbac-audit-2026-09-27/vitest.config.mts
node output/rbac-audit-2026-09-27/rls-probe.mjs
```

Материал: [API үр дүн](/Users/aagii/Vertmonhub/output/rbac-audit-2026-09-27/api-results.json), [RLS үр дүн](/Users/aagii/Vertmonhub/output/rbac-audit-2026-09-27/rls-results.json), [live read-only шалгалт](/Users/aagii/Vertmonhub/output/rbac-audit-2026-09-27/live-read-checks.json), [policy snapshot](/Users/aagii/Vertmonhub/output/rbac-audit-2026-09-27/db-snapshot.json), [API inventory](/Users/aagii/Vertmonhub/output/rbac-audit-2026-09-27/route-inventory.json). `output/` нь git-ignored.

Засварын дараах acceptance: non-super-admin role mutation хаагдах; API болон authenticated DB хоёр замд module/write/delete матриц ижил мөрдөх; өөр shop болон гишүүн менежерийн урсгал хэвийн үлдэх; эрх бууруулсны дараах шинэ хүсэлт хориглогдох. Production API болон browser-ийг засвар deploy хийсний дараа тусад нь баталгаажуулна.
