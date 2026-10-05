# Facebook Page / Instagram insights — Graph v26 (2026-10-05)

**Төлөв (2026-10-05):** код `feat/meta-page-insights-v26` branch дээр (`feat/meta-insights` дээр
суурилсан), production-д **deploy хийгдээгүй**. Миграци `20261005150000_social_page_insights.sql`
production-д **хэрэглээгүй** — эзэмшигчийн зөвшөөрөл хүлээж байна. Production-д 2026-10-05-ны
байдлаар аль ч төсөлд Facebook Page, Instagram холбогдоогүй (3 төсөл, `facebook_page_id` бүгд
NULL); хуучин `social_insights`-д 2026-06-10…07-21-ний 164 мөр бий, бүгд `raw = {}`,
`impressions = 0`. `social_posts` хоосон.

## Юу өөрчлөгдсөн бэ

| Асуудал (review 2026-10-05) | Шийдэл |
|---|---|
| Page/IG дуудлага Graph **v21** (2027-01-21-нд дуусна), зар **v26** | Бүх Page/IG унших, нийтлэх, webhook subscribe, OAuth (dialog, token солих, `me/accounts`) **v26** (`META_GRAPH_VERSION`, `lib/facebook/daily-spend.ts`). |
| `access_token` URL-д, `appsecret_proof` байхгүй | `pageRead`/`pagePost` (`lib/facebook/page-graph.ts`): токен зөвхөн `Authorization` толгойд, `appsecret_proof` = `FACEBOOK_APP_SECRET`-ийн HMAC (`messenger.ts`-ийн `appsecretProof`, trim хийнэ). Нууц түлхүүргүй бол Graph руу дуудахгүй (fail-closed). Зарын `metaRead` нь `META_ADS_APP_SECRET`-ээр хэвээр. Нэг цөм (`graphRead`): түр алдаанд 2 удаа дахин оролдоно, URL/хариу/токен лог руу орохгүй. Нийтлэл (POST) дахин оролдохгүй. |
| Хасагдсан метрик (`page_impressions_unique`, `post_impressions_unique`, IG `impressions`, `plays`, `profile_views`) | Шинэ метрик (доорх хүснэгт), каталог `lib/marketing/social-metrics.ts`. |
| OAuth `read_insights` хүсдэггүй | Page урсгалын scope-д `read_insights` нэмсэн. Callback олгосон эрхийг (`me/permissions`) хадгалж, сонгох цонхонд дутуу эрхийг анхааруулна. |
| Байхгүй метрикийг 0 гэж бичдэг | Meta-гийн өгөөгүй утга **мөргүй** (`social_insights_daily`) эсвэл **NULL** (`social_posts.likes/comments/reach`, API хариу). UI «—» харуулна. |
| 6 цаг тутмын нэг snapshot | **Огноогоор түлхүүрлэсэн** өдрийн мөр (Page) ба нийтлэлийн насан туршийн утга өдрөөр (нийтлэл). |
| Нийтлэлийн insights татагдаад хадгалагддаггүй | `social_insights_daily` (`object_type = 'post'`) + `social_posts.reach`. |
| Page/user токен браузераар дамждаг (`fb_pages` cookie, `/pages` POST токен буцаадаг, client `/api/shop` PATCH-аар токен илгээдэг) | Сонголт **бүхэлдээ серверт** (доор). `/api/shop` PATCH Facebook/Instagram талбар хүлээж авахгүй (400). Хуучин `fb_pages`/`ig_accounts` cookie-г дараагийн холболтоор арилгана. |

## Метрикүүд

Page-ийн өдрийн метрик (`/{page-id}/insights?period=day`):

| Метрик | Монгол нэр | Хугацааны дүн |
|---|---|---|
| `page_media_view` | Үзэлт (`page_impressions`-ийн оронд) | нийлбэр |
| `page_total_media_view_unique` | Үзсэн хүн (`page_impressions_unique`-ийн оронд) | **нэмэхгүй** — сүүлийн өдөр |
| `page_post_engagements` | Нийтлэлийн оролцоо | нийлбэр |
| `page_follows` | Дагагч (`page_fans`-ийн оронд) | сүүлийн өдөр |
| `page_daily_follows_unique` | Шинэ дагагч | нийлбэр |
| `page_views_total` | Хуудас үзсэн | нийлбэр |
| `page_total_actions` | Товч, холбоос дарсан | нийлбэр |
| `page_video_views` | Видео үзэлт | нийлбэр |

Нийтлэлийн насан туршийн метрик (`/{page-id}/posts?fields=…,insights.metric(…)`):
`post_media_view` (үзэлт), `post_total_media_view_unique` (үзсэн хүн), `post_clicks`,
`post_reactions_by_type_total` (төрлөөрх задаргаа `breakdown`-д, `value` = нийлбэр).

Instagram аккаунт (`metric_type=total_value`, `period=day`, since/until хугацаагаар; live):
`views`, `reach`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`,
`saves`, `profile_links_taps`, `follows_and_unfollows` (`breakdown=follow_type`: FOLLOWER =
дагасан, NON_FOLLOWER = болисон). Instagram media: `views` (`plays`/`impressions`-ийн оронд),
`reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`.

Нэг хүчингүй метрик (Graph code 100) бүх дуудлагыг унагадаг тул тэр үед метрик бүрийг тусад нь
оролдож, Meta-гийн өгөөгүйг «байхгүй» (`unavailable`) гэж тэмдэглэнэ. Эрх (10/200), токен (190),
хурдны хязгаарын алдаанд метрик бүрээр давтахгүй — шууд алдаа. Нийтлэлийн жагсаалтыг insights-ийн
эрхгүй үед insights-гүйгээр буцаана. Page-ийн `fan_count` талбар хасагдвал түүнгүйгээр дахин уншина.

### Өдөр гэж юу вэ

Meta-гийн Page/IG өдрийн insights **Номхон далайн цагаар (America/Los_Angeles)** тасардаг: өдөр D-ийн
утгын `end_time` = D+1-ийн 00:00 PT. Тиймээс `day` = (`end_time` − 1 мс)-ийн PT огноо
(`metaInsightDay`) — Улаанбаатарын өдөр **биш**. Зөвхөн дууссан өдрийг (PT өнөөдрөөс өмнөх) хадгална.
Нийтлэлийн насан туршийн мөрийн `day` нь хадгалсан **Улаанбаатарын** өдөр (`ubDateStr`) — тухайн
өдрийн байдлаарх нийт. `page_total_media_view_unique`, IG `reach`, `accounts_engaged` нь
давхардалгүй хүн тул өдрүүдээр нэмж болохгүй (`summarizeDaily` сүүлийн өдрийг өгнө).

## Синк

`syncShopSocial` (`lib/marketing/socialSync.ts`) — cron `/api/cron/social-insights-sync`
(6 цаг тутам, `30 */6 * * *`) ба `/dashboard/marketing-roi`-ийн «Хадгалах» товч
(`POST /api/dashboard/marketing/sync-social`):

1. `social_insights_sync`-д оролдлогыг тэмдэглэнэ.
2. Page-ийн сүүлийн **30 дууссан PT өдөр**-ийг (`SOCIAL_SYNC_DAYS`) нэг дуудлагаар татаж
   `social_insights_daily`-д (shop, platform, object_type, object_id, day, metric)-ээр upsert.
   Meta сүүлийн өдрүүдийг засдаг тул цонхыг бүтнээр нь дахин бичнэ; өгөөгүй метрикийн хуучин
   мөр устахгүй.
3. Сүүлийн 25 нийтлэл: `social_posts` (shop, platform, external_post_id)-аар upsert (`reach` =
   `post_total_media_view_unique` эсвэл NULL), насан туршийн метрикийг өнөөдрийн мөр болгоно.
   Өөр Page-ийн ID-тай нийтлэлийг алгасна.
4. `social_insights_sync`: `last_success_at`/`last_from`/`last_to` (Page-ийн алхам амжилттай
   бол л), Meta-гийн өгөөгүй метрик, монгол алдааны мессеж (URL/токенгүй), мөрийн тоо.

Алхам бүр бие даасан: Page insights эрхгүй ч нийтлэлүүд хадгалагдана (`status = 'partial'`).
Хуучин `social_insights` хүснэгтэд цаашид бичихгүй (хүснэгт хэвээр, устгах нь тусдаа зөвшөөрөл).

### Уншдаг газрууд

| Газар | Юу |
|---|---|
| `GET /api/dashboard/marketing/social-history` | Хадгалсан нийтлэлүүд, одоо холбогдсон Page-ийн сүүлийн 28 өдрийн дүн (`last_to` хүртэл), синкийн төлөв. `/dashboard/marketing-roi` → «Органик сошиал». |
| `GET /api/marketing/facebook/insights?days=7\|28` | Live: сүүлийн 7/28 дууссан өдөр, метрик бүрийн дүн + өдрийн цуваа, `unavailable`. `/marketing/social` → «Хуудасны үзүүлэлт». Эрхгүй бол `permission_required`. |
| `GET /api/marketing/facebook/posts` | Live нийтлэл + `insights.views/viewers/clicks/reactions` (null боломжтой). |
| `GET /api/marketing/instagram?period=day\|week\|days_28` | Live IG аккаунт, хугацааны дүн (`insights`), нийтлэлүүд (`media_insights=1` үед media insights). |

Эдгээр route бүгд `withRoute({ module: 'marketing-roi' })` — төслийг `x-shop-id`-аар шалгана
(хуучин `?shop_id=` параметрийг үл тооно).

## Page / Instagram холболт (серверт)

`lib/facebook/page-connect.ts`:

1. **Эхлэл** `GET /api/auth/facebook?shop_id=…` (Instagram: `/api/auth/instagram?shop_id=…`) —
   `marketing-roi` бичих эрх, төслийн гишүүнчлэл; state + хэрэглэгч + төслийг httpOnly cookie
   (`fb_oauth`/`ig_oauth`, зөвхөн callback зам, 10 минут)-д холбоно. Dialog `v26.0`.
2. **Callback** — state-ийг `timingSafeEqual`-аар, хэрэглэгч ба төслийг дахин тулгана. Code-ийг
   **POST** биеэр long-lived user токен болгож, `me/accounts` (Instagram урсгалд
   `instagram_business_account`-тай Page л) ба `me/permissions`-ийг уншина.
   `meta_page_connect_pending`-д (хэрэглэгч × төсөл × урсгал) **шифрлэгдсэн** user токен
   (`enc:v1:`), токенгүй Page жагсаалт, олгосон эрх, 30 минутын хугацаатай хадгална. Redirect,
   cookie-д токен байхгүй.
3. **Жагсаалт** `GET /api/auth/facebook/pages` (`/api/auth/instagram/accounts`) — id, нэр, ангилал,
   IG нэр, `missing_permissions` (Page: `pages_read_engagement`, `read_insights`; IG:
   `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`).
4. **Сонголт** `POST` `{ pageId }` — Page жагсаалтад байгааг шалгаж, Page токеныг Graph-аас
   (`/{page-id}?fields=access_token`) шинээр авч шифрлээд shop-д хадгална, pending мөрийг
   устгана. Facebook урсгал Page-ийг DM webhook-д subscribe хийнэ. Хариунд токен байхгүй.

`/api/shop/disconnect` нь Page/IG талбарууд, хуучин урсгалын хэрэглэгчийн токен
(`facebook_user_access_token`), хугацаа, дуусаагүй pending мөрийг цэвэрлэнэ. Хэрэглэгчийн
токеныг shop-д цаашид хадгалахгүй (уншдаг код байхгүй; зар нь `meta_ads_user_access_token`
эсвэл `META_ADS_SYSTEM_TOKEN`).

## Миграци (зөвшөөрөл хүлээж байна)

`supabase/migrations/20261005150000_social_page_insights.sql` — additive, дахин ажиллуулж болно:

- `social_insights_daily` — PK (shop_id, platform, object_type, object_id, day, metric); `value`
  NOT NULL (байхгүй утга = мөргүй), `breakdown` jsonb; индекс (shop, platform, page, type, day).
- `social_insights_sync` — PK (shop_id, platform, page_id).
- `social_posts_external_key` — UNIQUE (shop_id, platform, external_post_id). Production-д
  `social_posts` хоосон тул давхардал үүсэхгүй; ID-гүй (гараар) нийтлэл хэд ч байж болно.
- `meta_page_connect_pending` — PK (user_id, shop_id, flow); `user_token LIKE 'enc:v1:%'`.
- Гурвуулаа RLS асаалттай, `anon`/`authenticated`-аас REVOKE, зөвхөн `service_role`.
- `social_insights`-д тайлбар (хуучин) нэмнэ; өгөгдөлд хүрэхгүй.

Тест: `src/lib/marketing/__tests__/social-insights-sql.test.ts` (PGlite, Supabase-ийн анхдагч эрхтэй).
Хэрэглэх: CLAUDE.md-ийн дагуу node + `pg`, нэг файл нэг transaction,
`supabase_migrations.schema_migrations`-д бүртгэнэ. **Миграцийг код deploy-оос өмнө** хэрэглэнэ
(эс бөгөөс Page холболт ба синк хүснэгтгүй алдаа өгнө).

## Эзэмшигчийн алхмууд

1. Миграцийг зөвшөөрч production-д хэрэглэх.
2. Meta App (`FACEBOOK_APP_ID`) → App Review: **`read_insights`** (Page insights) Advanced
   Access; Instagram insights-д `instagram_manage_insights`. Development горимд App Role-той
   хэрэглэгчид шууд олгогдоно.
3. `FACEBOOK_LOGIN_USE_CONFIG=true` ашигладаг бол Facebook Login for Business-ийн
   Configuration-д `read_insights`-ийг нэмэх (тэр үед `scope` параметрийг Meta үл тооно).
4. Valid OAuth Redirect URIs: `https://www.vertmon.mn/api/auth/facebook/callback`,
   `https://www.vertmon.mn/api/auth/instagram/callback`.
5. Төсөл бүрт `/marketing/social` → «Facebook-ээр холбох» → Page сонгох (хуучин холболт v21
   урсгалаар хийгдсэн тул `read_insights`-гүй — **дахин холбох шаардлагатай**).
6. `/dashboard/marketing-roi` → «Органик сошиал» → «Хадгалах» (эсвэл 6 цагийн cron-ыг хүлээх).

## Хамрах хүрээнээс гадуур (дараагийн ажил)

- ~~Graph v21: DM илгээх, харилцагчийн профайл, Lead Ads~~ — `feat/meta-graph-v26-send`
  (2026-10-05) дээр v26 болсон: `messenger.ts` (`me/messages`, 429/5xx/сүлжээний алдаанд 3 хүртэл
  оролдлого хэвээр), `WebhookService.ts` профайл ба `api/marketing/facebook/leadgen` нь `pageRead`.
  Токен толгойд, `appsecret_proof` заавал (`FACEBOOK_APP_SECRET`-гүй бол Graph-д хандахгүй),
  алдаа/лог-д зөвхөн HTTP статус ба Graph code. v22–v26 changelog-д эдгээр endpoint-ийн талбар
  өөрчлөгдөөгүй (message tag `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE`
  2026-04-27-нөөс хаагдсан — бид tag хэрэглэдэггүй).
- Graph **v21** хэвээр, токен URL-д: `lib/marketing/meta-capi.ts` (Conversions API, өөр токен).
- Instagram аккаунтын insights-ийг өдрөөр хадгалах (одоо live л). Хүснэгт `platform =
  'instagram'`-ийг аль хэдийн зөвшөөрнө.
- Instagram сонголт Page-ийг DM webhook-д subscribe хийхгүй (өмнө нь Instagram холболт огт
  дуусдаггүй байсан — `ig_accounts` cookie-г уншдаг код байгаагүй).
- Хуучин `social_insights` хүснэгтийг устгах (тусдаа зөвшөөрөлтэй миграци).
