# Vertmon Hub — засвар ба гаргалтын бэлэн байдал

2026-09-13. Өмнөх өөрчлөлтүүдийг хадгалж, review-ээр илэрсэн найдвартай ажиллагааны асуудлуудыг засав. Гаргалтын явц ба бодит шалгалтын үр дүнг доор тусад нь тэмдэглэв.

## Зассан зүйл

- **AI эрх:** бүх business tool модулийн эрхтэй холбогдоно. Бүртгэлгүй tool хаалттай. Файл хавсаргахдаа тухайн төрлийн entity-ийн эрхийг дахин шалгана. Ярианы хураангуйг model руу дамжуулахын өмнө хэрэглэгч, байгууллагаар шүүнэ.
- **AI тасалдах:** өмнө гүйцэтгэсэн ажлууд, trace, баталгаажуулалт хүлээж буй картууд хариунд үлдэнэ. Тасалдсан хүсэлтийг автоматаар дахин ажиллуулахгүй; жагсаалтууд шинэчлэгдэнэ.
- **Төлбөр:** нийлүүлэгчийн нэхэмжлэл, гүйлгээний дэвтэр, аудит нэг transaction-д хадгалагдана. Давтан хүсэлт, зэрэг төлөлт, хэтрүүлсэн дүн, цуцалсан нэхэмжлэл хамгаалалттай. Гэрээний төлбөрийн өмнөх atomic migration-тай хамт шалгасан.
- **Тайлан:** санхүүгийн query бүх хуудсаа татна; устгасан/цуцалсан гэрээг хасна. Мөнгө, бартер, төрөл тодорхойгүй төлбөр тусдаа. Өдрийн хил Улаанбаатарын цагаар. Эх өгөгдлийн алдааг тэг орлого гэж үзэхгүй.
- **Офлайн лид:** хэрэглэгч, байгууллагаар тусгаарлана. 401, 429, олон удаагийн алдааны дараа бүртгэл устахгүй. Дахин илгээх/устгах UI-тай; төхөөрөмжид хадгалж чадаагүй үед формын утга үлдэнэ.
- **Уулзалт:** API ба AI нэг service ашиглана. Байр сонгоогүй уулзалтыг дэмжинэ. Лидийн төлөв/цаг/түүх шинэчлэгдэж, зэрэг өөрчилсөн хаалттай лидийг буцааж нээхгүй. Нэр давхцвал тодруулна; утсыг нормчилж яг тааруулна. Хэсэгчлэн хадгалсан бол анхааруулгатай амжилт буцаана.
- **Өдөр тутмын UI:** “Хадгалаад уулзалт товлох” шууд форм нээнэ. Лидийн панел, хувийн/захирлын самбар, байрны тайлан нь алдаа/дахин оролдох төлөвтэй. Дутуу эх өгөгдлийг “ажил алга” гэж харуулахгүй.
- **CI:** unit, SQL transaction, нэвтэрсэн desktop/mobile browser урсгалууд шалгагдана. Browser тест credentials байхгүйгээс алгасахгүй.

## Шалгах команд

Гаргах `98012ae` commit-ийн тусдаа checkout дээр **61 файл, 589 unit тест амжилттай**. Түр PostgreSQL: гэрээний **9**, нийлүүлэгчийн **7**, нийт **16/16** шалгалт амжилттай. Browser-ийн desktop/mobile урсгал нь нэвтрэх, лид хадгалах, уулзалт товлох, тайлан, алдааны төлөв болон хэвтээ overflow-ийг шалгана.

Эцсийн TypeScript шалгалт, Vercel production build, `git diff --check` амжилттай. ESLint: **0 алдаа, 26 warning**. Production төлөвийг доорх гаргалтын бүртгэлээр шалгана.

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:payments
npm run test:workflow
```

Local Chrome ашиглах бол `E2E_BROWSER_CHANNEL=chrome npm run test:workflow`. CI өөрийн Chromium-ийг суулгана.

Browser шалгалт нь жинхэнэ app login handler, session cookie, proxy хамгаалалтыг loopback auth fixture-тай ажиллуулна. Бизнесийн API өгөгдөл нь memory fixture. Нэвтрэх → лид → уулзалт → тайлан, mobile overflow, алдаа/partial мэдээлэл/дахин оролдох урсгалыг шалгана. Production RLS, гаднын webhook, бодит мөнгөн гүйлгээний E2E гэж тайлбарлахгүй.

SQL шалгалтууд нь PGlite дахь тусдаа түр PostgreSQL-д ажиллаж, transaction rollback, replay, tenant, permission, санхүүгийн хязгааруудыг батална. `DATABASE_URL` ашиглахгүй. Application-ийн өмнөх `test-results/landing-page.png`-ийг устгахгүй, шинэ browser гаралт `test-results/workflow/`-д орно.

## Гаргалтын өмнөх бодит шалгалт

- Local `OPENAI_API_KEY` байна. GPT-5.6 Luna synthetic хүсэлт `completed`, `Холболт хэвийн` гэж хариулсан; 22 input + 10 output = 32 token. Харилцагчийн өгөгдөл явуулаагүй, business tool ажиллуулаагүй.
- Холбогдсон database-д зөвхөн унших transaction хийв: хоёр шинэ payment RPC болон migration history-ийн хувилбарууд **байхгүй**. `vendor_bills`, `finance_audit_log` суурь хүснэгтүүд байна.
- Local `FACEBOOK_VERIFY_TOKEN` байхгүй. Deployment environment-ийн Meta тохиргоог энэ баримтаар дүгнэхгүй.

## Release дараалал

Production Supabase төсөл local database-тай ижил гэдгийг тулгасан. GPT түлхүүрийг production-д Sensitive байдлаар тохируулж, Supabase URL/key ба DATABASE_URL-ийн төгсгөлийн илүү newline-ийг цэвэрлэсэн. Migration болон production deployment хэрэглэгчээр батлагдсан.

1. `supabase/migrations/20260913160000_atomic_contract_payments.sql`, дараа нь `20260913170000_atomic_vendor_bill_payments.sql`-ийг нэг хяналттай database transaction-аар хэрэглэж, тус бүрийн version/name/statements-ийг `supabase_migrations.schema_migrations`-д бүртгэнэ. Эдгээр нь нэмэлт schema/function өөрчлөлт; түүхэн орлого зохиож нөхөхгүй. Гэрээний төлбөрийн хүснэгтийн browser write эрхийг хаадаг тул migration ба шинэ app release-ийг зохицуулна.
2. Deployment-ийн OpenAI болон Meta тохиргоог шалгаж, батлагдсан өөрчлөлтүүдийг deploy хийнэ. Runtime нь Node >=20.9 байх ёстой.
3. Нэвтэрсэн production орчинд provider/model/configured төлөв, зөвхөн унших AI асуулт, үндсэн хуудас ба health-ийг шалгана. Бодит төлбөр, лид, уулзалт, гадагш мессежийг smoke test болгон үүсгэхгүй; төлбөрийн бичилтийг түр PostgreSQL тестээр шалгана.

## Production гаргалтын бүртгэл

- App commit: `98012aea352c359ab9edb56e562f9c2fcc5ce0e2`. Зэрэгцээ workspace өөрчлөлтийг оруулахгүйн тулд энэ commit-ийн тусдаа archive-ийг deploy хийв.
- Vercel production build: `dpl_BbuqgPU6n2DNUBeGNBd3kitAfQhT`, `READY`. Анхны build-ийг `--skip-domain`-аар бэлдсэн; health 200.
- `20260913160000`, `20260913170000` migration-ууд **2026-09-13 15:42:52 UTC** (Улаанбаатар 23:42:52)-д нэг transaction-аар commit хийгдсэн. Exact SQL-ийг migration history-д бүртгэсэн.
- Хоёр RPC `SECURITY DEFINER`, тогтмол `search_path=public`, зөвхөн `service_role` execute эрхтэй. Хоёр request unique index valid. `payment_schedules` browser INSERT/UPDATE/DELETE хаалттай, server write эрх хэвийн.
- Migration-ийн SQL history, 7 шинэ багана, хоёр receipt-kind check, vendor-bill FK, index болон эрхийг тусдаа read-only шалгалтаар дахин баталсан.
- Production домэйныг дээрх `READY` deployment руу promote хийв. `www.vertmon.mn` resolve нь яг энэ deployment ID-тай таарсан. Үндсэн хуудас 200, health 200; нэвтрээгүй agents API 401, dashboard 307 login redirect.
- **4/4 Chrome browser урсгал амжилттай.** Уулзалтын хуудас query параметрээ хэрэглэсний дараа цэвэрлэдэг тул тест түр URL хүлээхээ больж, нээгдсэн форм, сонгосон харилцагч, илгээсэн lead ID-г шалгана. Энэ нь app кодын өөрчлөлтгүй тестийн timing засвар.

Migration орохоос өмнө шинэ төлбөрийн бичилт 503 өгнө. Deploy-ийг түр буцаах шаардлагатай бол нэмсэн schema-г хадгалж, хуучин салангид payment writes-ийг сэргээхгүй.

## Үлдсэн хүрээ

Банкны хуулга ба Meta Ads-ийн огноотой импорт, хуучин Excel өгөгдлийн цэвэрлэгээ, багийн хамтын task/батлах шатлал нь бизнесийн эх өгөгдөл ба шийдвэр шаарддаг. Хуучин owner-гүй офлайн draft-ууд хадгалагдана, автоматаар өөр хэрэглэгчид оноохгүй. AI pending картын reload-ийн дараах бүрэн сэргэлт, бүх write tool-ийн HTTP request хоорондох idempotency одоогоор байхгүй; тодорхойгүй үр дүнг шалгахаас өмнө дахин илгээхийг UI хориглоно.

Vercel production build амжилттай; Meta verify token production-д байна. Chart-ийн SSR хэмжээний өмнөх анхааруулга болон Node-ийн нээлттэй version range warning үлдсэн. Lint-ийн warning-уудыг алдаа гэж дарахгүй; шинэ санхүү, эрх, офлайн засварууд тусгай regression шалгалттай.

Production dependency audit: critical/high 0, moderate 12, low 1. OpenTelemetry/Sentry, CSV parsing, UUID-ийн advisory-уудыг тусдаа dependency шинэчлэлээр шийдэх шаардлагатай; `npm audit fix --force`-ийн ExcelJS downgrade-ийг хэрэглээгүй.
