# «Үнэ, нөхцөл» — хүчинтэй үнэ ба архив (2026-10-22)

Status: implemented on `claude/determined-noether-c2lur4`. No migration — it reads the existing `project_pricing_configs` (migration `20261008120000`, already in production).

## What it is

A new sidebar item «Үнэ, нөхцөл» (`/dashboard/pricing`, Борлуулалт group, module `properties`) with three tabs:

- **Хүчинтэй үнэ** — the project's active approved price: version, source, validity window, who activated it and when, and one row per block × model × floors × payment condition (м² price, first advance %). Each row is compared with the version it replaced: «Өөрчлөгдсөн» with the old value struck through, «Шинэ», and a «Хасагдсан мөр» list. An active version outside its window shows «Эхлээгүй» / «Хугацаа дууссан» with a warning, because `calculatePricing` gives no meeting quote outside the window.
- **Архив** — every replaced version (newest first), each openable with the same view and its own comparison.
- **Засах** — super_admin only: the existing `ProjectPricingSettings` editor for the current project (same as Admin → Төслүүд → «Үнийн нөхцөл»).

## Archiving

Archiving already happens in the database: `save_project_pricing` with `status = 'active'` sets the previous active row to `archived` and inserts the new version in one transaction with an `admin_audit_log` entry. Versions are immutable. The page only reads:

- Only `active` / `archived` rows are listed; drafts never reach the sheet (`GET /api/dashboard/pricing` filters `status IN ('active','archived')`, also for `?version=`).
- «Архивт шилжсэн» = `created_at` of the next activation (the activation that archived it). No extra column.
- Activator names come from `user_profiles.full_name`; account ids never leave the server.

## Access

- `GET /api/dashboard/pricing[?version=N]`: `withRoute({ module: 'properties' })`, then `assertPricingProjectAccess` — a restricted sales manager sees the price only for a project they are registered for (the meeting-conditions rule); admins and org roles are unrestricted.
- Writes stay super_admin only through `PUT /api/admin/pricing` → `save_project_pricing`.

## Code

- `src/lib/sales/pricing-history.ts` — pure: `pricingValidity`, `diffPricingRules` (a rule matches only the same block, model, condition and floor range; Б/B and Е/E are equal), `sortPricingRules`, `withArchiveTimes`, response types.
- `src/lib/sales/pricing-store.ts` — `loadPricingHistory`, `loadPricingSheet`, `assertPricingProjectAccess`.
- `src/app/api/dashboard/pricing/route.ts`, `src/app/dashboard/pricing/page.tsx`, `src/components/pricing/PricingVersionView.tsx`.
