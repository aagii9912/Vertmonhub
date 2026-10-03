# Шинэ хэрэглэгч, төсөл, менежерийн урсгалын review

Огноо: 2026-10-01. Шалгасан урсгал: шинэ бүртгэл → шинэ төсөл → шинэ менежерүүд → өдөр тутмын ажил.

**Дүгнэлт: энэ урсгал одоогоор бүхэлдээ ажиллахгүй.** Апп дотоод, super_admin-аар бүртгэл олгодог загвартай. Төсөл үүсгэж, хэрэглэгч нэмэх боломж бий. Гэхдээ өөрөө бүртгүүлж эхлэх зам хаалттай; борлуулалтын менежерийн акаунт ба roster тусдаа; төсөлд менежер оноох бүтэц байхгүй.

Энэ review бүртгэлийн загвар, байгууллага/төслийн эрхийн бүтцийг өөрчлөөгүй. Auth болон менежерийн identity-ийн бодит алдааг локал кодод зассан.

## Үлдсэн саад

| Зэрэг | Олдвор | Нотолгоо ба үр дагавар |
| --- | --- | --- |
| P1, хүссэн урсгалын саад | Өөрөө бүртгүүлэх зам хаалттай | `src/proxy.ts:37` `/auth/register`-ийг `/auth/login` руу шилжүүлнэ. Live domain дээр мөн 307. Supabase Auth signup нээлттэй ч апп profile/role/shop onboarding хийдэггүй. `/api/me` role байхгүй хэрэглэгчийг viewer гэж буцаана; shop үүсгэх API settings/write шаарддаг. |
| P1 | Шинэ sales_manager акаунт идэвхтэй roster-т автоматаар холбогдохгүй | `src/lib/admin/user-provisioning.ts:41` profile, shop_members, user_roles л бичдэг. Dashboard mode sales_manager role-ийг personal гэж үзнэ. Харин lead/meeting attribution идэвхтэй roster identity шаарддаг, claim 403 буцаана. Админ `/admin/sales-targets` дээр account-ийг roster-т нэмж холбох нэмэлт алхамтай. |
| P1, хүссэн төслийн scope-ийн саад | Менежерүүд shop-д харьяалагдана; тусгай project-д оноогдохгүй | Invitation input, shop_members, sales_managers-д project_id байхгүй. User role глобал. Нэг shop доторх project-уудыг бие даасан багийн эрхийн хил гэж үзэж болохгүй. |
| P2 | Өдөр тутмын lead/meeting creation төсөл сонгохгүй | `src/app/api/dashboard/leads/route.ts` create schema/insert болон `src/lib/services/ViewingService.ts` insert project_id дамжуулдаггүй. Шинэ project үүсгэсэн нь шинэ quick-create lead-ийг тэр project-д автоматаар оруулахгүй. Project report/filter-т эдгээр бичлэг орохгүй байж болно. |
| P2, тохиргоо | Login-ийн Google/Facebook/Apple товчид ажиллах provider байхгүй | Live `/auth/v1/settings` дээр эдгээр provider бүгд false, зөвхөн email true. Энэ review provider тохиргоо өөрчлөөгүй. |

Төсөл болон хэрэглэгч үүсгэх `/api/admin/*` API нь `getAdminUser()`-аар зөвхөн super_admin-д нээлттэй. Энэ нь одоогийн эрхийн загварын хил; шинэ хэрэглэгчийг шууд super_admin болгох байдлаар засаж болохгүй.

## Зассан алдаа

1. **P1 — Урилгын session үүсэхгүй байх.** Browser Supabase client PKCE ашигладаг. Админы `generateLink` implicit access-token холбоос recipient-ийн PKCE verifier-гүй. Invite API одоо `properties.hashed_token` болон шалгасан verification_type ашиглаж аппын callback холбоос үүсгэнэ. Callback `verifyOtp`-оор шалгаж SSR cookie бичнэ. Имэйл болон гараар хуулах fallback ижил холбоос авна. Token/type дутуу үед provisioning эхлэхгүй; зөвхөн тухайн хүсэлтээр үүсгэсэн шинэ account cleanup хийнэ.
2. **P1 — Ижил нэрээр өөр менежерийн identity ашиглах.** `matchRosterEntry` өөр user_id-д холбосон мөрийг нэрээр авах боломжтой байсан. Одоо user_id холбоос тэргүүлнэ, нэрийн legacy таарц зөвхөн account холбоогүй мөрөнд үйлчилнэ. Өөр account-ийн нэрийг personal report fallback болгож ашиглахгүй. Roster унших алдаанд нэрээр attribution хийхгүй.
3. **P2 — Хугацаа дууссан callback шалтгаангүй login loop болох.** Callback exchange/verification error болон session үүсээгүй хариуг шалгана. Login Монгол тайлбар болон шинэ урилга авах заавар харуулна. Redirect token/provider-ийн дотоод алдааг тусгахгүй; callback хариу no-store.
4. **P2 — Нууц үгийн утга өөрчлөгдөх.** Login API password.trim() хийдэг байсан. Гадаад Auth/signup замаар зайтай үүссэн зөв password нэвтэрч чадахгүй. Одоо имэйл normalize хийж, password-ийг яг дамжуулна; credential төрөл/JSON-ийг шалгаж, 500 хариунд дотоод алдаа задлахгүй.

## Live read-only нотолгоо

2026-10-01 09:47–09:50 Asia/Ulaanbaatar. Production DB дээр зөвхөн `BEGIN READ ONLY` болон SELECT; Auth/domain дээр зөвхөн GET.

- Auth user insert trigger байхгүй. Auth account үүсэхэд profile/role/shop автоматаар үүсэхгүй.
- 1 shop, 3 project, 4 sales_manager акаунт.
- Дээрх 4 акаунт бүгд өөрийн гишүүн shop-д идэвхтэй roster identity-гүй: user_id холбоос болон холбоогүй legacy нэрийн таарц хоёулаа 0.
- Идэвхтэй roster 5; 4 нь account user_id холбоогүй. Хуучин борлуулалт/гэрээний бичлэг өөрчлөөгүй.
- Auth signup disabled=false, email autoconfirm=false. Google/Facebook/Apple=false.
- Live `/auth/register` 307 `/auth/login`; `/auth/login` 200. Нэвтрээгүй `/api/me`, `/api/admin/projects` 401.
- `20260930120000` migration бүртгэлтэй; өргөн `20260928120000` RBAC migration бүртгэлгүй. Disposable policy тестийн дүнг live policy баталгаажуулалт гэж үзэхгүй.

Локал evidence: `output/onboarding-review-2026-10-01/live-read-only.json`, `live-flow-gaps.json`. Эдгээр нь aggregate/schema мэдээлэл; хэрэглэгчийн имэйл, token, password агуулаагүй.

## Баталгаажуулалтын хил

Unit/route regression нь локал mock DB/Auth ашиглана. Browser тест нь жинхэнэ Next login/callback/proxy, SSR cookie, UI-г тусгаарласан Auth fixture-тэй шалгана. Admin/CRM fixture хариунууд бодит DB write эсвэл email delivery-ийн нотолгоо биш. Lifecycle route тест бодит provisioning/identity/lead/claim handler-уудыг stateful in-memory DB adapter-тай ажиллуулна.

Локал баталгаажуулалт: 959 Vitest test амжилттай, skip/failure 0; lifecycle route integration 4 тест энэ нийтэд орсон. Disposable PostgreSQL RBAC 19/19. TypeScript болон production build амжилттай. Scoped ESLint цэвэр; бүтэн lint 0 error, 24 warning. Build-д өмнө байсан `FACEBOOK_VERIFY_TOKEN` тохиргооны warning хэвээр. Unit JSON evidence: `output/onboarding-review-2026-10-01/unit-results.json`.

Chrome browser шалгалт: шинэ onboarding suite **8/8**, хуучин workflow suite **4/4** амжилттай. Шинэ suite-ийн 6 тохиолдол бодит Next login/callback/proxy ба disposable Auth transport ашиглан registration redirect, password-ийн яг утга, шинэ browser дахь invite session, хоёр менежерийн тусдаа cookie, хугацаа дууссан/буруу/дахин ашигласан token, session-гүй хамгаалалт шалгасан. Үлдсэн 2 нь desktop/mobile viewport дахь admin project, хоёр manager, lead, meeting, хувийн task болон save-error recovery UI-г API fixture-тэй шалгасан. Шинэ config canonical `localhost` ашиглана: Next dev request origin normalization үед 127.0.0.1/localhost cookie alias зөрөхөөс сэргийлсэн.

Screenshot evidence: `output/onboarding/{desktop,mobile}-{project,managers,task}.png`. Manager-ийн хувийн task бусад manager-д харагдахгүйг UI fixture дотор шалгасан; бодит DB/RLS хилд хамаарах нотолгоо нь тусдаа disposable PostgreSQL тестүүд.

Production дээр шинэ test account, project, manager, lead үүсгээгүй; урилга/имэйл илгээгээгүй. Энэ task commit/push/deploy/migration хийгээгүй. Иймээс **authenticated production onboarding E2E амжилттай** гэж дүгнээгүй.

Давтан ажиллуулах:

```bash
rtk npm run test
rtk npm run test:rbac
rtk npm run typecheck
rtk npm run build
E2E_BROWSER_CHANNEL=chrome rtk npx playwright test --config=playwright.onboarding.config.ts
E2E_BROWSER_CHANNEL=chrome rtk npm run test:workflow
```

## Одоогийн ажиллуулах дараалал

Super_admin байгууллагыг сонгож project үүсгэнэ. Менежерийн account үүсгэх/урихдаа shop болон sales_manager role сонгоно. Дараа нь `/admin/sales-targets` дээр менежерийг идэвхтэй roster-т account user_id-аар холбож хадгална. Менежер нэвтэрч lead/task/meeting ажлаа хийж болно; тусгай project-ийн бие даасан эрх, өдөр тутмын project attribution одоогоор хангагдаагүй.

Self-service урсгал шаардвал тусдаа байгууллагын эзний onboarding болон байгууллагадаа хязгаарлагдсан project/team management хэрэгтэй. Зөвхөн `/auth/register` redirect-ийг авах нь дээрх бусад саадыг шийдэхгүй.
