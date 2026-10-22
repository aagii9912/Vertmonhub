# «Үнэ, нөхцөл» — хүчинтэй үнэ ба архив (2026-10-22)

Status: implemented on `claude/determined-noether-c2lur4`. No migration — it reads the existing `project_pricing_configs` (migration `20261008120000`, already in production).

## What it is

A new sidebar item «Үнэ, нөхцөл» (`/dashboard/pricing`, Борлуулалт group, module `properties`) with three tabs:

- **Хүчинтэй үнэ** — the project's active approved price: version, source, validity window, who activated it and when, and one row per block × model × floors × payment condition (м² price, first advance %). Each row is compared with the version it replaced: «Өөрчлөгдсөн» with the old value struck through, «Шинэ», and a «Хасагдсан мөр» list. An active version outside its window shows «Эхлээгүй» / «Хугацаа дууссан» with a warning, because `calculatePricing` gives no meeting quote outside the window.
- **Архив** — every replaced version (newest first), each openable with the same view and its own comparison.
- **Засах** — super_admin only: the existing `ProjectPricingSettings` editor for the current project (same as Admin → Төслүүд → «Үнийн нөхцөл»).

## Excel import (price-list files)

«Засах» → «Excel-ээс оруулах» (super_admin) reads the approved price-list files («… блокийн үнийн санал», .xlsx/.csv, 5 MB, several at once) and puts the rules into the editor. It saves nothing: the admin reviews, saves a draft or activates through the usual `save_project_pricing` flow.

- `POST /api/admin/pricing/import` (settings write + super_admin) reads the grid with `readWorkbookGrids` (`lib/utils/xlsx.ts`: visible sheets, Excel row numbers, cached formula results) and returns a preview from `parsePricingWorkbook` (`lib/sales/pricing-import.ts`, pure). Hidden sheets and sheets without a «Давхар» + «Загвар» header are listed as skipped.
- Per sheet: the header row (a second header row with the condition labels is supported), the floor-range column («3-4 давхар» wins over a floor code «03 f»), the model column(s) — when there are two (Б1: «E1…» and «A…E») the admin chooses the one the inventory uses —, every condition column («10-30%», «30%», a percent-formatted 0.3) and the «Ашиглалтад орсны дараах үнэ» list price (`Ашиглалтад орсны дараа`, off by default). Block from the title («B1 блокийн» → «Б1»), validity from «… хүртэл хүчинтэй» (shown only; the admin types the window), kind residential/service from the title.
- An empty price cell means the condition is not offered there (Б1 E1/E5/E6 have no 50%). «Зоорийн давхар» rows are reported and skipped: rules need a 1–200 floor number. Invalid prices are reported with their row.
- The first advance is never derived from a label: the admin enters it once per condition (empty → draft only; activation still requires it).
- Applying replaces the editor rows of the imported blocks (Б/B equal) and keeps other blocks; the source is filled with the file names when empty. Overlapping floor ranges and the 500-rule limit block the apply.

The price sheet shows the rules in the price-list layout (`pivotPricingRows`): one row per block × model × floors, one column per condition (header shows the advance when it is the same for the whole column), with a block filter.

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
- `src/lib/sales/pricing-import.ts` — pure price-list parser and rule builder; `src/app/api/admin/pricing/import/route.ts`; `src/components/admin/PricingImportPanel.tsx`.
- `src/app/api/dashboard/pricing/route.ts`, `src/app/dashboard/pricing/page.tsx`, `src/components/pricing/PricingVersionView.tsx`.
