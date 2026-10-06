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

## Лидийн тайлан (`/api/dashboard/reports/leads-summary`, `/dashboard/reports/leads`)
`reports` модуль. Хугацаа (`period=today|week|month|quarter|year` = өнөөдрийг оруулаад 1/7/30/90/365 УБ өдөр, эсвэл `from`/`to` ≤ 367 өдөр) доторх `created_at`-тай БҮХ лидийг (`fetchAllRows`, `applyLeadScope`) тоолно; хариунд шийдсэн `range` буцна.
| Метрик | Тооцоо |
|---|---|
| total, byStatus | хугацаанд бүртгэгдсэн лид, одоогийн төлөвөөр |
| conversion | won = closed_won, lost = closed_lost, open = ACTIVE_STATUSES, inProgress = open − new; хөрвүүлэлт = won / total |
| bySource / byProject / byManager / byCategory | лид ба амжилттай лидийн тоо (`source` хоосон → other; `project_id` → төслийн нэр; `category_id` → UI төслийн ангиллын нэр, архивласан нь «(архив)»; хариуцагчгүй, төсөлгүй, ангилалгүй мөр төгсгөлд). Мөнгөн дүн тооцохгүй — лидийн төсөв гэрээний үнэ биш |
| Экспорт | `/api/dashboard/export/excel?type=leads&from=&to=` (`leads` модуль) — тайлангийн ижил хугацаа, «Ангилал» баганатай |

## Маркетингийн форм lead-ийн ялгаа (чухал)
`POST /api/leads` (Vertmon-ы өөрийн **маркетингийн форм**) нь `shop_id`-гүй lead үүсгэдэг.
Бүх CRM метрик `shop_id`-ээр шүүдэг тул эдгээр lead нь **tenant-ийн CRM юүлүүрт ОРОХГҮЙ** —
зориудаар тусгаарлагдсан. (`/dashboard/leads` нь зөвхөн shop-ийн lead-ийг харуулна.)

## Менежерийн идэвх / KPI (`/api/dashboard/reports/manager-activity`, `/api/dashboard/reports/sales-kpi`)
Дэлгэрэнгүй: [MANAGER-ACTIVITY-KPI-2026-10-04.md](./MANAGER-ACTIVITY-KPI-2026-10-04.md). Нэг loader: `lib/sales/activity-load.ts`.

| Метрик | Эх | Тооцоо |
|---|---|---|
| Дуудлага | lead_activities | `type='call'`, УБ өдрөөр; менежер = `created_by` → `sales_managers.user_id`, эс бөгөөс бүртгэлийн нэртэй яг таарсан `created_by_name` (холбоосгүй бүртгэл). Таараагүй = «оноогдоогүй» |
| Болсон уулзалт / шинэ | property_viewings | `status='completed'`, устгаагүй, `scheduled_at`-ийн УБ өдөр, `sales_manager_name`; шинэ = `meeting_type='new_customer'` |
| Ирээгүй | property_viewings | `status='no_show'` (оноонд орохгүй) |
| Санал хүсэлт: хугацаандаа % | service_logs | Хариуцагч `manager_name`. SLA 24/48/120/240ц (чухлалаар). Үр дүн тодорхой болсон өдөр: хугацаандаа шийдвэрлэсэн бол шийдвэрлэсэн өдөр, эс бөгөөс SLA дууссан өдөр. Хуваагч 0 → null |
| Санал хүсэлт: дундаж цаг | service_logs | `resolved_at − created_at`, хугацаанд шийдвэрлэсэн (resolved/closed) мөрөөр |
| Хэтэрсэн нээлттэй | service_logs | open/in_progress бөгөөд SLA хэтэрсэн (одоогийн байдлаар) |
| Хугацааны зорилт | sales_kpi_months.daily | өдрийн зорилт × Даваа–Баасан (өнөөдрийг хүртэл); зорилтгүй → null |
| KPI «Дуудлага, чат» | sales_kpi_months.manual ?? CRM | гар тоо байвал түүнийг, эс бөгөөс сарын CRM дуудлага (нэмэхгүй) |
| KPI «Санал хүсэлтийг хугацаандаа шийдвэрлэсэн» | service_logs | сарын «хугацаандаа %» |

## Хуучин/устгасан метрик (Phase 5)
- `customers.total_orders`, `total_spent`, `is_vip` — Syncly e-commerce-ийн үлдэгдэл,
  **устгагдсан** (`20260608160000_drop_legacy_ecommerce_columns.sql`).

## Хойшлуулсан (ирээдүйн сайжруулалт)
- **Түүхэн snapshot:** өдөр тутмын метрик snapshot хүснэгт → trend зөрүү ("↑12%").
- **AI analytics UI:** `ai_analytics` хүснэгт цуглуулсан өгөгдлийг dashboard-д харуулах.
- **monthlyViewings rename:** field нэрийг олон файлд солих (одоогоор зөвхөн баримтжуулсан).
