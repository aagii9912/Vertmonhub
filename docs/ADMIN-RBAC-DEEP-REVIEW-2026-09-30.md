# Admin болон RBAC-ийн гүн code review — 2026-09-30

**Үр дүн: 6 P1, 8 P2 асуудал. Live DB дээр RBAC-ийн үндсэн хамгаалалтын migration хэрэгжээгүй байна.** Локал тестүүд давсан боловч доорх алдаануудыг хамраагүй.

Энэ нь засварын өмнөх snapshot. Дараагийн хэрэгжүүлэлт, live migration болон үлдсэн deployment шалгалтыг [засварын тайлан](./ADMIN-RBAC-FIX-2026-09-30.md)-аас үзнэ үү.

## Хамрах хүрээ, баталгааны хязгаар

- Checkout: `HEAD 2d12c6b` болон одоогийн commit хийгдээгүй өөрчлөлтүүд. Review нь HEAD-ийн цэвэр хувилбарыг бус, workspace-ийн бодит кодыг шалгасан.
- Admin-ийн 10 хуудас, 12 API route файл, 21 handler; `src/lib/admin`, AuthContext, `src/proxy.ts`, RBAC helper, permission guard, shop scope, migration/grant/RLS, AI-ийн Admin tool-ууд, хавсралтын Storage замыг хамруулав.
- Application source засварлаагүй. Зөвхөн энэ тайлан болон `output/admin-review-2026-09-30/` дахь тусгаарласан нотолгооны файлуудыг нэмсэн. Commit, push, deploy, migration, live mutation хийгээгүй.
- `.env.local`-ийн Supabase төсөл ба DB connection-ийн project identifier таарч байгааг шалгасан. Live metadata snapshot: **2026-09-30 22:25:03 Улаанбаатар / 14:25:03 UTC**. Хэрэглэгчийн PII, credential утга, бодит гэрээний файл уншаагүй.
- API/UI reproductions нь одоогийн кодыг synthetic өгөгдөл, mocked I/O-тай ажиллуулсан. DB reproductions нь disposable PostgreSQL/PGlite ашигласан. Нэвтэрсэн production browser урсгалыг шалгаагүй.

## P1 — эхэлж засах асуудлууд

### 1. Live DB дээр `admin` нь `super_admin` эрх олгох боломжтой хэвээр

**Байршил:** [хуучин RBAC policy](../supabase/migrations/20260609130000_security_hardening_linter.sql#L59), [хэрэгжээгүй boundary migration](../supabase/migrations/20260928120000_rbac_api_boundary.sql#L28).

Live `schema_migrations`-д `20260928120000` байхгүй. `user_roles`, `roles`, `role_permissions` нь `authenticated` CRUD grant-тай, `Admins manage ...` policy нь `is_active_admin()`-ийг ашиглаж байна. Live function нь `admin` болон `super_admin` хоёуланг зөвшөөрдөг. Иймээс Admin API-ийн `super_admin` шалгалтыг шууд PostgREST mutation тойрох боломжтой.

**Нотолгоо:** одоогийн live policy/grant/function metadata; ижил хуучин boundary бүхий disposable DB дээр `admin` өөрийгөө болон өөр хэрэглэгчийг `super_admin` болгож чадсан. Live эрх өсгөх үйлдэл хийгээгүй.

**Засвар:** companion API/UI кодын deployment-ийг баталсны дараа boundary migration-ийг хэрэгжүүлж, migration history-д бүртгэнэ. Доорх webhook уншилтын орхигдлыг мөн нөхнө. Migration-ийн дараа role/module/operation/shop-ийн зөвшөөрөгдсөн ба хориглосон урсгалыг бодит session-тай шалгана.

### 2. Гэрээ дахин импортлоход бүртгэсэн төлбөрийн нийлбэр багасна

**Байршил:** [contract mapper](../src/lib/admin/import/mappers.ts#L433), [re-import update](../src/app/api/admin/import/route.ts#L946).

`Урьдчилгаа` багана байвал mapper нь `paid_amount` болон `balance`-ийг мөн шинэчлэх талбар болгож байна. Урьдчилгаа 30, дараагийн төлбөр 20, нийт төлсөн 50 бүхий гэрээнд анхны файлыг дахин импортлоход `paid_amount=30`, `balance=70` болно. Payment schedule болон мөнгөн гүйлгээний ledger дахь 20 хэвээр үлдэнэ.

**Нотолгоо:** бодит handler-ийн reproduction: `paid_amount 50 → 30`, `balance 50 → 70`.

**Засвар:** шинэ гэрээний импортын анхны дүн ба одоо байгаа гэрээний төлбөрийн бүртгэлийг тусад нь шийднэ. Дахин импорт төлбөрийн нийлбэрийг урьдчилгаагаар дарж болохгүй; мөнгөн дүнг ledger/payment service-тэй нийцүүлнэ.

### 3. Өөр төсөлд импорт хийхэд хуучин байрны өгөгдөл, харьяалал солигдоно

**Байршил:** [property match](../src/app/api/admin/import/route.ts#L528), [update filter](../src/app/api/admin/import/route.ts#L554).

Existing property-г `shop_id + name`-ээр хайж, update хийхдээ сонгосон `project_id`-г бичдэг. Нэг байгууллагын А, Б төсөлд `A-101` нэр давхцвал Б төслийн импорт А төслийн байрны үнийг өөрчилж, Б төсөл рүү шилжүүлнэ. Гэрээний re-import мөн төслөөр хязгаарлаагүй business key ашигладаг.

**Нотолгоо:** А төслийн fixture property Б төслийн импортын дараа `project_id=B`, шинэ үнэтэй болсон.

**Засвар:** project scope-ийг match болон update-д хамтад нь хэрэглэнэ. Project-гүй хуучин эсвэл олон тааралттай мөрийг чимээгүй шилжүүлэхгүй, ambiguity-г операторт харуулна.

### 4. Байгууллага/он солиход хоцорсон response буруу төлөвлөгөө хадгалуулна

**Байршил:** [sales target load](../src/app/admin/sales-targets/page.tsx#L64), [save](../src/app/admin/sales-targets/page.tsx#L94), [roster save](../src/app/admin/sales-targets/page.tsx#L114).

`loadData` request generation, abort эсвэл response scope шалгадаггүй. А байгууллагын хүсэлт хүлээгдэж байхад Б-г сонгож, Б-ийн дараа А-ийн response ирвэл А-ийн target/roster дэлгэцийг дарна. Save нь одоогийн Б-ийн `shopId` болон А-ийн массивыг хамт илгээнэ. Он солиход мөн ижил race үүснэ.

**Нотолгоо:** Б байгууллага 222 гэсэн төлөвлөгөөтэй байхад reproduction нь `{shopId:'shop-b', months:[111 ×12]}` хадгалах хүсэлт гаргасан.

**Засвар:** response-ийг эхэлсэн shop/year-тэй нь тулгаж хэрэглэнэ. Сонгосон scope-ийн уншилт дуусаагүй үед хадгалахыг хаана.

### 5. Урилга болон AI замаар өөрийн Admin дүрийг өөрчилж болно

**Байршил:** [invite role upsert](../src/app/api/admin/users/invite/route.ts#L77), [AI assignRole](../src/lib/ai/data-assistant/admin-functions.ts#L121). Харьцуулах хамгаалалт: [users PATCH](../src/app/api/admin/users/route.ts#L107).

Users PATCH өөрийн дүрийг өөрчлөхийг 409-өөр хориглодог. Харин өөрийн email-ээр invite хийхэд existing-account magiclink зам `viewer` зэрэг сонгосон/default role-г өөрийн `user_roles` дээр бичнэ. AI `assign_role` acting user ID авч шалгахгүй. AI invite-ийн existing-account зам мөн role-г сольж, нууц үгийг reset хийдэг. Ганц `super_admin` өөрийн хандалтыг алдаж болно.

**Нотолгоо:** өөрийн email invite нь HTTP 200, өөрийн role `viewer`; AI `assign_role` мөн actor-д `viewer` бичсэн. AI зам defined role байгаа эсэхийг шалгахгүй; live `user_roles` нь role definition рүү FK-гүй.

**Засвар:** role assignment-ийн self guard, role validation-ийг бүх entry point-д ижил хэрэгжүүлнэ. Existing-account invitation нь зөвшөөрлийн preview-д дурдаагүй password reset хийхгүй.

### 6. AI-д оруулсан гэрээний PDF/зураг public URL-тай хадгалагдана

**Байршил:** [upload storage](../src/app/api/dashboard/upload/route.ts#L51), [public URL](../src/app/api/dashboard/upload/route.ts#L63), [гэрээний PDF урсгал](../src/lib/ai/orchestrator/agents.ts#L78).

AI composer зураг/PDF-ийг `products` bucket-д upload хийж, хугацаагүй `publicUrl` буцаана. Live metadata-д `products.public=true`. Contract agent гэрээний зураг/PDF оруулахыг дэмждэг тул хувийн баримт public bucket-д орно. Attachment metadata-ийн module/shop RBAC нь URL-ийг мэдсэн хүний файлын таталтыг хамгаалахгүй. Public bucket-ийн retrieval нь access control-ийг тойрдгийг [Supabase-ийн албан ёсны тайлбар](https://supabase.com/docs/guides/storage/buckets/fundamentals) баталдаг.

**Нотолгоо:** uploader/composer/contract flow-ийн код болон live bucket flag. Бодит нууц файл татаж үзээгүй; өмнө нь ийм файл хадгалсан эсэхийг энэ review батлаагүй.

**Засвар:** хувийн хавсралтыг private bucket-д хадгалж, download дээр session + module + shop/entity шалгана. Богино хугацаатай signed URL эсвэл хамгаалсан download endpoint ашиглана. Байрны нийтэд нээлттэй зургуудын зориулалтыг хадгална.

## P2 — үлдсэн алдаанууд

### 7. Boundary migration-ийн дараа ч webhook config/log module permission-ийг тойрно

**Байршил:** [орхигдсон module mapping](../supabase/migrations/20260928120000_rbac_api_boundary.sql#L61), [shop-only policies](../supabase/migrations/20260629120000_db_audit_fixes.sql#L48).

Migration `webhook_configs`, `webhook_logs`-ийн mutation-ийг revoke хийх боловч SELECT-д restrictive module policy нэмдэггүй. Legacy policy нь зөвхөн shop membership шалгана. `settings/leads/contracts` эрхгүй viewer config-ийн `url/headers`, log-ийн `payload` уншиж чадна. Header-д credential байвал нөлөө P1 болж өснө.

**Нотолгоо:** boundary-г хоёр удаа хэрэгжүүлсэн disposable DB дээр модульгүй viewer synthetic Authorization header болон customer/payment payload уншсан. Live metadata-д legacy policy/grant хэвээр. Бодит sensitive payload байгаа эсэхийг уншаагүй.

**Засвар:** идэвхтэй application caller олдоогүй эдгээр хүснэгтийн browser SELECT-ийг revoke хийх, эсвэл зориулалтын module + shop хамгаалалт нэмэх.

### 8. AI Admin tool DB/Auth алдааны дараа амжилт гэж буцаана

**Байршил:** [invite writes](../src/lib/ai/data-assistant/admin-functions.ts#L81), [new user writes](../src/lib/ai/data-assistant/admin-functions.ts#L94), [role permissions insert](../src/lib/ai/data-assistant/admin-functions.ts#L157).

Invite profile/role/membership болон existing password reset-ийн `error`-ийг шалгахгүй. Create role нь permission insert алдахад role-г буцаахгүй, амжилт гэж мэдээлнэ. Хэрэглэгч шаардлагатай эрхгүй эсвэл санал болгосон шинэ password ажиллахгүй үлдэнэ. Audit нь result.error байхгүй учраас амжилт гэж бүртгэж болно.

**Нотолгоо:** role persistence failure, password reset failure, duplicate module insertion failure гэсэн гурван тохиолдол бүгд `success:true` буцаасан.

**Засвар:** одоогийн Admin API validation/helper-ийг дахин ашиглаж, write бүрийн returned error-ийг шалгана. Partial state-д rollback/compensation эсвэл тодорхой partial-failure response шаардлагатай.

### 9. Төлсөн дүнг унших алдааг 0 гэж үзээд үлдэгдэл бичнэ

**Байршил:** [balance lookup](../src/app/api/admin/import/route.ts#L982).

Үнийн re-import existing `paid_amount` query-ийн error-ийг үл тоож, дутуу мөрийг 0 болгож тооцно. Шинэ үнэ 200, төлсөн 50 байхад lookup fail бол balance=200 бичиж HTTP 200 буцаана.

**Засвар:** paid lookup алдаа эсвэл шаардлагатай мөр дутвал update-г зогсооно. Database failure-г төлбөргүй гэрээ гэж үзэхгүй.

### 10. Active гэрээ импортлоход устгасан ижил дугаартай мөрийг давхар өөрчилнө

**Байршил:** [contract update filter](../src/app/api/admin/import/route.ts#L999).

Existing key уншилт deleted мөрийг хасдаг ч update нь `deleted_at IS NULL` шүүлтүүргүй. Active болон soft-deleted `C-001` хоёул ижил buyer/price/payment шинэчлэлт авсан. Active-only unique index ийм түүхэн давхцлыг зөвшөөрдөг.

**Засвар:** active + project scope-ийг update/paid lookup/key match-д ижил хэрэглэнэ; боломжтой бол баталгаажуулсан row ID-аар шинэчилнэ.

### 11. Дүрийн давхар хүсэлт module grant өөрчлөлтийг алдана

**Байршил:** [single saving state](../src/app/admin/roles/page.tsx#L25), [stale full module list](../src/app/admin/roles/page.tsx#L56), [pending disable](../src/app/admin/roles/page.tsx#L234).

А дүрийн save pending байхад Б дүрийн save эхлэхэд `saving=B` болж А-ийн товч дахин идэвхжинэ. А дээр дараагийн toggle нь хуучин state-ээс бүх module list-ийг үүсгэнэ. Reproduction-д эхний хүсэлт `['dashboard']`, дараагийнх `['leads']`; API full-list reconcile эхний grant-ийг хасна.

**Засвар:** role бүрийн save-г дарааллуулж, pending state-ийг role тус бүрээр барина. Хоцорсон response-ийг шинэ state дээр хэрэглэхгүй.

### 12. Roster хадгалах нь төлөвлөгөөний draft-ийг чимээгүй арилгана

**Байршил:** [shared reload](../src/app/admin/sales-targets/page.tsx#L129), [both-panel replacement](../src/app/admin/sales-targets/page.tsx#L72).

Target input 111-ээс 999 болгож, хадгалахаас өмнө roster save хийхэд shared `loadData` target-ийг 111 болгож буцаана. Нөгөө panel-ийн unsaved өөрчлөлтийг мөн shared reload дарж болно.

**Засвар:** хадгалсан panel-ийг л refresh хийх эсвэл dirty draft-ийг хадгалах.

### 13. Role revoke-ийн дараа Admin UI хуучин хандалтаа харуулна

**Байршил:** [AuthContext usage](../src/app/admin/layout.tsx#L30), [effect dependencies](../src/app/admin/layout.tsx#L70).

Layout `isSignedIn/isLoaded`-ийг л дагадаг. AuthContext `super_admin → viewer` шинэчлэгдэхэд cached admin болон children хэвээр, `/api/admin/settings` дахин дуудагдахгүй. **Admin API хүсэлтүүд эрхээ дахин шалгаж хориглодог; энэ нь серверийн privilege escalation биш.**

**Засвар:** user identity/role өөрчлөлтөөр Admin state-ийг хүчингүй болгож, дахин баталгаажуулна.

### 14. Боломжгүй календарийн огноо import validation-ийг давна

**Байршил:** [toDateStr](../src/lib/admin/import/mappers.ts#L99).

Month 1–12, day 1–31 гэдгийг шалгаад `2026-02-31`-ийг зөв огноо мэт буцаадаг. PostgreSQL `date` талбар ийм утгыг хүлээж авахгүй тул нэг мөрийн алдаа бүх insert batch-ийг унагах боломжтой.

**Нотолгоо:** бодит mapper `2026-02-31` буцаасан. Live batch оруулж шалгаагүй.

**Засвар:** календарийн бодит огноог шалгаж, буруу мөрийг row-level error болгож харуулна.

## Баталгаажуулалт ба хадгалсан нотолгоо

| Шалгалт | Үр дүн |
|---|---|
| Бүх Vitest suite | 85 файл, **810/810** давсан |
| Сонгосон Admin/RBAC/Auth/import suite | 9 файл, **154/154** давсан; дээрх 810-ийн дэд хэсэг |
| `npm run typecheck` | Давсан |
| `git diff --check` | Давсан |
| Одоогийн `npm run test:rbac` | Disposable PostgreSQL **15/15** давсан |
| Өргөтгөсөн DB proof | 16 шалгалт; хуучин escalation ба шинэ migration-ийн webhook read omission батлагдсан |
| Admin API proof | 6 defect reproduction батлагдсан |
| AI Admin proof | 4 defect reproduction давсан |
| Admin UI proof | 3 файл, 4 defect reproduction давсан |
| Live DB | Зөвхөн read-only migration/policy/grant/function/constraint/bucket metadata |

Reproduction-ууд зориуд одоогийн буруу behavior-ийг assert хийдэг. Тэдгээрийн “pass” нь алдаа дахин гарсныг илэрхийлнэ; засварын acceptance биш.

Нотолгоо: [live metadata](../output/admin-review-2026-09-30/live-rbac-snapshot.json), [DB proof log](../output/admin-review-2026-09-30/rbac-db-proofs.log), [UI proof тайлбар](../output/admin-review-2026-09-30/ui-proof/README.md).

```sh
node output/admin-review-2026-09-30/admin-api-proof.cjs
node output/admin-review-2026-09-30/rbac-db-proofs.mjs
rtk npx vitest run --config output/admin-review-2026-09-30/vitest.config.mjs
rtk npx vitest run --config output/admin-review-2026-09-30/ui-proof/vitest.config.mts
```

## Засах дараалал

1. Live role escalation boundary-г хаах release: companion кодын deployment, webhook уншилтын нэмэлт хамгаалалт, migration history, бодит role/session probe.
2. Хувийн PDF/image Storage болон бүх role assignment entry point-ийн хамгаалалтыг засах.
3. Import-ийн payment invariant, project scope, deleted-row filter, failed-read behavior-ийг засах.
4. Sales-target request race болон role editor overlap-ийг хаах; panel draft ба role revoke төлөвийг зөв болгох.
5. Зассан behavior-ийг assert хийсэн regression шалгалт үлдээж, production-д зөвшөөрөгдсөн болон хориглосон урсгалыг тусад нь батлах.
