# Admin + RBAC засвар — 2026-09-30

[Deep review](./ADMIN-RBAC-DEEP-REVIEW-2026-09-30.md)-ийн 14 асуудлын кодын засвар, regression шалгалтыг хэрэгжүүлэв. Live DB дээр тусдаа Admin хамгаалалтын migration хэрэгжсэн. 2026-10-01-ний main release-ийн кодыг тусгаарласан checkout-д нэгтгэж шалгав; production browser-ийн нэвтэрсэн write урсгалыг батлаагүй.

## Хэрэгжүүлсэн өөрчлөлт

| Review | Засвар | Баталгаа |
|---|---|---|
| 1 — browser role escalation | `user_roles`, `roles`, `role_permissions`, `shop_members`-ийн browser mutation grants хаав | Тусдаа migration live; disposable role escalation шалгалт |
| 2 — дахин импорт төлбөр дарна | Одоо байгаа advance/paid-ийг хадгалж, balance-ийг баталгаатай paid read-ээс бодно; update нь paid утгыг харьцуулна | Re-import болон concurrent receipt regression |
| 3 — төсөл хооронд мөр холилдоно | Active мөрийг shop/project/key-ээр тогтоож ID-аар шинэчилнэ; legacy/давхардсан харьяалалд row error | Хоёр төслийн ижил нэр, өөр төслийн гэрээний дугаарын regression |
| 4 — хуучин shop response хадгалагдана | Request generation, loaded scope, save үед selector хамгаалалт | Sales targets component regression |
| 5 — API/AI self-role хамгаалалт | Нэг shared actor/self-change guard; existing AI invite нууц үг reset хийхгүй | API + AI executor regression |
| 6 — хувийн файл public | Private `ai-attachments` bucket; stable download route бүр identity/shop/module шалгана; private image public listing-д орохгүй | Upload/download, model content болон attachment tool regression; bucket live private |
| 7 — webhook browser read | `webhook_configs`, `webhook_logs` server-only | Live grants, disposable denial шалгалт |
| 8 — AI partial error success | Auth/DB return error шалгаж, шинэ бүртгэл/дүр/гишүүнчлэлд compensating cleanup; cleanup failure ил тод | Provisioning, role creation failure regressions |
| 9 — paid read error = zero | Paid lookup бүтэлгүйтвэл ямар ч insert/update-ээс өмнө HTTP 500 | No-write regression |
| 10 — deleted contract давхар update | ID + shop/project + `deleted_at IS NULL` update; attachment contract resolution мөн active | Import болон attachment regression |
| 11 — role grant lost update | Нэг дүрийн module/field save сериал; өөр дүрийн response тусдаа merge | Давхар хүсэлтийн component regression |
| 12 — opposite panel draft алдагдана | Target save зөвхөн target, roster save зөвхөн roster refresh | Хоёр чиглэлийн draft regression |
| 13 — эрхгүй болсон Admin харагдана | Identity/role солигдоход UI шууд хааж, шинэ authorization шаардана; stale response хүчингүй | Layout revocation/identity regression |
| 14 — боломжгүй огноо batch эвдэнэ | Calendar/leap-year шалгалт; буруу мөр row error | Mapper болон mixed import regression |

Давхар review-ээр хувийн файлын authorization metadata-г хуучин shop-only policy-аар forge хийх боломж илэрсэн. Тусдаа migration нь `ai_attachments`-ийн browser read/write grants-ийг мөн хаадаг; guarded API/tool service client ашиглана. Private URL нь canonical хэлбэртэй байх ёстой, aliases нь metadata authorization-ийг тойрохгүй. Эрхгүй файлын bytes болон URL model input-д орохгүй.

Урилгын rollback нь зөвхөн successful `auth.admin.createUser`-ээс буцсан шинэ ID-г устгана. `generateLink(type: invite)` өмнө нь байсан баталгаажаагүй бүртгэлийг буцааж болох тул response mode-оор шинэ бүртгэл гэж дүгнэхгүй. Existing account-ийн metadata/profile/password-ийг хадгална; link-ийн ID зөрвөл provisioning зогсоно. Release нь remote-ийн strict RBAC-ийг хадгална: зөвхөн missing `super_admin` definition static fallback ашиглана. Бусад missing role definition болон DB read error дээр эрх олгохгүй.

## Live DB

Migration: `supabase/migrations/20260930120000_admin_rbac_private_attachments.sql`.

- **2026-09-30 23:19:58 Улаанбаатар / 15:19:58 UTC**: transaction амжилттай commit хийж, `supabase_migrations.schema_migrations`-д version бүртгэв.
- **23:24:42 Улаанбаатар / 15:24:42 UTC**: шинэ read-only connection-оор дахин шалгав. Environment project match=true.
- `anon`/`authenticated`: хамгаалсан 7 хүснэгтийн mutation эрх 0; webhook болон attachment metadata read эрх 0.
- `service_role`: эдгээр хүснэгтийн API read/write эрх хэвээр.
- `ai-attachments.public=false`, хэмжээ 4,194,304 bytes, MIME allow-list; Storage objects-д restrictive server-only policy байна.
- Тухайн snapshot-д `ai_attachments` 0 мөр, `products` Storage object 0 байсан. Хуучин файл шилжүүлэх шаардлага гараагүй; бодит файл/PII уншаагүй.

Нотолгоо (локал, ignored): [migration дараах snapshot](../output/admin-review-2026-09-30/live-admin-fix-after.json), [шинэ connection-оор шалгасан snapshot](../output/admin-review-2026-09-30/live-admin-fix-verified.json). Хэрэглэгчийн дүр, одоогийн membership, бизнесийн мөр өөрчлөөгүй.

Өргөн business boundary `20260928120000` live дээр хэвээр ороогүй. Surveys болон marketing companion API deployment-ийг баталсны дараа хэрэгжүүлнэ. Тусдаа шинэ migration нь Admin escalation болон webhook/private metadata хамгаалалтыг тэр release-ээс хамааралгүй хаасан.

## Verification

- Эцсийн full Vitest: **95 файл, 923 тест** давсан. Review baseline 810 тест байсан; засварын дараах regression coverage нэмэгдсэн.
- Disposable PostgreSQL: **19/19** RBAC шалгалт. Шинэ migration-ийг broad migration-ээс өмнө болон давтан хэрэгжүүлж шалгасан.
- TypeScript, targeted ESLint, `git diff --check` давсан.
- Next.js 16.3.4 production build давсан. Build нь `FACEBOOK_VERIFY_TOKEN` тохиргооны одоо байгаа анхааруулга гаргасан; provider acceptance биш.

Локал лог: [Vitest](../output/admin-review-2026-09-30/final-vitest.log), [production build](../output/admin-review-2026-09-30/final-build.log). Шалгалтууд final application source дээр ажилласан.

Provisioning нь Auth + DB хооронд compensating rollback ашиглана; нэг atomic transaction биш. Бодит invite email, хэрэглэгч үүсгэх/эрх солих, гэрээ импортлох, private файл upload хийх production урсгал ажиллуулаагүй. Local test/build болон live DB privileges нь application deployment/E2E proof-ийг орлохгүй.

## Release төлөв

2026-10-01: `origin/main` (`4b5680d`) дээр тусгаарласан release checkout ашиглав. Primary checkout-ийн бусад ERP/report/marketing/Admin өөрчлөлтийг хадгалсан. Task-ийн код, тест, migration, тайланг main release-д багтаасан; unrelated хуучин өөрчлөлтөөр remote кодыг дараагүй. Invite UI-д explicit байгууллагын сонголт, хоёр component regression нэмэв.

Тусгаарласан push хувилбарын full Vitest **94 файл / 901 тест**, disposable RBAC **19/19**, production build, TypeScript, targeted ESLint, diff check давсан. Өмнөх 923 тестийн тоо нь ERP болон бусад тусдаа dirty өөрчлөлттэй primary checkout-ийн шалгалт; 901 нь release checkout-ийн бүх тест. Vercel deployment болон production E2E acceptance энэ Git push-ийн баталгаа биш. Release-ийн дараа бодит session-тай allowed/denied role assignment, project-scoped import, membership/role revocation, private download урсгалыг батална.
