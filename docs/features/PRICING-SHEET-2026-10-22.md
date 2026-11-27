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

## By block (2026-11-27)

Owner request 2026-11-27: Mandala Garden has dozens of blocks, each with apartments and often garages, storage and service space, and the page organised by price list was hard to read. Staff look a price up by block, so both the sheet and the editor are organised by the unit register.

- **«Блокоор»** (first tab, `PricingBlocksView`): phase → block cards → unit kinds (`property_block_summary`: count per category) with a price state each — «Хүчинтэй» / «Эхлээгүй» / «Хугацаа дууссан» from the active version that prices the block, else «Үнэ ороогүй» (never «Үнэгүй», which reads as free of charge). A block opens on its own: kind buttons, the block's rows of the active version (`PricingVersionView` with `block`), and the other blocks of its phase one click away. The price list is named only when the project has several.
- Only apartments carry a price (per m²). Parking, storage and service space show «Үнэ ороогүй» and say so when opened; they get prices when parking pricing is built.
- `GET /api/dashboard/pricing` (no version) returns `active` (every list's active version with its comparison) and `phases` (`buildPricingPhases`: phases with more apartments first, apartment blocks before garage blocks, then priced blocks that have no unit in the register yet). An archive request (`version`) returns `selected` only.
- An administrator also sees «Ноорог» on blocks whose list has a saved draft (from the editor's `/api/admin/pricing`, never sent to other roles), including a drafted block that is not in the register (Forest Garden 503).
- **«Засах»**: a list of several blocks opens on block cards (rows, models, «Урьдчилгаа дутуу»); a block opens as a price sheet — one row per model and floor range, one editable м² price column per payment condition — with «Нөхцөлийн багана нэмэх», «Үнийн мөр нэмэх» and «Блок нэмэх». An empty cell means the condition is not offered there; clearing a price removes that rule. «Бүх мөр» keeps the flat one-rule-per-row table, which is also what a list of one block shows. Saving always sends every block's rules.

## Step price (2026-11-27)

Owner decision 2026-11-27 (Forest Garden): every contract raises the m² price by 100,000₮, «план бүрээр» — read as per model: a model's contracts raise that model's price in every condition and on every floor; another model keeps its own count. It applies to pre-order apartments while the list is valid and ends with the list. Migration `20261127130000_price_list_step.sql` (lets `save_project_price_list` store the key; apply before a step is saved).

- A list's config may carry `step = { amount_per_sqm, counts_from }` («Засах» → «Гэрээ бүрд нэмэгдэх үнэ»). A list without one is stored exactly as before.
- `loadPricingSteps` counts, per block and model, the live contracts (not deleted, not cancelled, `product_type = residential`) of apartments in the blocks the list prices, joined to the register by `${product_type}|${code}` like the inventory overlay, dated on or after `counts_from`. A cancelled contract leaves the count, so the price comes back down. Undated contracts are not counted and are reported on the sheet.
- `calculatePricing(config, selection, asOf, counts)`: price = rule price + contracts × step; the quote keeps `base_price_per_sqm` and `step_contracts`. A list with a step and no counts gives no price — never the base price. Quotes, AI previews and the «Ярилцаж буй гэрээ» report all pass the counts.
- The sheet shows the rule, the contracts counted per model, the raised price with its base under it; an archived version shows the rule and its base prices only.

## Per-unit prices: parking, storage, service space (2026-11-27)

Owner decision 2026-11-27: these kinds are priced per unit, as Mandala Garden's approved «Зогсоолын үнийн санал» lists them — one price, or one per payment condition, for every space by its code. Migration `20261127140000_unit_price_lists.sql` (the page tolerates a missing table: no per-unit prices, and the editor says it is not installed).

- `project_unit_price_lists`: versions per `list_key` with a `category` (`parking` / `industry` / `commercial`), one active version per list, written only by `save_project_unit_price_list` / `retire_project_unit_price_list` (super_admin, audited as `unit_pricing.*` without the price table). Config = source, window (`valid_until` may be null: «2026/10/08-с хүчинтэй»), note, conditions (label + first advance, never derived from the label) and rows (block, code, model, area, whole-tugrik price per condition; ≤ 3000).
- Activation needs a source, a start day, at least one condition and row, a price on every row and unique codes; a unit never has two active prices of the same kind on the same days (`23P01`, `unitPriceConflict`).
- «Засах» → «Тоот бүрийн үнэ»: add a list (name + kind), import the approved Excel file (`POST /api/admin/unit-pricing/import`: a «Код» column and either «Үнэ» or one column per condition; signature lines skipped), review the preview, save a draft, activate. The file's codes are checked against the register and each unit takes the register's block (the file's «Блок» of a garage space is the residential block it belongs to); unknown codes are listed. Prices change by importing the next file as a new version.
- «Блокоор»: a block's parking / storage / service kind shows the list that prices its units and, opened, the units with a price per condition (`UnitPriceView`: filter by model, search by code). Amounts are per unit, not per m².
- Not covered yet: the leasing interest tables of the «PT» sheets, type-based price sheets without unit codes (Zoo Garden, Water Garden), and choosing a parking space in a meeting quote.

## Model + area (2026-11-27)

Owner request for Mandala Garden only: there a plan is always named with its area («A 96.53 м²») — the same letter is another plan in the next block and its area changes by floor. `projects.model_with_area` (migration `20261127150000`, default false; Admin → Төслүүд → edit → «Загварыг талбайтай (м²) нь хамт харуулах», super_admin, audited as `project.update`) is a display switch per project:

- Meeting interest picker (`ViewingInterestPicker`, `GET /api/dashboard/viewings/options` → `model_with_area`): one select «Загвар, талбай» lists the block's model + area pairs («A · 96.57 м²») and sets both; the separate «Талбай» select is not shown. The saved interest is unchanged (block, model, `area_sqm`).
- Price page and editor (`PricingSheet.model_areas`, `/api/admin/pricing` → `model_areas`): a price row shows the register area of its floors after the model (`areasOfModel`, `modelAreaText`: one area, up to three, else the range); the editor's block sheet shows it under the model input.

Rules live in `lib/sales/model-area.ts` (pure) and `model-area-load.ts` (`projectShowsModelArea`, `loadModelAreas`). It changes no price and no stored value; a project with the switch off (Elysium) reads no units for it and looks as before, and a database without the column behaves as off.

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
