# Vertmon Hub — Метрикийн лавлах (Metrics Reference)

> Дашбоард дахь тоолуур/метрик бүрийн эх сурвалж, тооцоолол. Phase 5-д цэгцэлсэн.
> Бүх метрик `shop_id`-ээр хязгаарлагдсан (нэг компанийн дундын shop).

## CRM үндсэн (`/api/dashboard/stats`)
| Метрик | Эх хүснэгт | Тооцоо |
|---|---|---|
| totalProperties | properties | COUNT(shop_id) |
| totalLeads | leads | COUNT(shop_id) |
| monthlyViewings | property_viewings | сонгосон **хугацааны** (today/week/month) COUNT — *календарийн сар биш*. Нэр түүхэн шалтгаанаар үлдсэн; UI дээр сонгосон хугацааг харуулна |
| pendingContracts | property_contracts | COUNT(status='pending') |
| totalCustomers | customers | COUNT(shop_id) |

## Харилцагчийн сангийн эрүүл мэнд (`/api/dashboard/customer-health`) — Phase 5 шинэ
| Метрик | Эх | Тооцоо |
|---|---|---|
| total | customers | COUNT(shop_id) |
| newThisMonth | customers | created_at >= сарын эхэн |
| dormant | customers | lifecycle_stage='dormant' |
| avgQualityScore | customers | AVG(quality_score) |
| tiers A/B/C | customers | quality_tier-ийн хуваарилалт |
| needFollowup | customers | next_followup_at <= now (Phase 3 автоматжуулалт) |
| avgDaysToConvert | leads | AVG(converted_at − created_at), өдрөөр |

## Чанарын оноо / lifecycle (Phase 3)
- Оноо 0-100: recency(25)+engagement(20)+funnel(30)+viewing(15)+intent(10).
  Жинг `src/lib/config/scoring.ts`-д тохируулна. Логик: `CustomerScoringService.computeScore`.
- lifecycle_stage: prospect→engaged→qualified→viewing→negotiating→won/lost, идэвхгүй бол dormant.
- `/api/dashboard/customers/recompute-scores` (гар/cron) онооg шинэчилнэ.

## Борлуулалтын юүлүүр (leads)
| Метрик | Тэмдэглэл |
|---|---|
| new / in-progress / closed_won / closed_lost | leads.status-аар |
| conversionRate | closed_won / нийт |
| by-source | leads.source |
| **Юүлүүрийн холбоос (Phase 4)** | lead `closed_won` → `property_contracts` (lead_id) автоматаар үүснэ (trigger) |

## Маркетингийн форм lead-ийн ялгаа (чухал)
`POST /api/leads` (Vertmon-ы өөрийн **маркетингийн форм**) нь `shop_id`-гүй lead үүсгэдэг.
Бүх CRM метрик `shop_id`-ээр шүүдэг тул эдгээр lead нь **tenant-ийн CRM юүлүүрт ОРОХГҮЙ** —
зориудаар тусгаарлагдсан. (`/dashboard/leads` нь зөвхөн shop-ийн lead-ийг харуулна.)

## Хуучин/устгасан метрик (Phase 5)
- `customers.total_orders`, `total_spent`, `is_vip` — Syncly e-commerce-ийн үлдэгдэл,
  **устгагдсан** (`20260608160000_drop_legacy_ecommerce_columns.sql`).

## Хойшлуулсан (ирээдүйн сайжруулалт)
- **Түүхэн snapshot:** өдөр тутмын метрик snapshot хүснэгт → trend зөрүү ("↑12%").
- **AI analytics UI:** `ai_analytics` хүснэгт цуглуулсан өгөгдлийг dashboard-д харуулах.
- **monthlyViewings rename:** field нэрийг олон файлд солих (одоогоор зөвхөн баримтжуулсан).
