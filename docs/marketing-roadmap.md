# Vertmon Hub — Маркетинг Хэсгийн Аудит ба Сайжруулалтын Замын Зураг

> **Төлөв:** Phase 1 (Tracking суурь), Phase 2 (жинхэнэ ROI + FB Lead Ads), Phase 3 (organic
> social хадгалалт + навигацийн нэгтгэл) хэрэгжсэн. Phase 4 хүлээгдэж буй.
> *(UI-ийн бүрэн физик нэгтгэл — `/marketing/*` хуудсуудыг `/dashboard` доор зөөх — нь том
> бүтцийн refactor тул дараагийн алхамд үлдээв; одоо навигацийг нэг dashboard sidebar-аас
> хүрдэг болгосон.)*
> **Хамрах гол чиглэлүүд:** (1) Pixel & tracking, (2) ROI/attribution засах, (3) хоёр UI-г нэг hub
> болгон нэгтгэх + organic social analytics-ийг хадгалах.
> *(Email/SMS broadcast одоохондоо хойшлуулсан.)*

---

## Context (Яагаад)

CRM (5 фаз) ба ERP (4 фаз) дууссан. Одоо **маркетинг** хэсгийг аудитлаж сайжруулна. Аудитаар
**гол асуудлууд** илрэв:

1. **ROI огт тооцоологддоггүй.** `dashboard/marketing-roi/page.tsx:157-193` нь lead-ийн тоо/хөрвөлтийг
   л гаргадаг; **ad spend (`ad_campaigns`)-ыг lead (`facebook_campaign_id ↔ ad_campaigns.external_id`)
   болон орлого (`leads.conversion_value` / `property_contracts`)-той хэзээ ч холбодоггүй** → CPL/CPA/ROAS
   байхгүй.
2. **Хоёр зэрэгцээ маркетингийн UI.** `dashboard/marketing-roi` (ажилладаг FB/IG ads sync, organic post)
   ба `src/app/marketing/*` (campaigns/social/ads/messaging/calendar/analytics/brand/sources — өөрийн
   layout-тай) — ихэнх нь **хүснэгттэй ч backend холболтгүй бүрхүүл**.
3. **Pixel/GA/CAPI байхгүй.** `fbq`/`gtag` ороогүй; client-side UTM/fbclid барих утил байхгүй —
   attribution зөвхөн гараар URL-д параметр зөөвөл л ажилладаг. Public форм нь энэ repo-д frontend-гүй
   (гадна embed), зөвхөн `api/leads` backend.
4. **FB Lead Ads sync байхгүй** — Facebook-ийн өөрийн lead form-ууд `leads`-д ордоггүй (нэг чиглэлт).
5. **Organic posts/insights хадгалагддаггүй** — `getPagePosts`/`getPageInsights` live татдаг, `social_posts`
   хүснэгт хоосон, түүх/trend алга.
6. **Цэвэрлэх:** transactional email темплейтүүд хуучин e-commerce (`order/payment/shipping`);
   `channel_contracts` нь `shop_id`-гүй; FB token plaintext, refresh байхгүй.

**Дахин ашиглах загвар/хэрэгслүүд:**
- Facebook Graph wrapper: `src/lib/facebook/marketing-api.ts` (v21.0).
- Ads sync API: `api/marketing/facebook/ads/{accounts,campaigns,insights}` (`ad_campaigns` upsert).
- Organic: `api/marketing/facebook/{posts,publish,insights}`, `api/marketing/instagram`.
- Attribution: `leads.{fbclid,utm_*,facebook_campaign_id}` (`20260503110000`), `ad_campaigns.external_id`;
  орлого: `property_contracts.{lead_id,total_price}` + `leads.conversion_value`.
- Хүснэгтүүд: `20260317100000_add_marketing_tables.sql`, `marketing_channels`/`channel_contracts`.
- Root layout `src/app/layout.tsx`; public форм `api/leads/route.ts`; cron infra + `CRON_SECRET`;
  RBAC модуль `marketing-roi`; StatBar/FilterBar UI.

---

## Маркетинг Замын Зураг (Фазууд)

### Phase 1 — Tracking-ийн суурь: Meta Pixel + GA4 + Conversions API + client attribution 🔴 ЭХНИЙ
**Зорилго:** маркетингийн өгөгдлийн суурийг тавих — top-of-funnel хэмжигдэхүйц болгох.
1. **Pixel/GA4 script** `src/app/layout.tsx`-д Next `<Script>`-ээр (env: `NEXT_PUBLIC_FACEBOOK_PIXEL_ID`,
   `NEXT_PUBLIC_GA4_ID`). Тохируулаагүй бол рендэр хийхгүй. PageView автомат.
2. **Client-side attribution утил** (`src/lib/marketing/attribution.ts` + `MarketingAttribution`
   client component): эхний зочлолтод URL-аас `fbclid`/`utm_*`-ийг cookie-д 90 хоног хадгалж, форм
   илгээлтэд хавсаргах боломжтой болгоно.
3. **Meta Conversions API (server-side)** (`src/lib/marketing/meta-capi.ts`): lead үүсэхэд (`/api/leads`)
   Meta-руу hashed PII (phone/email) + `fbc`(fbclid-аас) + IP/UA-тай `Lead` server event илгээж,
   iOS/cookie алдагдлыг нөхнө. `event_id`-аар browser pixel-тэй dedup. Best-effort (алдаа тасалдуулахгүй).
   Env: `META_CAPI_ACCESS_TOKEN`.

Шинэ файлууд: `lib/marketing/attribution.ts`, `lib/marketing/meta-capi.ts`,
`components/marketing/AnalyticsScripts.tsx`, `components/marketing/MarketingAttribution.tsx`,
`layout.tsx` засвар, `api/leads/route.ts` (CAPI дуудлага).

### Phase 2 — Жинхэнэ ROI & attribution + FB Lead Ads sync
spend ↔ lead ↔ орлогыг холбож CPL/CPA/ROAS; `leads.facebook_campaign_id ↔ ad_campaigns.external_id`
нэгтгэл; dashboard-д ROAS багана; FB Lead Ads webhook + cron (FB lead-ийг `leads`-д оруулах);
insights өдөр тутмын cron. Файлууд: `api/dashboard/marketing-roi/route.ts`,
`api/marketing/facebook/leadgen/route.ts`, `api/cron/ads-insights-sync/route.ts`.

### Phase 3 — Нэг Marketing hub болгон нэгтгэх + organic social analytics
`src/app/marketing/*` ба `dashboard/marketing-roi`-г нэг `dashboard/marketing/*` доор нэгтгэх, хуучин
route redirect; organic post-ыг `social_posts`-д, insights-ийг `social_insights` (шинэ) хүснэгтэд
хадгалж trend; үхмэл бүрхүүлийг (messaging/brand/web-analytics) цэгцлэх.

### Phase 4 — Бэхжүүлэлт ба цэвэрлэгээ
`lead_attribution_events` (multi-touch); FB token encrypt + refresh; `channel_contracts`-д `shop_id`;
хуучин e-commerce email темплейт цэвэрлэх.

---

## Хойшлуулсан
Email/SMS broadcast (ESP/SMS provider + сегментаци); Google Ads интеграц; контент авто-нийтлэл;
audience/retargeting + A/B тест; судалгааны public хуваарилалт.

---

## Баталгаажуулалт (фаз тус бүрд)
- Ерөнхий: `npm run typecheck && npm run build && npm run test`; UI Монгол; API `getUserShop`+RBAC.
- **P1:** Pixel/GA debug-аар PageView/Lead галлах; UTM линкээр орж attribution cookie хадгалагдах;
  CAPI `Lead` event Meta Events Manager-т ирэх (env тохируулсан үед).
- **P2:** FB campaign-тай lead → CPL/CPA/ROAS зөв; FB Lead Ads test → `leads`-д ирэх.
- **P3:** Нэг hub-аас бүх хэсэг нээгдэх, хуучин route redirect; sync дараа `social_posts`/`social_insights`
  дүүрч trend.
- **P4:** token шифрлэгдсэн; `channel_contracts` shop-оор шүүгдэх; email темплейт зөв контексттэй.

## Эрсдэл / тэмдэглэл
- Pixel + CAPI давхар event-д нэг `event_id` ашиглаж Meta deduplication хийнэ.
- Lead Ads webhook-д `leads_retrieval`/App Review шаардаж болзошгүй — cron pull fallback бэлд.
- Нэгтгэлд хуучин `/app/marketing` холбоосуудыг redirect-ээр таслахгүй; алхам алхмаар.
- Pixel/GA нь app дотоод хуудсанд ч ачаалагдана (env-gated) — хүсвэл зөвхөн public хуудсаар хязгаарлаж болно.
- multi-tenant биш — нэг компанийн нэг дундын shop.
