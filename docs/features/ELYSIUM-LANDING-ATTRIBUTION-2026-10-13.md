# Elysium landing page ба суваг — 2026-10-13

Статус: Vertmonhub main-д (2026-10-13), migration `20261013120000` prod-д орж шалгагдсан (2026-10-13).
Elysium-ийн `event_leads.attribution` migration-ийг эзэмшигч Supabase SQL Editor-оор оруулна.
Elysium сайтын тал: `Elyy` репо, `feat/landing-attribution` (migration `20261013120000_event_leads_attribution.sql`).

## Зорилго

Elysium-ийн landing page generator (`elysium.mn/<slug>`) болон үндсэн сайтаас ирсэн лид бүрд:

1. **Аль хуудас**: `landing_page` (`event/<slug>` эсвэл `site`), `landing_page_name`, `landing_page_url`.
2. **Ямар суваг**: `source` — `event` («Өдөрлөг»), `facebook_ads`, `facebook`, `instagram`, `google_ads`, `website`.

## Урсгал

```
Зочин (linkийн utm_*, utm_id, adset_id, ad_id, fbclid, referrer)
  → Elysium sessionStorage (энэ айлчлал) → маягт `attribution`
  → Elysium /api/contact: allow-list + хадгалсан хуудасны зориулалт (pagePurpose), хаяг (pageUrl)
  → Vertmonhub push /api/integrations/elysium/leads  ┐
  → Elysium event_leads.attribution → pull cron       ┴→ elysiumLeadColumns → leads
```

Хүсэлтээс ирсэн хуудасны нэр, зориулалт, хаягт итгэхгүй: Elysium сервер хадгалсан эвентээс авна.
Attribution буруу бол талбар тус бүрээр хаягдана; лид хэзээ ч татгалзагдахгүй.

## Ангиллын дүрэм (`lib/leads/landing-attribution.ts`, `landingLeadSource`)

| Эрэмбэ | Нөхцөл | `source` | Үндэслэл |
|---|---|---|---|
| 1 | `utm_medium` ∈ event/qr/offline/expo/booth/fair эсвэл `utm_source` ∈ event/qr/expo | event | Линкийн UTM |
| 2 | `utm_medium` төлбөртэй (paid_social, cpc…) эсвэл Meta campaign/adset/ad ID | facebook_ads (google → google_ads) | Линкийн UTM |
| 3 | `utm_medium` social/organic… эсвэл `utm_source` fb/ig… | facebook / instagram | Линкийн UTM |
| 4 | `utm_source` толь бичгийн утга (tv, radio, board…) | тэр утга | Линкийн UTM |
| 5 | Meta-ийн referrer эсвэл fbclid, хуудас «Сошиал зар» | facebook_ads | Хуудасны зориулалт |
| 6 | Meta-ийн referrer эсвэл fbclid, бусад хуудас | facebook / instagram | Ирсэн сайт |
| 7 | Хуудасны зориулалт «Эвент» / «Сошиал зар» | event / facebook_ads | Хуудасны зориулалт |
| 8 | Бусад | website | — |

`fbclid` ганцаараа зар гэдгийг батлахгүй (Facebook органик постын линкэд ч нэмдэг). Meta-ийн `utm_id`
(`{{campaign.id}}`) `facebook_campaign_id` болж, `leads_stamp_marketing` trigger `/marketing`-ийн кампанит
ажилтай холбоно (ROI, CPL).

## UI

- Лидийн жагсаалт: «Landing page» шүүлтүүр (`GET /api/dashboard/leads/landing-pages`, `applyLeadScope`), эх
  үүсвэрийн доор landing page-ийн нэр (үндсэн сайтынхыг харуулахгүй).
- Лидийн панел: «Landing page» (линк + зориулалт), «Ирсэн зам» (үндэслэл + UTM/referrer). Хадгалсан `source`
  дүрмийн үр дүнтэй таарахгүй бол «Ирсэн зам» харагдахгүй.
- Elysium админ → хуудас → «Зориулалт ба холбоос»: зориулалт, Meta зарын «URL parameters», эвентийн QR (PNG),
  органик постын линк. `/admin/leads`-д «Ирсэн зам» багана.

## Нэвтрүүлэх дараалал

1. Vertmonhub migration `20261013120000` (`node scripts/apply-migrations.mjs 20261013120000 20261013120000 --apply`).
2. Vertmonhub deploy (хуучин Elysium илгээлт `attribution`-гүй ч ажиллана).
3. Elysium migration (`event_leads.attribution`, Supabase SQL Editor). Байхгүй үед Elysium attribution-гүй хадгална.
4. Elysium deploy. Админд хуудас бүрийн «Зориулалт»-ыг сонгоно.
5. Өмнөх лид: `PROJECT_ID=<Elysium төсөл> npx tsx scripts/backfill-elysium-landing-pages.ts` (dry-run), зөвшөөрлийн
   дараа `--apply`. Тэмдэглэлээс хуудсыг сэргээж, «Вэбсайт» лидийн эх үүсвэрийг зөвхөн хуудасны зориулалтаар солино.
