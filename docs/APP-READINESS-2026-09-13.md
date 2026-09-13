# Vertmon Hub — засвар ба гаргалтын бэлэн байдал

2026-09-13. Одоогийн workspace дээрх өмнөх өөрчлөлтүүдийг хадгалж, review-ээр илэрсэн найдвартай ажиллагааны асуудлуудыг засав. Энэ баримт нь production deploy хийгдсэн гэсэн баталгаа биш.

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

Эцсийн нэгдсэн unit шалгалт: **59 файл, 581 тест амжилттай**. Browser: **4/4**. Түр PostgreSQL: гэрээний **9**, нийлүүлэгчийн **7**, нийт **16/16** шалгалт амжилттай. Browser-ийн desktop/mobile урсгалд page error, хэвтээ overflow илрээгүй.

Эцсийн TypeScript шалгалт, production build, `git diff --check` амжилттай. ESLint: **0 алдаа, 26 warning**. Commit, push, deploy болон production migration энэ засвараар хийгээгүй.

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

2026-09-13-ны гаргалтын өмнөх давтан шалгалт: нэмэлт UI засваруудтай **60 файл, 587 тест**, **4 browser урсгал**, TypeScript амжилттай. Production Supabase төсөл local database-тай ижил гэдгийг тулгасан. GPT түлхүүрийг production-д Sensitive байдлаар тохируулж, Supabase URL/key ба DATABASE_URL-ийн төгсгөлийн илүү newline-ийг цэвэрлэсэн. Дараах migration болон deployment алхмууд хэрэглэгчээр батлагдсан.

1. `supabase/migrations/20260913160000_atomic_contract_payments.sql`, дараа нь `20260913170000_atomic_vendor_bill_payments.sql`-ийг нэг хяналттай database transaction-аар хэрэглэж, тус бүрийн version/name/statements-ийг `supabase_migrations.schema_migrations`-д бүртгэнэ. Эдгээр нь нэмэлт schema/function өөрчлөлт; түүхэн орлого зохиож нөхөхгүй. Гэрээний төлбөрийн хүснэгтийн browser write эрхийг хаадаг тул migration ба шинэ app release-ийг зохицуулна.
2. Deployment-ийн OpenAI болон Meta тохиргоог шалгаж, батлагдсан өөрчлөлтүүдийг deploy хийнэ. Runtime нь Node >=20.9 байх ёстой.
3. Нэвтэрсэн staging/production орчинд унших business хүсэлт, баталгаажуулалттай төлбөрийн preview, зөвшөөрөгдсөн туршилтын лид/уулзалтыг хадгалж, бодит DB үр дүнтэй тулгана. Бодит төлбөр/мессежийг smoke test болгон үүсгэхгүй.

Migration орохоос өмнө шинэ төлбөрийн бичилт 503 өгнө. Deploy-ийг түр буцаах шаардлагатай бол нэмсэн schema-г хадгалж, хуучин салангид payment writes-ийг сэргээхгүй.

## Үлдсэн хүрээ

Банкны хуулга ба Meta Ads-ийн огноотой импорт, хуучин Excel өгөгдлийн цэвэрлэгээ, багийн хамтын task/батлах шатлал нь бизнесийн эх өгөгдөл ба шийдвэр шаарддаг. Хуучин owner-гүй офлайн draft-ууд хадгалагдана, автоматаар өөр хэрэглэгчид оноохгүй. AI pending картын reload-ийн дараах бүрэн сэргэлт, бүх write tool-ийн HTTP request хоорондох idempotency одоогоор байхгүй; тодорхойгүй үр дүнг шалгахаас өмнө дахин илгээхийг UI хориглоно.

Build амжилттай ч Meta token болон chart-ийн SSR хэмжээний өмнөх анхааруулгууд үлдсэн. Lint-ийн warning-уудыг алдаа гэж дарахгүй; шинэ санхүү, эрх, офлайн засварууд тусгай regression шалгалттай.

Production dependency audit: critical/high 0, moderate 12, low 1. OpenTelemetry/Sentry, CSV parsing, UUID-ийн advisory-уудыг тусдаа dependency шинэчлэлээр шийдэх шаардлагатай; `npm audit fix --force`-ийн ExcelJS downgrade-ийг хэрэглээгүй.
