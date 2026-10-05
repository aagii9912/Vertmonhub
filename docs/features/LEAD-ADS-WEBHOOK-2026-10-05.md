# Facebook Lead Ads → CRM лид (2026-10-05)

Салбар: `feat/lead-ads-webhook` (`origin/main` 5f9a744 дээр). **Deploy хийгээгүй, production-д юу ч бичээгүй.**

## Юу өөрчлөгдсөн бэ

Өмнө нь Facebook Lead Ads-ийн лид CRM-д огт орж ирдэггүй байсан:

- Meta нэг апп-д **Page-ийн ганц callback URL** зөвшөөрдөг. Энэ нь `/api/webhook` (DM). Тэр route зөвхөн `entry.messaging`-ийг боловсруулж, `entry.changes[field=leadgen]`-ийг 200-аар хүлээн аваад хаядаг байсан.
- Лид хадгалдаг цорын ганц газар `/api/marketing/facebook/leadgen` руу хэзээ ч хүсэлт ирдэггүй байв. Мөн тэр route гарын үсэг шалгалтгүйгээр ажилладаг (fail-open), verify token-ийг `===`-ээр харьцуулдаг, Graph v21.0-д токенийг URL-д `appsecret_proof`-гүй илгээдэг, shop/токен олдохгүй үед чимээгүй 200 буцаадаг байсан.
- Page-ийн webhook subscribe-д `leadgen` талбар, OAuth-д `leads_retrieval` ба `pages_manage_ads` эрх байгаагүй.

Одоо:

1. **`/api/webhook`** нь `leadgen` өөрчлөлтийг Meta-д хариу өгөхөөс **өмнө** хадгалдаг болсон. Хадгалалтыг `src/lib/facebook/leadgen.ts` хийнэ. DM-ийн урсгал хэвээр, `after()`-д хийгдэнэ.
2. Хуучин `/api/marketing/facebook/leadgen` route-ийг **устгасан** (эзэмшигчийн шийдвэр). Callback-ийг андуурч тэр URL-д тохируулбал Meta-гийн баталгаажуулалт 404-өөр шууд унана.
3. Page холбоход `leadgen` талбарыг автоматаар subscribe хийнэ. `leads_retrieval` эрхгүй үед Meta бүх subscribe хүсэлтийг унагадаг. Тиймээс DM-ийн талбаруудыг `leadgen`-гүйгээр дахин subscribe хийж, Lead Ads идэвхгүй гэдгийг тусад нь буцаана. Ингэснээр DM хэзээ ч эвдрэхгүй.
4. Facebook OAuth-д `leads_retrieval`, `pages_manage_ads` эрх нэмсэн.
5. Шинэ хүснэгт **`meta_leadgen_events`** нь leadgen_id бүрийн сүүлийн үр дүнг хадгална. Энд харилцагчийн хувийн мэдээлэл хадгалахгүй.
6. **`/api/marketing/facebook/lead-ads`** нь төлөв харуулах, дахин subscribe хийх, 90 хоногийн лид нөхөх (backfill) үүрэгтэй. /marketing/social → Facebook таб дээр **«Facebook Lead Ads»** карт нэмэгдсэн.

## Урсгал

```
Хэрэглэгч Lead форм бөглөнө
  → Meta POST /api/webhook  (X-Hub-Signature-256; FACEBOOK_APP_SECRET-гүй бол 500, буруу бол 403)
  → entry.changes[field=leadgen] { leadgen_id, page_id, form_id, ad_id, created_time }
  → shops.facebook_page_id = page_id (идэвхтэй shop)
  → ижил leadgen_id-тай лид байвал → давхардал (Graph-аас дахин татахгүй)
  → GET graph.facebook.com/v26.0/{leadgen_id}?fields=… (токен Authorization header-т, appsecret_proof заавал)
  → төсөл: marketing_campaigns (shop + campaign_id) → эс бөгөөс shop-ийн ганц төсөл → эс бөгөөс төсөлгүй
  → insertLeadOnce (client_request_id = sha256("facebook-leadgen:" + leadgen_id) → UUID)
  → lead_attribution_events (шинэ лид бол) + meta_leadgen_events (давхардлаас бусад)
  → бүгд амжилттай/алгассан бол 200, түр алдаа байвал 503 (Meta 36 цаг дахин илгээнэ)
```

- Хадгалах хугацааны хязгаар 15 секунд (`LEADGEN_BUDGET_MS`). Хэтэрсэн лидийг `failed/time_budget` гэж тоолж 503 буцаана. Meta дахин илгээхэд аль хэдийн хадгалсан лидийг давхардлаар таслана.
- Нэг batch-д DM ба leadgen хамт ирээд 503 буцвал Meta DM-ийг ч дахин илгээнэ. Тэдгээрийг `mid`-ээр (`webhook_dedup`) таслана.
- Лидийн талбар: `full_name` / `first_name`+`last_name` → нэр, `*phone*` → утас, `*email*` → имэйл. Бусад асуултын хариу `notes`-д «Lead Ads форм:» гэж хадгалагдана (≤ 2000 тэмдэгт). `source = facebook_ads`, `facebook_campaign_id/adset_id/ad_id` бөглөгдөнө. `created_at` нь Meta-гийн `created_time` болно, тиймээс backfill-ээр орсон лид бодит долоо хоногтоо харагдана.
- `leads_stamp_marketing` trigger кампанийн холбоос (`marketing_campaign_id`, маркетингийн хариуцагч, суваг)-ыг өмнөх шигээ өөрөө тавина.

## Төсөл оноох дүрэм (эзэмшигчийн шийдвэр 2026-10-05)

**Кампани → shop-ийн төсөл:**

1. /marketing дээр Meta campaign ID-тай холбосон акц (`marketing_campaigns.external_campaign_id`) байвал түүний төсөлд онооно.
2. Байхгүй бол Page холбогдсон shop-ийн **ганц төсөлд** онооно (shop = төсөл).
3. Аль нь ч байхгүй бол төсөлгүй хадгалж, админ төсөл онооно.

## Үр дүн ба Meta-д өгөх хариу

| Төлөв | Шалтгаан (`reason`) | Утга | Meta-д |
|---|---|---|---|
| `saved` | — | Лид хадгалагдсан (давхардлыг дахин тэмдэглэхгүй) | 200 |
| `skipped` | `invalid_payload` | leadgen_id / page_id дутуу (хүснэгтэд бичигдэхгүй, зөвхөн тоо) | 200 |
| `skipped` | `page_not_connected` | Page ямар ч идэвхтэй shop-д холбогдоогүй | 200 |
| `skipped` | `token_missing`, `token_invalid` | Page токен байхгүй / хугацаа дууссан (Graph 190) | 200 |
| `skipped` | `app_secret_missing` | `FACEBOOK_APP_SECRET` байхгүй | 200 |
| `skipped` | `permission_missing` | `leads_retrieval` эрх, Leads Access (Graph 10/200-299) | 200 |
| `skipped` | `not_found`, `graph_error` | Лид олдсонгүй (Graph 100) эсвэл хариу зөрүүтэй | 200 |
| `skipped` | `lead_rejected` | DB constraint (22xxx/23xxx) | 200 |
| `failed` | `graph_unavailable` | Сүлжээ, 5xx, 429, rate limit (1, 2, 4, 17, 32, 341, 613, 80xxx) | **503** |
| `failed` | `db_error` | Supabase түр алдаа | **503** |
| `failed` | `time_budget` | 15 секунд хүрэлцээгүй (хүснэгтэд бичигдэхгүй) | **503** |

`skipped` үед 200 буцаадгийн учир: `/api/webhook` удаан хугацаанд алдаа буцаавал Meta DM-ийн хүргэлтийг ч удаашруулж, тасалдуулж болзошгүй. Тохиргоог зассаны дараа **backfill** алдсан лидийг нөхнө. Бүх үр дүн Vercel лог-д `[Leadgen] event` / `[Leadgen] webhook batch` гэж гарна. Лог-д токен, URL, хувийн мэдээлэл бичигдэхгүй.

## Backfill (≤ 90 хоног)

Meta лидийг **90 хоног** л хадгалдаг. Webhook ажиллаагүй үеийн лидийг ингэж нөхнө:

- /marketing/social → Facebook → **«Сүүлийн 90 хоногийн лид татах»**, эсвэл `POST /api/marketing/facebook/lead-ads { "action": "backfill", "days": 1–90 }` (`marketing-roi` бичих эрх).
- Урсгал: `/{page_id}/leadgen_forms` → форм бүрийн `/{form_id}/leads?filtering=[time_created > since]`. Cursor-оор хуудаслана, `paging.next` URL-ыг хэзээ ч дагахгүй. Хадгалалт webhook-тэй ижил `saveMetaLead`-ээр хийгдэнэ, тиймээс дахин ажиллуулахад давхардал үүсэхгүй.
- Хугацааны хязгаар 45 секунд. Дуусаагүй бол `complete: false` болон шалтгаан буцаана. Дахин дарахад үргэлжилнэ.

## Аюулгүй байдал

- Webhook POST fail-closed ажиллана: `FACEBOOK_APP_SECRET` байхгүй бол 500, гарын үсэг буруу эсвэл байхгүй бол 403. Verify GET нь `safeEqual` ашиглана (`verifyWebhook`).
- Graph дуудлага v26.0 хувилбартай. Токен `Authorization: Bearer` header-т явна. `appsecret_proof` (`FACEBOOK_APP_SECRET`) байхгүй бол дуудахгүй.
- `meta_leadgen_events`: RLS асаалттай, зөвхөн `service_role` хандана. Зөвхөн Meta-гийн ID, төлөв, шалтгаан хадгална. CHECK-ээр нэр/утас/имэйл орох боломжгүй.

## Эзэмшигч / админы хийх алхам (дарааллаар)

1. **Migration** `supabase/migrations/20261005160000_meta_leadgen_events.sql`-ийг production-д apply хийнэ (additive, **зөвшөөрөл шаардлагатай**). Код хүснэгтгүй үед ч лидийг хадгална, зөвхөн тэмдэглэл лог-д үлдэнэ.
2. Салбарыг main-д merge хийж deploy хийнэ.
3. **Meta App** (`FACEBOOK_APP_ID`) дээр:
   - App **Live** горимд байх ёстой. Development горимд зөвхөн app-ийн role-той хүмүүсийн лид ирнэ.
   - App Review (Advanced Access) хийлгэнэ: `leads_retrieval`, `pages_manage_ads` (+ одоогийн `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`).
   - Webhooks → **Page** → callback `https://www.vertmon.mn/api/webhook` (DM-тэй ижил) → **`leadgen`** талбарыг subscribe хийнэ.
   - Facebook Login for Business config ашигладаг бол (`FACEBOOK_LOGIN_USE_CONFIG=true`) тэр config-д хоёр эрхийг нэмнэ. Энэ үед `scope` параметрийг Meta үл хэрэгсдэг.
4. **Business Manager → Business settings → Integrations → Leads Access**: хандалтыг хязгаарласан бол «Vertmon Hub» апп-д (CRM) зөвшөөрөл өгнө. Эс бөгөөс webhook ирсэн ч лид уншихад `permission_missing` гарна.
5. Төсөл бүр /marketing/social дээр Facebook Page-ээ **дахин холбоно** (шинэ эрхтэй токен). Картан дээр «Webhook идэвхтэй» гарна. Үгүй бол «Lead Ads идэвхжүүлэх»-ийг дарна.
6. Meta-гийн [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing)-оор туршилтын лид үүсгэж, /dashboard/leads болон картан дээр орж ирснийг шалгана.
7. Тайланд акц, маркетингийн хариуцагч зөв харагдахын тулд /marketing дээр акц бүрийг Meta campaign ID-тай холбоно.
8. Өмнөх 90 хоногийн лидийг «Сүүлийн 90 хоногийн лид татах» товчоор нөхнө.

## Хязгаарлалт / анхаарах зүйл

- `shops.facebook_page_id` UNIQUE тул **нэг Page = нэг shop (төсөл)**. Хоёр төсөл нэг FB Page ашигладаг бол (жишээ нь Mandala Garden ба Tower) тухайн Page-ийн бүх Lead Ads лид холбогдсон shop-д орно. Кампанийн холбоос shop доторх тул нөгөө shop руу чиглүүлэхгүй. Хэрэгтэй бол дараагийн ажил: кампанийн ID-аар shop хооронд чиглүүлэх.
- Meta-гийн баримтад leadgen-д `ads_management` эрхийг ч дурдсан байдаг. Энэ нь зар өөрчлөх эрх тул бид хүсээгүй. Хоёр эрхтэй үед Graph `permission_missing` буцаавал нэмэхийг хэлэлцэнэ.
- Шинэ Lead Ads лид push мэдэгдэл илгээхгүй (өмнөх шигээ). Менежерүүд лидийн жагсаалтаас харна.
- Backfill-ээр өнгөрсөн долоо хоногийн лид орвол тэр долоо хоногийн Лхагва гарагийн тайлангийн тоо өөрчлөгдөнө (`created_at` = Meta-гийн цаг).
- DM илгээх, Page insights, OAuth dialog зэрэг бусад Facebook кодод Graph **v21.0** хэвээр байна (2024-10-д гарсан). Тусад нь шинэчилнэ. Meta хуучирсан хувилбарын дуудлагыг дэмжигдэж буй хамгийн хуучин хувилбар руу автоматаар шилжүүлдэг.

## Файлууд

| Файл | Үүрэг |
|---|---|
| `src/lib/facebook/leadgen.ts` | leadgen → `leads`: webhook ref, Graph v26 унших, төсөл, `saveMetaLead`, `meta_leadgen_events` |
| `src/lib/facebook/leadgen-backfill.ts` | `/{page}/leadgen_forms` → `/{form}/leads` backfill |
| `src/app/api/webhook/route.ts` | leadgen-ийг ACK-аас өмнө хадгалах; 503 = дахин илгээх |
| `src/app/api/marketing/facebook/lead-ads/route.ts` | GET төлөв, POST backfill / subscribe |
| `src/lib/facebook/marketing-api.ts` | `DEFAULT_PAGE_SUBSCRIBE_FIELDS` + `leadgen`, DM-ийг хамгаалсан fallback |
| `src/app/api/auth/facebook/route.ts` | `leads_retrieval`, `pages_manage_ads` эрх |
| `src/components/marketing/LeadAdsCard.tsx` | /marketing/social дээрх карт |
| `supabase/migrations/20261005160000_meta_leadgen_events.sql` | үр дүнгийн хүснэгт |

## Шалгалт

- Unit: `src/lib/facebook/__tests__/{leadgen,leadgen-backfill,subscribe,leadgen-events-sql}.test.ts`, `src/app/api/webhook/__tests__/webhook-leadgen.test.ts`, `src/app/api/marketing/facebook/lead-ads/__tests__/route.test.ts`, `src/app/api/auth/facebook/__tests__/route.test.ts`, `src/components/marketing/LeadAdsCard.test.tsx`.
- Browser: `e2e/lead-ads.spec.ts` (marketing project).
- Production build дээр локал curl хийсэн: verify 200/403, гарын үсэггүй leadgen 403, DB-гүй leadgen 503 `db_error`, дутуу leadgen 200 `invalid_payload`, зөвхөн DM 200, `/api/marketing/facebook/lead-ads` cookie-гүй 401, хуучин route 404.
