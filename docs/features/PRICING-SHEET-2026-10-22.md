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

## Price lists (2026-11-27)

Owner decision 2026-11-27: one project can have several price lists, because Mandala Garden's approved price (201–202, valid 2026-11-01 – 2027-02-28) and the Forest Garden special price (503, valid to 2026-12-31) have different validity windows. Migration `20261127120000_project_price_lists.sql` (apply before deploying this code).

- `project_pricing_configs` gains `list_key` (`^[a-z0-9-]{1,40}$`, default `main`), `list_name` (default «Үндсэн үнэ») and `archived_at`. Versions are numbered per list (`UNIQUE (shop_id, list_key, version)`), one active version per list. Existing rows are the default list; a project with one list looks and behaves as before (no list chooser).
- `save_project_price_list(shop, actor, list_key, list_name, expected_version, status, config)` replaces `save_project_pricing` (kept as a wrapper for the default list). `expected_version` is the list's own latest version (0 for a new list). A list is known by the name of its latest version; two lists of a project never share a name (`23505`); at most 20 lists.
- Activation refuses a price that another active list already gives: same block, model and condition, overlapping floors and overlapping validity windows (`23P01`; `priceListConflict` names the other list and the row before the RPC is called). Lists therefore differ by block, or by period for the same block (special price until a day, the regular price after it).
- `retire_project_price_list` («Идэвхтэй үнийг идэвхгүй болгох», `DELETE /api/admin/pricing`, super_admin) archives a list's active version without a replacement, with an `admin_audit_log` entry `pricing.retired`.
- Quotes: `calculateListPricing` prices a selection from the one active list that covers it inside that list's window. When the covering list is out of its window the answer is «Үнийн хүчинтэй хугацаанд багтахгүй байна» — never another list's price. Meeting conditions are the union of the rules of every list valid today.
- `GET /api/dashboard/pricing?list=<key>&version=<n>`: `lists` (default list, then lists with an active price, then by name), `history` of every list, `selected` for the shown list. `GET /api/admin/pricing` returns `{ lists: [{ key, name, latest, active }] }`.
- The «Ярилцаж буй гэрээ» report prices with every active list; its note names them («Үндсэн үнэ» v2 · «Forest Garden тусгай үнэ» v1).

Not covered: parking price lists (per-unit prices, leasing interest tables) and a price that rises with each contract — both need their own rules.

## Archiving

Archiving already happens in the database: `save_project_pricing` with `status = 'active'` sets the previous active row to `archived` and inserts the new version in one transaction with an `admin_audit_log` entry. Versions are immutable. The page only reads:

- Only `active` / `archived` rows are listed; drafts never reach the sheet (`GET /api/dashboard/pricing` filters `status IN ('active','archived')`, also for `?version=`).
- «Архивт шилжсэн» = the stored `archived_at` (rows archived since 2026-11-27), else `created_at` of the next activation of the same list.
- Activator names come from `user_profiles.full_name`; account ids never leave the server.

## Access

- `GET /api/dashboard/pricing[?version=N]`: `withRoute({ module: 'properties' })`, then `assertPricingProjectAccess` — a restricted sales manager sees the price only for a project they are registered for (the meeting-conditions rule); admins and org roles are unrestricted.
- Writes stay super_admin only through `PUT /api/admin/pricing` → `save_project_pricing`.

## Code

- `src/lib/sales/pricing-history.ts` — pure: `pricingValidity`, `diffPricingRules` (a rule matches only the same block, model, condition and floor range; Б/B and Е/E are equal), `sortPricingRules`, `withArchiveTimes`, response types.
- `src/lib/sales/pricing-store.ts` — `loadPricingHistory`, `loadPricingSheet`, `assertPricingProjectAccess`.
- `src/lib/sales/pricing-import.ts` — pure price-list parser and rule builder; `src/app/api/admin/pricing/import/route.ts`; `src/components/admin/PricingImportPanel.tsx`.
- `src/app/api/dashboard/pricing/route.ts`, `src/app/dashboard/pricing/page.tsx`, `src/components/pricing/PricingVersionView.tsx`.
