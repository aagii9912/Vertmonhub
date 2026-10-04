# Vertmon Hub — AI Assistant аюулгүй байдлын аудит ба засвар

> Ажилтны AI Дата Туслах (LLM-ээр дата унших/бичих) -ийн RBAC хяналтыг чангатгасан.

## Хоёр AI гадаргуу
- **Ажилтны data-assistant** — `/dashboard/ai-assistant` → `/api/ai-assistant` → `src/lib/ai/data-assistant/*`. (Энэ аудитын гол сэдэв.)
- **Харилцагчийн webhook AI** — `/api/webhook` → `AIRouter`/`ToolExecutor`. shop/customer-аар чанд хязгаарлагдсан, signature-тай. Өөрчлөлт хийгээгүй.

## Илрүүлсэн эрсдэлүүд (засварын өмнө)
| # | Эрсдэл | Зэрэг |
|---|---|---|
| 1 | `shopId` body-оос шууд авдаг, validate хийгддэггүй → **өөр shop-ийн дата унших** | 🔴 CRITICAL |
| 2 | Бичих эрхийг зөвхөн `admins.super_admin`-ээр шалгадаг; RBAC `canWrite`/`canDelete` үл тоодог | 🔴 HIGH |
| 3 | AI-аар хийсэн write өөрчлөлтийн **audit лог байхгүй** | 🟠 MEDIUM |
| 4 | ai-assistant модулийн эрх API түвшинд шалгагддаггүй | 🟠 MEDIUM |

## Хийсэн засвар (хэрэгжсэн ✅)
**Хэрэглэгчийн шийдвэр:** RBAC `canWrite`/`canDelete` gating; өргөн read (PII оруулаад) + shop scope + audit.

1. **Shop scoping** (`api/ai-assistant/route.ts`): хүсэлтийн `shopId`-г хэрэглэгчийн эзэмшсэн/гишүүн shop-уудтай тулгана. Эрхгүй бол **403**; өгөгдөөгүй бол хандах эрхтэй эхний shop руу буурна. Conversation-ийг validate хийсэн shop-д хадгална.
2. **RBAC модуль шалгалт**: `ai-assistant` модулийн эрхгүй хэрэглэгчийг **403**-аар блоклоно. Дүрийг `user_roles` → `admins` fallback-аар тодорхойлж, `fetchRolePermissions`-ээр эрхийг авна.
3. **canWrite/canDelete gating** (`lib/ai/data-assistant/index.ts`): write tool-ыг зөвхөн `canWrite`-тэй, delete tool-ыг (одоо байхгүй) зөвхөн `canDelete`-тэй хэрэглэгч ажиллуулна. Tool-уудыг role string биш **эрхээр** идэвхжүүлнэ.
   - Үр дүн: `admin`/`sales_manager`/`marketing`/`finance_manager` (canWrite) → бичиж чадна; delete зөвхөн `canDelete` (одоо admin/super_admin).
4. **Audit лог** (`ai_audit_log` хүснэгт + `logAiAudit`): write/delete tool бүрийг хэн/хэзээ/юу/амжилттай эсэхээр бүртгэнэ.

## Тэмдэглэл
- Read нь өргөн хэвээр (ажилтнууд бүх дата унших) — зөвхөн shop-оор хязгаарлаж, audit нэмсэн. PII маск хийгээгүй (хэрэглэгчийн сонголтоор).
- Delete tool **байхгүй** хэвээр; gate нь ирээдүйн delete tool-д зориулж бэлэн.
- Service-role client хэвээр (DB RLS алгасна) — хамгаалалт нь API түвшинд.

## Хойшлуулсан (сонголтоор)
- Conversation жагсаалтыг shop-оор шүүх (одоо зөвхөн user_id).
- Read үр дүнд PII маск (эрхгүй role-д).
- Human-in-the-loop баталгаажуулалт write-д.
