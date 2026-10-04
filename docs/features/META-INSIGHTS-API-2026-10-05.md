# Meta Marketing API — дэлгэрэнгүй insights (2026-10-05)

**Төлөв (2026-10-05):** код `meta-api` branch дээр. Production-д
`20261005130000_meta_ad_insights.sql` миграци **хэрэглээгүй**, `META_ADS_SYSTEM_TOKEN`
**тохируулаагүй**. Production-ийн аль ч төсөлд Meta токен, зарын данс сонгогдоогүй
тул доорх эзэмшигчийн алхмуудыг хийх хүртэл юу ч татагдахгүй.

Зорилго: Лхагва гарагийн хурлын тайлангийн Meta картыг файл импортгүйгээр автоматаар
бөглөх — зардал, харагдалт, товшилт, үр дүнг **төрлөөр** (дуудлага, мессеж, лид,
оролцоо, ThruPlay, хүрсэн хүн…), кампанит ажлаар, долоо хоногийн давхардалгүй reach-тэй.

## Юу татдаг вэ

Cron `/api/cron/ads-insights-sync` (6 цаг тутам) болон `/marketing` дээрх
**«Meta зардал татах»** товч зарын данстай төсөл бүрт хоёр алхам хийнэ:

1. **Зардал** (өмнөх шигээ, өөрчлөгдөөгүй): `level=campaign`, өдрөөр →
   `meta_daily_spend` (эх валют + MNT ханш). `docs/features/META-DAILY-SPEND-2026-09-21.md`.
2. **Дэлгэрэнгүй үр дүн** (шинэ): `{act}/insights` `level=adset`, `time_increment=1`,
   cron дээр сүүлийн 35 өдөр, товчоор самбарын сонгосон 93 хүртэл өдөр (дансны цагийн
   бүсээр). Талбарууд: `account_id, account_currency, campaign_id, campaign_name,
   adset_id, adset_name, objective, optimization_goal, date_start, date_stop, spend,
   impressions, reach, frequency, clicks, inline_link_clicks, actions,
   cost_per_action_type, video_thruplay_watched_actions, results, cost_per_result`.

Хуудсыг cursor-оор татна (`paging.next`-ийг хэзээ ч дагахгүй). Мөр бүрийг хатуу шалгана:
данс/валют таарах, ID тоо, нэг өдрийн мөр, хугацаан дотор, тоо зөв, ad set × өдөр
давхардаагүй. Нэг ч мөр буруу бол бүх таталт алдаа болж **өмнөх өгөгдөл хэвээр** үлдэнэ.

### Хүснэгтүүд

| Хүснэгт | Агуулга |
|---|---|
| `meta_ad_insights_daily` | shop × данс × өдөр × ad set: зардал, impressions, **өдрийн** reach (нэмэхгүй), clicks, inline_link_clicks, landing_page_views, calls_placed, result_type / result_indicator / results / result_source, actions, cost_per_action_type. UNIQUE (shop, данс, өдөр, ad set). RLS, зөвхөн service_role. |
| `meta_insights_sync` | Дэлгэрэнгүй синкийн төлөв (сүүлийн оролдлого/амжилт, хугацаа, мөр, долоо хоногийн тоо, алдаа). `meta_spend_sync`-ийн `last_attempt_at` нь зардлын синкийг хуучирсан бичилтээс хамгаалдаг тул түүнд хүрэхгүй тусдаа хүснэгт болгосон. |
| `marketing_channel_reports` | Долоо хоног бүрийн `meta_ads` тайлан, `origin = 'api'`. |

`save_meta_ad_insights(p_shop, p_account, p_from, p_to, p_rows)` — SECURITY INVOKER,
зөвхөн service_role: данс тухайн төслийн сонгосон данс эсэхийг шалгаж, хугацааны
мөрүүдийг нэг transaction-д сольж (Meta засварласан/арилсан мөр), мөрийн тоог буцаана.

### Хурлын долоо хоногийн тайлан

Амжилттай синкийн дараа `[from, to]` дотор **эхэлсэн** Лхагва–Мягмар долоо хоног бүрийн
`meta_ads` тайланг хадгалсан мөрүүдээс дахин бодож `marketing_channel_reports`-д
(shop, source, period_from, period_to)-оор upsert хийнэ:

- `period_from/to` = долоо хоног, `data_from` = долоо хоногийн эхэн, `data_to` =
  min(долоо хоногийн төгсгөл, `to`), `origin = 'api'`, `file_name`/`content_hash` хоосон,
  `row_count` = ad set × өдрийн мөр.
- Cron: `from`-оос өмнө эхэлсэн долоо хоногийг алгасна (хагас; өмнөх синкүүд бүтнээр
  бичсэн). Гар товч: самбарын хугацаа долоо хоногийн дундаас эхэлбэл (жишээ нь «энэ
  сар» = сарын 1) татах эхлэлийг тэр долоо хоногийн Лхагва руу сунгаж долоо хоногийг
  бүтнээр бичнэ — хадгалах RPC-ийн 93 өдрийн хязгаарт багтвал (эс бөгөөс алгасна).
- Өнөөдрийг агуулсан (дуусаагүй) долоо хоног бичигдэнэ — `data_to` нь өнөөдөр тул
  хурлын тайланд «N/7 өдөр» харагдана.
- Гараар сонгосон хугацаа өнгөрсөн долоо хоногийн дунд дуусвал тэр долоо хоногийг
  **бичихгүй** (өмнө бүтэн бичигдсэн тайланг хагасаар дарахгүй).
- **Мөргүй долоо хоног:** API «хүргэлтгүй» ба «энэ дансны өгөгдөл биш» (өөр данс,
  холбохоос өмнө) хоёрыг ялгаж чаддаггүй. Тиймээс мөргүй долоо хоногийг зөвхөн
  татсан цонхонд түүнээс **өмнө** энэ дансны өгөгдөл байгаа бол 0-ээр бичнэ
  (шинээр холбосон/сольсон дансны өмнөх долоо хоногууд, цонхондоо огт өгөгдөлгүй данс
  юу ч бичихгүй — «мэдээлэлгүй» хэвээр, таамаглахгүй), файлаас импортолсон тайланг
  хэзээ ч 0-ээр дарахгүй.
- Өгөгдөлтэй долоо хоног бүрт давхардалгүй reach-ийн 2 нэмэлт дуудлага (доор).

## Үр дүнг төрлөөр нь яаж тодорхойлдог вэ

Төрлийн толь: `src/lib/marketing/meta-results.ts` (CSV импорттой нэг толь).

1. Мөрийн `results` талбар (Meta албан ёсоор баримтжуулаагүй — хамгаалалттай уншина:
   `[{ indicator, values: [{ value }] }]`, олон attribution цонхтой бол `default`-ийг)
   ирвэл: төрөл = `metaResultTypeOf(indicator)`, тоо = утга (утгагүй бол 0).
   `result_source = 'results'`.
2. Эс бөгөөс: төрөл = `metaResultTypeForGoal(optimization_goal)`, тоо нь `actions`-аас
   тухайн төрлийн **нэг** action_type (`META_RESULT_ACTION_TYPES`, жишээ нь
   `onsite_conversion.lead_grouped` байвал түүнийг, үгүй бол `lead` — хоёуланг нэмэхгүй);
   ThruPlay = `video_thruplay_watched_actions`; reach = тухайн мөрийн reach.
   `result_source = 'goal'` (ойролцоо; тайланд мэдээллийн тэмдэглэл гарна).
3. Meta `results`/`cost_per_result`/`video_thruplay_watched_actions` талбарыг (code 100)
   татгалзвал тэдгээргүйгээр **нэг удаа** дахин татаж, бүх мөрийг 2-р аргаар тооцно.
4. Мөр бүрт төрлөөс үл хамааран `calls_placed` (`click_to_call_native_call_placed`) ба
   `landing_page_views` (`landing_page_view`)-ийг `actions`-аас хадгална.

**Кампанит ажлын төрөл:** долоо хоногт үр дүн гарсан ad set-үүдийн төрөл. Ганц төрөл
бол тухайн кампанит ажлын **бүх** зардал (үр дүнгүй өдрүүд, өөр зорилготой үр дүнгүй
ad set-ийнх ч) тэр төрөлд ногдоно (`spend_<төрөл>`, кампанит ажлын зорилгоор). Ad set-үүд
өөр өөр төрлийн үр дүнтэй бол задаргаанд (кампанит ажил, төрөл) тус бүрд тусдаа мөр;
тэр үед эдгээр төрлийн аль нь ч биш, үр дүнгүй ad set-ийн зардал кампанит ажлын хамгийн
их зардалтай үр дүнгийн төрөлд ногдоно (кампанит ажил гаргаагүй төрөл тайланд гарахгүй).
Үр дүнгүй кампанит ажил ad set-ийнхээ зорилгын төрлийг авна. Тоо нь ирээгүй төрлийн
(жишээ нь `IMPRESSIONS` зорилго → `other`) зардлыг харуулж, тоо/өртгийг тооцохгүй.

## Reach

- Өдрийн reach-ийг өдөр, ad set, кампанит ажлаар **хэзээ ч нэмэхгүй**.
- Долоо хоног бүрт: `level=account` (`reach,frequency,impressions,spend`, time_increment-гүй)
  → `totals.reach`, `frequency = impressions / reach`; `level=campaign`
  (`campaign_id,reach`) → задаргааны мөрийн `reach` (кампанит ажил ганц мөртэй үед).
- `results_reach` = reach зорилготой кампанит ажлуудын давхардалгүй reach-ийн **нийлбэр**
  (кампанит ажил хооронд давхцаж болно — тэмдэглэл гарна); өртөг 1000 хүнд.
  Reach зорилготой мөрийн давхардалгүй reach тодорхойгүй (дуудлага амжилтгүй эсвэл
  кампанит ажил өөр төрлийн ad set-тэй) бол `results_reach`-ийг тооцохгүй, `spend_reach` л.
- Reach-ийн дуудлага амжилтгүй бол тайлан reach/frequency-гүй бичигдэж анхааруулга
  гарна; дараагийн синк нөхнө.

## Тайлангийн түлхүүрүүд (CSV импорттой ижил гэрээ)

- `spend` (дансны валют), `currency`, `impressions`, `link_clicks` (= `inline_link_clicks`,
  Ads Manager «Link clicks»), `clicks_all` (= `clicks`, «Clicks (all)»),
  `landing_page_views`, `reach`, `frequency`, `cpm`, `cost_per_link_click`, `ctr_link` (%),
  `cost_per_landing_page_view`.
- Төрөл T бүрт `results_T`, `spend_T`, `cost_per_result_T` (= `metaResultCost`).
- Ганц төрөл байвал хуучин `results` / `cost_per_result` (хуучин UI-д, нэг үр дүнгийн
  өртөг — CSV-тэй адил). Ганц төрөл нь reach бол `cost_per_result`-ийг бичихгүй: 1000
  хүний өртөг зөвхөн `cost_per_result_reach`-д.
- Задаргаа: `kind: 'campaign'`, `label` = кампанит ажлын (хамгийн сүүлийн өдрийн) нэр,
  `tag` = үр дүнгийн төрөл, `values`: `spend, impressions, link_clicks, reach` (зөвхөн
  давхардалгүй үед), `results` (tag-ийн нэгжээр), `cost_per_result`. Хүргэлтгүй
  кампанит ажлыг хасаж, зардлаар буурахаар эрэмбэлээд 100 мөр.

## API ба файлын давуу эрх

API тайлан нь **яг ижил долоо хоногийн** (`period_from/period_to`) файл импортыг
зориуд орлоно (upsert, `origin = 'api'`, `file_name`, `content_hash`, `note` хоосон).
Өөр хугацааны (жишээ нь 30 хоногийн) файлын тайланд хүрэхгүй. Үл хамаарах зүйл: тухайн
долоо хоногт API мөргүй бол файлын тайланг хэвээр үлдээнэ (дээрх «Мөргүй долоо хоног»).
Тухайн долоо хоногт файл дахин импортловол дараагийн синк (6 цаг) API-ийн тайлангаар
солино — данс холбогдсон төсөлд Ads Manager экспорт шаардлагагүй.

Мэдэгдэж буй зөрүү (сувгийн тайлангийн track): файлын импортын upsert
(`/api/marketing/channel-reports`) `origin`, `data_from`, `data_to`-г илгээдэггүй тул API
бичсэн долоо хоногт файл импортловол дараагийн синк хүртэл мөр `origin = 'api'` ба API-ийн
хамрах өдрүүдтэй үлдэнэ. Тэр route файл бүрт `origin: 'file'` болон өөрийн
`data_from/data_to` (эсвэл null)-г илгээх ёстой.

## Токен, данс

- `META_ADS_SYSTEM_TOKEN` (зөвхөн сервер, Sensitive, сонголттой/зөвлөмжтэй) тохируулсан
  бол бүх төсөлд хэрэглэгчийн 60 хоногийн токеноос түрүүлж ашиглагдана
  (`metaAdsToken`, `metaAdsTokenSource` → `'system' | 'user' | null`). `/marketing` дээр
  «Системийн хэрэглэгч (хугацаагүй)» гэж харагдана; токен браузерт хэзээ ч очихгүй.
- OAuth холболт: код солилтын дараа `debug_token` (app токеноор) — өөр app-ийн эсвэл
  хүчингүй токеныг татгалзана. `SYSTEM_USER` төрлийн токеныг (Login for Business-ийн
  system-user тохиргоо) урт хугацаат солилтгүй хадгалж, Meta хугацаа заагаагүй бол
  хугацааг NULL (хугацаагүй) болгоно. Шинэ токен сонгосон дансыг уншиж чадвал данс
  хэвээр, үгүй бол дахин сонгуулна.
- Нэг зарын данс зөвхөн нэг төсөлд: `shops_facebook_ad_account_unique` ('act_123' ба
  '123' ижил). Давхар сонговол 409 «Энэ зарын данс өөр төсөлд холбогдсон байна».
  `/api/shop` PATCH зарын данс өөрчлөх боломжгүй болсон (Meta эрхийн шалгалтгүй байсан);
  данс зөвхөн `POST /api/marketing/facebook/ads/accounts`-аар сонгогдоно.
- **System токентой үед данс сонгох нь зөвхөн admin/super_admin-д.** System user бүх
  төслийн зарын дансыг хардаг тул маркетингийн ажилтан өөр төслийн дансыг өөрийн төсөлд
  холбож түүний зардал, кампанит ажлыг харахаас сэргийлнэ: `GET …/ads/accounts` админ бус
  хэрэглэгчид зөвхөн төслийнхөө сонгосон дансыг (сонгоогүй бол 403) буцаана, `POST` нь
  админ бус хэрэглэгчид зөвхөн одоогийн дансаа дахин илгээхийг (кампанит ажил татахын
  өмнө) зөвшөөрнө. Жагсаалтаас өөр төсөлд холбогдсон дансыг хэнд ч харуулахгүй.
  Хэрэглэгчийн OAuth токенд жагсаалт тухайн хүний Meta эрхээр хязгаарлагдах тул өмнөх
  шигээ marketing-roi бичих эрхтэй хэн ч сонгоно.
- Graph v26.0, `appsecret_proof` = HMAC(`META_ADS_APP_SECRET`) тул system user токеныг
  **Vertmon Hub** app-д үүсгэх ёстой.

## Хамгаалалт, хязгаар

- `metaRead` алдааг `MetaApiError` (монгол мессеж + Graph code/subcode/HTTP status)
  болгоно; URL, хариуны бие, токен алдаа/логт орохгүй.
- Түр алдаа (HTTP 429/5xx, Graph code 1, 2, 4, 17, 32, 613, 80000–80014) дээр ихдээ 2 удаа
  (1 сек, 3 сек) дахин оролдоно; Meta хандалтыг минутаар хаасан бол дахин оролдохгүй.
- `x-business-use-case-usage`, `x-fb-ads-insights-throttle` (мөн `x-ad-account-usage`,
  `x-app-usage`) 75%-иас дээш бол логт анхааруулга (ID, токенгүй).
- Өгөгдлийн сангийн түүхий алдааг (жишээ нь statement timeout) хэрэглэгч, `meta_insights_sync`-д
  харуулахгүй — монгол мессеж, эх алдаа зөвхөн серверийн логт.
- Нэг төслийн алдаа бусад төслийн синкийг зогсоохгүй; `meta_insights_sync`-д бичигдэж,
  cron 500 буцаана. Гар товчинд зардлын синк амжилттай, дэлгэрэнгүй нь амжилтгүй бол
  зардал хадгалагдаж, дэлгэрэнгүй алдааг тусад нь харуулна.

## Эзэмшигчийн алхам

1. **Миграци:** production-д `20261005120000_channel_reports_origin.sql`, дараа нь
   `20261005130000_meta_ad_insights.sql`-ийг (зөвшөөрөлтэйгөөр) хэрэглэнэ. Кодыг
   түрүүлж deploy хийвэл зардлын синк хэвийн, дэлгэрэнгүй синк алдаа өгнө.
2. Meta Business Settings → **Accounts → Apps → Add → Connect an app ID** →
   `1422020356521451` (Vertmon Hub)-ийг Vertmon-ийн business portfolio-д холбоно.
3. developers.facebook.com → Vertmon Hub → **Use cases → Add** → «Measure ad performance
   data with Marketing API».
4. Business Settings → **Users → System users → Add** → нэр (жишээ нь «Vertmon Hub sync»),
   үүрэг **Employee**.
5. Тэр system user → **Assign assets** → **Ad accounts** → төсөл бүрийн зарын данс →
   **View performance** эрх.
6. Тэр system user → **Assign assets → Apps** → Vertmon Hub-ийг нэмнэ.
7. **Generate new token** → app: Vertmon Hub → эрх: `ads_read` (+ `business_management`)
   → хугацаа **Never** → Generate.
8. Токеныг Vercel → Project → Settings → Environment Variables → **Production** →
   `META_ADS_SYSTEM_TOKEN`, **Sensitive** гэж хадгална. Токеныг чат, код, баримт бичиг,
   тикетэд хэзээ ч бичихгүй.
9. Production-ийг **Redeploy** хийнэ.
10. **Админ (admin/super_admin) эрхтэй хэрэглэгч** төсөл бүрт (толгойн «Төсөл» сонгуур)
    `/dashboard/marketing-roi` → тухайн төслийн зарын дансыг сонгоно (нэг данс = нэг
    төсөл). System токентой үед бусад хэрэглэгч данс сонгож/сольж чадахгүй.
11. `/marketing` → **«Meta зардал татах»** — «Системийн хэрэглэгч (хугацаагүй)» ба
    «Дэлгэрэнгүй үр дүн … долоо хоногийн тайлан» мөр гарна.
12. Нэг өдрийг Ads Manager-тай (ижил цагийн бүс, валют) тулгана: зардал, impressions,
    link clicks, Results (төрлөөр); хурлын долоо хоногийн reach-ийг Ads Manager-ийн тухайн
    7 хоногийн reach-тэй.

Тэмдэглэл:

- Өөрийн бизнесийн зарын дансны тайланд **App Review шаардлагагүй** (Standard access);
  Advanced access зөвхөн бусдын дансанд эсвэл хязгаар нэмэхэд хэрэгтэй.
- Marketing API **v26.0** ашиглаж байна.
- Facebook хуудас / Instagram-ийн insights ба Lead Ads (маягтын лид) нь тусдаа дараагийн
  ажил — энэ синкт ороогүй.
