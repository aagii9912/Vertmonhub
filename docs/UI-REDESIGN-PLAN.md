# Vertmon Hub — UI/UX Redesign Master Plan
### "Editorial Terracotta, Fully Committed" — a 100% front-end overhaul that keeps every feature

**Author:** Lead Designer + Frontend Architect
**Date:** 2026-06-30
**Status:** Implementation-ready. Execute against this document.
**Scope:** Full visual + interaction overhaul of all front-end surfaces (dashboard, CRM, finance, AI, marketing, public/auth, admin). Zero functional regressions. Live client (Mandala Garden) must never break.

---

## 1. Executive Summary

Vertmon Hub already owns a genuinely distinctive design DNA — warm cream surfaces, deep ink, an OKLCH terracotta brand, and a Fraunces serif display paired with IBM Plex Sans (Cyrillic-ready). The problem is not the identity; it's that the identity is **half-applied**. A clean two-layer token system in `globals.css` is sabotaged by 175 ad-hoc font sizes, 149 off-brand palette utilities, 35 raw-palette gradients, three competing modal systems, three competing chat implementations, and a primitive library where **14 of 20 components have zero importers**. The single most polished surface in the app — the AI orchestrator chat — proves the team can ship award-caliber craft; it just hasn't been propagated.

This plan commits 100% to the Editorial Terracotta direction and elevates it from "wireframe with good bones" to **a premium broadsheet-meets-trading-desk product**: a real type scale, a completed elevation system, a single Radix-backed component kit, a proper Motion layer, and a ruthless "de-rainbow" pass. Because the `@theme → primitive` indirection is already clean (`globals.css:13-104`), we repaint the entire app from ~40 root variables without touching the 945 `text-muted-foreground` / 559 `bg-surface` call sites. The change will feel total — new typography, new motion, new components, unified chat and tables — while carrying almost no risk to the load-bearing logic (pipeline forecasting, contract generation, finance pagination).

**North-star feel:** *Open a high-end print real-estate brochure, then realize it moves like a trading terminal.* Warm and trustworthy at rest; fast, dense, and precise in the hands of a sales manager who lives in it 8 hours a day.

---

## 2. Current-State Verdict (severity-ranked, with evidence)

| # | Severity | Problem | Evidence |
|---|----------|---------|----------|
| 1 | **Critical** | **Live "Syncly" residue on public surfaces.** A prospective client sees a dead competitor's brand on the signup screen and admin. | `auth/register/page.tsx:98-105` (`src="/logo.png"`, `alt="Syncly"`, `<h1>Syncly</h1>`); `admin/login/[[...sign-in]]/page.tsx:51` ("Syncly Admin"), `:95` ("© 2024 Syncly AI Platform") |
| 2 | **High** | **No type scale.** 170 arbitrary font sizes, dominated by sub-12px text (88× `text-[11px]`, 53× `text-[10px]`, 6× `text-[9px]`). This is a density-and-AA smell with no system. | grep verified: `text-[11px]`=88, `text-[10px]`=53, `text-[9px]`=6; `globals.css` defines **no** `--text-*` tokens |
| 3 | **High** | **Off-brand color sprawl.** 149 default-Tailwind palette utilities + 35 raw-palette gradients (`from-blue-600 to-purple-600`, `via-pink-500`) bypass the token system; they won't rebrand and won't dark-mode. | grep: `to-purple-600`=7, `border-violet-600`=5, `via-pink-500`=3, 35 `bg-gradient-to`; worst in AI/admin/marketing |
| 4 | **High** | **The most-polished surface is a color outlier.** AI chat uses `from-brand to-brand-strong` (on-brand) but the inbox uses `from-blue-500/30 to-violet-500/30` — two chat UIs that look like two products. | `ai-assistant/page.tsx:336` vs `inbox/messages/page.tsx:231,264` |
| 5 | **High** | **Dead/duplicated component kit.** 14/20 `ui/` primitives have 0 importers; the app hand-rolls 7+ inline `fixed inset-0 z-50` modals, 20 native `<select>`, 8 native checkboxes. Three overlay systems (Dialog, Modal, BottomSheet) coexist; Modal/Tooltip/Dropdown reference **animation classes that don't exist** (`animate-fade-in`, `animate-scale-in`). | grep: Modal/Dialog/Tooltip/Avatar/Dropdown/Tabs/Progress/DataTable/BottomSheet = 0 importers; `globals.css` only defines `.animate-fade-in-up` |
| 6 | **High** | **Two competing primary-nav models.** The header-center WorkspaceSwitcher silently rewrites the entire left sidebar — an unconventional top-level IA with no breadcrumb to orient deep routes. | `Header.tsx:66-69` + `useActiveWorkspace.ts:14-17`; deep routes like `/dashboard/finance/projects` get only a single leaf title |
| 7 | **High** | **No real charts, fake data shipped.** `AIMonitor.tsx:7-13` renders recharts on `dummyAiStats`; every analytics report uses manual CSS bars or plain `<table>`. recharts is otherwise only on the AI chat. | `reports/leads/page.tsx:285-289` (manual `<div style={{width:%}}>`); `AIMonitor.tsx` literals `value="156"`, `"92%"` |
| 8 | **High** | **Loading is a lone spinner everywhere.** The polished `LoadingSkeleton` kit is imported by exactly **one** page; ~35 pages flash a bare `animate-spin`, causing layout shift and a cheap feel. | only `app/dashboard/page.tsx` imports `LoadingSkeleton`; 35 `page.tsx` contain `animate-spin` |
| 9 | **Medium** | **Money/format chaos.** 8+ independent money formatters: `380,000,000₮` on contracts vs `380.0 сая₮` on finance for the same balance, despite `lib/utils/currency.formatMNT` existing. | `contracts/page.tsx:49`, `finance/page.tsx:52`, `customer-service/page.tsx:74`, `marketing-roi/page.tsx:74`, etc. |
| 10 | **Medium** | **Static, hover-only interaction.** No animation library installed; 441 `hover:` vs ~11 `active:` states. The UI is dead on touch. Dead `--s-*` spacing scale (0 usages) and dead `.touch-target` utilities imply systems that were never adopted. | `package.json` (no framer-motion/gsap/motion); `var(--s-N)` = 0 hits; `touch-target` in tsx = 0 hits |
| 11 | **Medium** | **Monolith + bespoke shells.** `customers/page.tsx` is 1569 lines with 4 inline modals; `customer-service` and `contracts/generate` ignore the shared system entirely (own `min-h-screen` shell, raw `<h1>`, local `KPICard`, hardcoded `#1a1a1a` print CSS). | `customers/page.tsx:125-1568`; `customer-service/page.tsx:177-196,440`; `contracts/generate/page.tsx:145-148,213` |
| 12 | **Medium** | **Accessibility debt at scale.** 0 `<th scope>` / 0 `<caption>` across 22 tables; no skip link; `<main>` has no `id`; 236 `<button>` vs 39 `aria-*`; `BottomSheet`/`DataTable`/`Tooltip` are not keyboard/SR-accessible. | `AppShell.tsx:27` (no id); grep: `<th scope>`=0, `<caption>`=0; `DataTable.tsx:118` sort on a `<div onClick>` |

Two structural bugs to fix while we're in here: the AI chat viewport calc assumes a 3.5rem header but the header is `h-14 md:h-16` (≈8px overflow on desktop) — confirmed `ai-assistant/layout.tsx` (`h-[calc(100vh-3.5rem)]`) vs `Header.tsx:60`; and `auth/register` posts `redirect_url=/setup` to a route that no longer exists (`callback/route.ts:36` hardcodes `/dashboard`).

---

## 3. Design Language

**Direction: Editorial Terracotta — Refined.** Keep the warm cream + deep ink + terracotta DNA. Refine, don't reinvent.

### Principles
1. **Density without claustrophobia.** A CRM is a daily driver. Generous line-height (`--leading-body 1.55` stays) and clear hierarchy, but tight, scannable rows and tabular numerics for financial data. Raise the type floor off 9–11px.
2. **One accent, earned with weight not hue.** Terracotta is the *only* brand accent. Depth comes from the `-soft`/`-strong` pairs and elevation, never a second hue. Status colors (success/danger/info/pending) are functional signals, not decoration.
3. **Fraunces as a deliberate voice.** Currently 17 stray call sites. Commit it: every page title, every KPI hero figure, every property/contract name. Restrict to ≥20px (serif legibility + Cyrillic ascenders).
4. **Telemetry as aesthetic.** The orchestration-trace / agent-badge language (per-step latency, tokens, tools) is a signature. Reuse its visual grammar for activity feeds, audit logs, pipeline hygiene chips.
5. **Motion is feedback, not spectacle.** Short (120–260ms), interruptible, reduced-motion-aware. Every interactive element responds to press.
6. **Mongolian-first.** Cyrillic runs ~15–20% longer than Latin. Test every label (`БОРЛУУЛАЛТ`, `САНХҮҮ / ERP`) for wrap; avoid all-caps tracking so tight it cramps ascenders.

### Embrace
Warm cream surfaces · hairline borders · warm-tinted shadows · Fraunces display + tabular-nums · IBM Plex Mono micro-eyebrows · the AI chat's bubble/trace/confirm-modal craft · the 5-color OKLCH chart palette · the WCAG focus ring.

### Avoid
Generic shadcn-neutral gray · second accent hues · raw Tailwind palette colors · emoji as status markers (`'✅ Амжилттай'`, `'🔥'` in `pipeline/page.tsx:43,325`) · glassmorphism gradients · sub-12px body text · hover-only interactions · native `confirm()`/`alert()`.

---

## 4. Design System & Tokens (`src/app/globals.css`)

The two-layer system stays. We **add** scales that are missing and **complete** scales that fall back to Tailwind defaults.

### 4.1 Color — keep, then de-rainbow
Light and dark primitives stay as-is (`globals.css:109-201`, `207-242`). No new hues. The work is **consolidation**:
- Add chart-aware status convenience: keep the 5-color OKLCH chart palette (`--chart-1..5`) as the *only* data-viz source.
- **Collapse the duplicated dark block.** `globals.css:207-242` and the `prefers-color-scheme` copy at `:245-277` are near-identical. Extract dark primitives into a single `@mixin`-style rule set or a shared custom-property group referenced by both selectors so a rebrand changes one place.
- Map shadcn aliases stay (`--color-card/-popover/-primary/-secondary/-accent/-destructive/-ring`) so all shadcn primitives inherit any rebrand for free.

### 4.2 Typography — NEW token scale (the highest-leverage fix)
Add a modular scale with paired line-heights, then codemod the 170 arbitraries onto it. Floor at 12px for body; 11px allowed *only* for mono micro-eyebrows.

```css
@theme inline {
  --text-2xs: 0.6875rem;  /* 11px — mono eyebrows ONLY */
  --text-xs:  0.75rem;    /* 12px — meta, captions */
  --text-sm:  0.8125rem;  /* 13px — dense table cells */
  --text-base:0.9375rem;  /* 15px — body default */
  --text-lg:  1.0625rem;  /* 17px */
  --text-xl:  1.3125rem;  /* 21px — section headers (Fraunces ok) */
  --text-2xl: 1.625rem;   /* 26px — page titles */
  --text-3xl: 2.125rem;   /* 34px — KPI hero figures */
  --text-display: 2.875rem;/* 46px — landing / empty-state heroes */
}
:root {
  --leading-2xs: 1.4; --leading-xs: 1.45; --leading-sm: 1.5;
  --leading-base: 1.55; --leading-lg: 1.45; --leading-xl: 1.2;
  --leading-2xl: 1.15; --leading-3xl: 1.1; --leading-display: 1.05;
}
```
Codemod map for the migration: `text-[9px]`→`text-2xs`, `text-[10px]`→`text-2xs`, `text-[11px]`→`text-xs` (audit each — many should become real `text-xs`/`text-sm`), `text-[12px]`→`text-xs`, `text-[13px]`→`text-sm`, `text-[15px]`→`text-base`. Fonts unchanged (the `--font-*-google` indirection means a typeface swap is one line if ever needed).

### 4.3 Spacing — adopt or delete the dead scale
`--s-1..--s-16` (`globals.css:173-183`) has **0 usages**. Decision: **delete it.** It implies a rhythm system that was never real; Tailwind's default spacing (already used everywhere) is the system. Removing it stops faking a contract. (If a future layout grid wants enforced rhythm, reintroduce as `--space-*` with lint enforcement — not now.)

### 4.4 Radius — keep, decide on 3xl
`--r-xs(4)..--r-3xl(28)` stays. `rounded-3xl` has 0 usages today. **Adopt** it deliberately for the new large surfaces (empty-state cards, hero panels, bottom sheets at `--r-2xl`), so corners stop being arbitrary (`rounded-md`/`lg`/`xl`/`2xl`/`rounded-t-[2.5rem]` are mixed today). Define a **radius contract**: controls=`md`, cards=`xl`, modals/sheets=`2xl`, pills=`full`.

### 4.5 Shadow / Elevation — complete the scale
Today `shadow-2xl` is used 14× but the custom scale stops at `--shadow-xl-val`, so `shadow-2xl` silently falls back to Tailwind's **cool-gray** shadow, breaking the warm-ink intent. Add:
```css
--shadow-2xl-val: 0 12px 24px rgba(20,18,12,.08), 0 40px 80px rgba(20,18,12,.14);
/* expose: --shadow-2xl: var(--shadow-2xl-val); in @theme */
```
Define an **elevation ladder**: rest=none, hover-card=`shadow-sm`, dropdown/popover=`shadow-md`, modal=`shadow-lg`, command-palette/sheet=`shadow-2xl`.

### 4.6 Motion — NEW tokens (prereq for the motion layer)
```css
:root {
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 260ms;
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* matches existing fade-in-up */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* press/pop */
}
```
Plus a `useReducedMotion()` JS hook so Motion honors the preference (today only the CSS clamp at `globals.css:366-373` does — `PullToRefresh.tsx:108` ignores it).

### 4.7 Layout tokens — decouple the shell
Replace AppShell magic numbers with tokens so the AI-assistant negative-margin coupling becomes safe:
```css
:root { --sidebar-w: 16rem; --header-h: 3.5rem; }
@media (min-width: 768px){ :root { --header-h: 4rem; } }
```
Then `AppShell` uses `md:ml-[var(--sidebar-w)]` and the AI layout uses `h-[calc(100vh-var(--header-h))]` — **fixing the 8px overflow bug** at the same time.

### 4.8 Cleanup
Delete legacy e-commerce `.badge-shipping/-delivered/-cancelled/-paid/-pickups` (`globals.css:412-417`). After the de-rainbow pass, delete most of the 77 scattered `dark:` overrides (the token layer auto-themes).

---

## 5. Component Library Overhaul

Decision on **shadcn**: adopt the shadcn **authoring standard** (CVA + `data-slot` + Radix) as the single mental model, but keep our own token-mapped variants. We already have the bridge aliases. We do **not** wholesale-import shadcn's neutral theme — we keep Editorial tokens.

### 5.1 Existing `src/components/ui/` — disposition

| Component | Importers | Action | Rationale |
|---|---|---|---|
| `Button` | 39 | **Refactor (API-stable)** | Strongest primitive. Add press-scale `active:scale-[0.98]`, wire `.touch-target` into `size:icon`, unify focus ring spec with Input (one `ring-[3px] ring-ring/40`). |
| `Card` | 46 | **Keep + extend** | Most-used. Add `interactive` variant (hover elevation + press), enforce `rounded-xl`. |
| `Badge` | 9 | **Keep** | Rich status variants already map to tokens. Becomes the base for new `StatusPill`. |
| `Input` / `Textarea` / `Label` | 12 / 6 / 0 | **Keep** | shadcn/Radix-generated; a11y for free. Standardize focus ring to match Button. |
| `Spinner` | 16 | **Keep** | Exemplary a11y (`role=status` + sr-only). Canonical loading atom. |
| `EmptyState` | 12 | **Keep + extend** | Add illustration slot + reuse AI suggestion-card pattern. |
| `Tabs` | 0 | **Refactor → adopt** | Radix-backed and good; force adoption (ai-settings, surveys, contract detail). |
| `Dialog` | 0 | **Promote to canonical** | `radix-ui` umbrella import, animations correct. Becomes the ONE modal. |
| `Modal` | 0 | **Delete** | Duplicate of Dialog (`@radix-ui/react-dialog` direct). Fold size/title API into Dialog. |
| `BottomSheet` | 0 | **Replace** | Hand-rolled, no focus trap/aria. Rebuild as `Sheet` (Radix Dialog + side variants, or `vaul` for drag). |
| `Tooltip` | 0 | **Replace** | Hand-rolled, no `aria-describedby`. Use Radix Tooltip. |
| `Dropdown` | 0 | **Replace** | No keyboard nav/roles. Use Radix DropdownMenu. |
| `Avatar` | 0 | **Refactor** | Switch `<img>`→`next/image`, add initials fallback, fix `AvatarGroup` single-child bug (`Avatar.tsx:83`). |
| `Progress` | 0 | **Keep (migrate to CVA)** | Used for contract/payment bars — but inline today; route them through this. |
| `DataTable` | 0 | **Replace → DataTable v2** | Monolithic, mouse-only sort, hardcoded MN strings, no overflow wrapper. Rebuild composable. |
| `LiveIndicator` | 0 | **Keep** | Reuse for inbox AI-active / online state. |
| `LoadingSkeleton` | 1 | **Refactor + promote** | Rename `OrderItemSkeleton`→`RowSkeleton`, `DashboardSkeleton`→`KpiGridSkeleton`. Ship via per-route `loading.tsx`. |

### 5.2 NEW primitives to build (Radix-backed, token-themed)

| New | Replaces / enables | Priority |
|---|---|---|
| **Select** | 20 native `<select>` (PropertyForm, lead form, finance, filters) | P0 |
| **Checkbox / RadioGroup / Switch** | 8 native inputs + 3 duplicated hand-rolled toggles (`ai-settings:240,591`, `settings:204-235`) + DataTable raw checkboxes | P0 |
| **Sheet (slide-over)** | UnitDrawer, contracts drawer, customer detail, viewings detail → one canonical master/detail | P0 |
| **Toast** | wraps mounted `sonner`; replaces all `alert()`/`confirm()` (`contracts:171,181`, `surveys:278,280`, `inbox/messages:75`) | P0 |
| **DataTable v2 (SmartTable)** | all 22 raw `<table>`; sticky header, sort (`aria-sort` + real `<button>`), client/server pagination, row-select + bulk bar, density toggle, cell renderers (`<Money>`/`<DateText>`/`<StatusPill>`/`<ProgressCell>`), `overflow-x-auto` + `<th scope>` + `<caption>` | P0 |
| **FormField** (label + hint + error + control) | the repeated `px-3 py-2.5 border border-border-strong rounded-lg` string across dozens of fields | P0 |
| **StatusPill** | the 6+ ad-hoc status→{label,variant} maps (leads/contracts/units/customer-service) | P1 |
| **Money / DateText** | the 8 money formatters; single `formatMNT` source | P1 |
| **Command palette (cmdk)** | new global ⌘K navigation across all routes/records | P1 |
| **ChartCard kit** (`BarChart`/`LineChart`/`DonutChart`/`Sparkline`/`AgingBar` on recharts + `useChartColors`) | manual CSS bars in reports, finance tables, marketing-roi; wire `AIMonitor` to live data or remove | P1 |
| **Popover · Separator · Breadcrumb · Alert/Banner** | scattered ad-hoc equivalents; breadcrumb feeds the shell | P1 |
| **Shared chat kit** `src/components/chat/` (`MessageBubble`, `MessageList`, `Composer`, `ConversationSidebar`) reusing `MarkdownMessage` | collapses the 3 inbox implementations onto the AI-chat north-star | P2 |
| **AuthShell · AuthCard · BrandLogo · OAuthButton** | duplicated auth/admin chrome | P2 |

---

## 6. Navigation & IA

**Resolve the dual-nav tension (Problem #6) decisively.** Keep the data-driven `workspaces.ts` model (it's excellent — single source of truth) but change the *presentation*:

1. **Move the WorkspaceSwitcher into the sidebar header**, not the page header. Reads as one continuous left-hand hierarchy: `Workspace → Section → Item`. The header center becomes a **breadcrumb** + global ⌘K search trigger. This kills the "a header pill silently rewrites my sidebar" confusion.
2. **Collapsible icon-rail sidebar** (the `transition-all duration-300` on `AppShell.tsx:25` already anticipates it). Persist collapse state and per-section collapse to `localStorage` (the `rememberSubroute` pattern already exists in `useActiveWorkspace.ts:24-39`).
3. **Stronger active state.** Today active = `bg-surface-2` (≈6% lightness delta on cream, `Sidebar.tsx:137`). Add a left accent bar (terracotta), stronger surface, and weight shift so location is scannable at a glance.
4. **Real breadcrumb in the shell** for deep routes (`finance/projects`, `reports/*`) — `PageHeader` already supports breadcrumbs (`PageHeader.tsx:37-52`); promote it to shell level.
5. **Unify exits.** Today there are three profile/logout surfaces (dead sidebar profile button `Sidebar.tsx:250`, sidebar Гарах `:237`, header dropdown `Header.tsx:112`). Make the sidebar profile button open the menu; remove the duplicate logout.
6. **One active/title matcher.** Consolidate the three independent implementations (`Sidebar.tsx:54`, `MobileNav.tsx:36`, `getNavTitle` `workspaces.ts:274`) into one shared helper.
7. **Mobile "Бусад" sheet** gets section grouping (БОРЛУУЛАЛТ / САНХҮҮ / АНАЛИТИК) instead of a flat 11-icon dump (`MobileNav.tsx:63-80`).
8. **Reconcile marketing RBAC** — give its 12 items real `module` values (`workspaces.ts:206`) so all three workspaces gate consistently.
9. **Route consolidation:** `/dashboard/inbox` + `/dashboard/inbox/messages` → one route preserving conversation id (`inbox/page.tsx:74` currently loses it). Retire orphaned `ConversationList/Item/MessageThread` and the legacy `ai-assistant/agents` `ai_agents` screen (or reskin to the orchestrator's agent-legend language). `/dashboard/reports` becomes a real hub landing instead of leaking `LeadsReport`.

---

## 7. Page-by-Page Redesign

**Dashboard KPI** — Fraunces hero KPI figures (`text-3xl` + tabular-nums) in a `StatBar`; replace the imperative DOM time-filter dropdown (`page.tsx:88-118`) with a controlled Radix Select; make recent-leads rows deep-link to `/leads/[id]` (currently all → `/dashboard/leads`, `:170`) and viewings rows link out (`:219`); add `max-w` container so it stops sprawling on wide monitors.

**Properties — list/blocks** — The blocks board is the **reference surface**; keep its floor-aware grid + drawer. Migrate the `bg-orange-400` "ordered" dot (`blocks/page.tsx:72`) to a status token. Add a shared `StatusDot`.

**Properties — detail/new/edit** — Currently a second design language (`rounded-2xl` panels, `bg-brand text-white` raw buttons, `properties/[id]/page.tsx:95-172`). Rebuild on `Card`/`Button`/`Badge`/`PageHeader`; carousel overlays move off `bg-black/40` to tokens; drop the bespoke `min-h-screen` wrapper.

**PropertyForm + Lead form** — Two 500-line hand-authored forms (`PropertyForm.tsx`, `leads/new/page.tsx`). Refactor both onto `FormField` + `Select` + `Textarea` + section `Card`. Convert PropertyForm's single long scroll into a stepped/2-column layout.

**Leads list** — Add a card/stacked layout under `md:` (today a 7-col `overflow-x-auto` table, `leads/page.tsx:280`); promote inline status `<select>` to a proper control; fix client-side search that only matches the loaded page (`:128-133`); remove `as any` casts (`:331`) by typing the Lead model.

**Pipeline** — Keep all forecast/hygiene/lost-reason logic. Bring into standard `PageHeader` + shell padding (drop `min-h-screen bg-surface-2/40`, `pipeline/page.tsx:214`); replace raw HTML5 DnD (no touch/keyboard, `:301`) with `@dnd-kit` (touch + keyboard); purge `yellow-200/orange-200/indigo-200/violet-300` (`:39-42,282`) and emoji status (`:43,325,344`) → tokens + lucide.

**Viewings** — Adopt the canonical detail `Sheet`; standardize date formatting via `<DateText>`.

**Contracts** — Migrate the right-side drawer to the canonical `Sheet`; raw table → DataTable v2; `formatMoney` → `<Money>`; `window.confirm/alert` (`:171,181`) → Toast + confirm Dialog.

**Customers** — Split the 1569-line monolith (`customers/page.tsx`) into container + `CustomerDetailSheet` + `HubSpotImportModal` + `HubSpotSyncModal` + `CreateCustomerModal` + `ServiceLogForm`; table → DataTable v2.

**Customer-service** — Full rebuild onto `PageHeader` + `StatBar` + `Button` + `StatusPill` (delete local `KPICard` `:440` and className pill maps `:51-72`, drop own shell `:177`).

**Inbox** — Collapse 3 implementations into one route on the shared **chat kit**; re-pigment bubbles `from-blue-500/30 to-violet-500/30` (`messages:231,264`) → brand tokens matching the AI chat; translate English strings ("AI mode", "Yesterday", "Guest", `:329,175,237`); native `confirm()` (`:75`) → Toast.

**AI-assistant** — The **north-star**; preserve craft (animated bubbles, agent badges, OrchestrationTrace, ActionConfirmModal). Only change: fix the layout calc to `--header-h` token; keep its motion vocabulary as the canonical reference for the inbox rebuild.

**Finance / projects / reports** — Tables → DataTable v2; aging/cashflow get `AgingBar`/`BarChart`/`LineChart` from the ChartCard kit; all money → `<Money compact>`.

**Reports** — Build the real hub landing (cards → leads/properties/manager-performance/meetings); unify all four sub-reports on `PageHeader` + `StatBar` (replace local `StatCard` in leads/properties `:125`); replace manual CSS bars (`reports/leads:285`) with real charts.

**Marketing-ROI** — Hand-built flex-div bar chart (`:616`) and inline progress bars → ChartCard kit; money → `<Money>`.

**Surveys** — Tabs → Radix `Tabs`; `alert()` (`:278`) → Toast; render AI output through `MarkdownMessage` (not `whitespace-pre-wrap` `:341`); rebuild results from `JSON.stringify` dumps (`[id]/page.tsx:342`) into per-question summaries (counts, rating distributions, choice bars); fix `'Bogino khariу'` transliteration (`:484`); drop `TAB_COLORS` rainbow → status tokens.

**Settings / AI-settings** — Hand-rolled toggles (`ai-settings:240,591`, `settings:204-235`) → `Switch`; build `SettingRow` (label + description + control) + `SectionCard`; drop emoji headings (🎭🏢📝🔔) → token-colored lucide icons; kill `from-violet-50 to-purple-50` banner (`ai-settings:358`).

**Landing** — Turn the wireframe into a real sales page: product hero visual (dashboard mock), an animated Messenger-AI demo, a lead→viewing→contract scroll narrative, Moncon as social proof (not the only badge), real numbers, SSR + OG metadata. Decide CMS story: either wire `page.tsx` to consume `/admin/landing` `LandingContent` or retire the orphaned CMS.

**Auth** — Unify register onto login's Editorial style (login is the cleanest reference, `auth/login/page.tsx:81`); **remove all Syncly residue** (`register:98-105`); fix the dead `/setup` redirect (`register:41,60` → `/dashboard`); fix login microcopy "Хөдөлмөрт орох" → "Нэвтрэх"; build `AuthShell`/`AuthCard`/`OAuthButton`/`BrandLogo`; Facebook button gets correct FB blue via a documented brand token.

**Admin** — Rebrand off violet glassmorphism (`admin/login:44`) to Editorial tokens; translate English copy ("Admin Dashboard", `dashboard:78`); rebuild KPIs around real-estate domain (properties/leads/viewings/contracts/pipeline) not removed SaaS billing metrics; fix invalid `text-brand-dark` (`dashboard:202`) and `hover:bg-surface-2/40/50` (`landing:44`).

---

## 8. Motion & Micro-interactions

**Library: `motion` (Framer Motion).** Not CSS-only — we need layout/shared-element transitions and interruptible springs. Tree-shakes well. Add the `awwwards-animations`/`gsap-framer-scroll-animation` skills only for the **landing** (scroll narrative). Dashboard motion = Framer Motion + the new motion tokens.

**Standard vocabulary** (all gated behind `useReducedMotion()`):

| Interaction | Spec |
|---|---|
| **Press feedback** | `active:scale-[0.98]`, `--duration-fast`, `--ease-spring`, on every interactive element via Button/IconButton/Card-interactive |
| **List/grid stagger** | table rows & card grids fade-in-up, 30ms stagger, cap at first ~12 items, `--duration-base` |
| **Page/route transition** | `AnimatePresence` cross-fade + 8px rise, `--duration-base`, `--ease-out` |
| **Shared-element** | property/lead card → detail Sheet via `layoutId` |
| **Loading** | skeleton-first via per-route `loading.tsx` (replaces 35 bare spinners; zero CLS) — *highest-impact, lowest-risk* |
| **Optimistic updates** | status changes / drag-drop animate immediately, reconcile on response (pipeline, lead status) |
| **Modal/Sheet/Popover** | Radix `data-[state]` enter/exit (Dialog already does this correctly) |
| **AI chat** | existing bubble entrance + trace reveal = the canonical reference |

Reduced-motion: the CSS clamp (`globals.css:366-373`) stays; the new `useReducedMotion()` hook short-circuits all JS animations (fixes `PullToRefresh.tsx:108` ignoring the preference). Keep durations 120–260ms to protect low-end field phones.

---

## 9. Responsive & Accessibility

**Breakpoints.** Today bi-modal (md=160 uses, xl=5, 2xl=0). Introduce real large-desktop tiers: add `xl:`/`2xl:` for max content widths (`max-w-[1440px]` container in AppShell), multi-column dashboards, and denser tables on wide screens. Keep mobile-first.

**Mobile patterns for field sales.** Sectioned "Бусад" sheet; bottom-sheet detail views (drag-to-dismiss via `vaul`); pull-to-refresh on lists; sticky bottom action bars on forms; 44px touch targets enforced via Button `size:icon` wiring the dead `.touch-target` utility; safe-area utilities (already present).

**WCAG 2.1 AA checklist (run `design:accessibility-review` per wave):**
- [ ] Skip-to-content link + `id="main"` on `<main>` (`AppShell.tsx:27` — missing today)
- [ ] DataTable v2: real `<button>` sort headers + `aria-sort`, `<th scope="col">`, `<caption>`, `aria-label` on select checkboxes (0 today across 22 tables)
- [ ] Sheet/BottomSheet: `role="dialog"` + `aria-modal` + focus trap + focus return (BottomSheet has none today)
- [ ] Every icon-only button gets `aria-label` (236 buttons vs 39 aria-* today); codify into IconButton so it can't regress
- [ ] Tooltip via Radix → `aria-describedby` + Escape
- [ ] Type floor ≥12px body; verify AA contrast after type-scale pass (keep the `--muted-2` AA fix at `:122`)
- [ ] Keep the global focus-visible ring verbatim (`globals.css:433-437`) — strongest a11y asset
- [ ] Test Cyrillic wrapping on every label at 320px width

---

## 10. Implementation Roadmap (phased waves, ship-safe)

Mandala Garden is live. Every wave must be independently shippable and feature-complete. **Strategy: token + primitive layer first (invisible-but-foundational), then surface-by-surface so a regression is isolated to one page.** Use feature branches off `main`; never break the build.

### Wave 0 — Foundation (tokens + motion, invisible repaint) — *de-risks everything*
- Add type scale, motion tokens, layout tokens (`--sidebar-w`/`--header-h`); complete `--shadow-2xl`; collapse duplicated dark block; delete `--s-*` and legacy `.badge-*`.
- Install `motion`, `@dnd-kit`, `cmdk`, `vaul`. Add `useReducedMotion()`.
- Fix the AI-layout header-calc bug via tokens.
- **Exit:** app builds, looks visually identical, but all foundation tokens exist and the AI viewport bug is gone. Zero call-site changes.

### Wave 1 — Component kit consolidation
- Build Select, Checkbox/Radio/Switch, Sheet, Toast, FormField, StatusPill, Money/DateText, DataTable v2, ChartCard kit, Popover/Breadcrumb/Separator/Alert.
- Refactor Button (press-scale + unified ring), Card (interactive), LoadingSkeleton (rename + per-route `loading.tsx`).
- Delete Modal; replace BottomSheet/Tooltip/Dropdown with Radix.
- **Exit:** all new primitives exist with Storybook-style demo page + a11y-reviewed; old pages still work (no forced migration yet).

### Wave 2 — Shell, nav & IA + de-rainbow pass 1
- WorkspaceSwitcher → sidebar header; collapsible rail; persisted state; shell breadcrumb; unify exits + active/title matcher; sectioned mobile sheet; marketing RBAC.
- **Critical: purge Syncly** (register + admin) — do this in Wave 2, it's the lowest-effort/highest-impact win and touches the shell era.
- De-rainbow the shell + admin surfaces.
- **Exit:** one coherent navigation model; no Syncly residue anywhere; shell de-rainbowed; visual-regression screenshots approved.

### Wave 3 — High-traffic core pages
- Dashboard, Properties (blocks + detail + forms), Leads list + Pipeline (dnd-kit), Viewings. Migrate to DataTable v2, Sheet, FormField, Money/DateText, StatusPill, charts, skeletons, Framer motion.
- **Exit:** the daily-driver sales surfaces are fully on the new system; Mandala flows (pipeline, blocks) verified by hand.

### Wave 4 — Finance / Contracts / Customers / Customer-service
- DataTable v2 everywhere; split the customers monolith; canonical Sheet detail; rebuild customer-service + contracts/generate; tokenize the print stylesheet; ChartCard for finance aging/cashflow.
- **Exit:** finance + CRM cluster unified; contract pagination/forecast logic verified intact.

### Wave 5 — AI / Inbox / Reports / Surveys / Settings + de-rainbow pass 2
- Shared chat kit; collapse inbox routes; re-pigment inbox; wire/remove AIMonitor; reports hub + real charts; surveys results rebuild; Switch/SettingRow migration; translate all English strings.
- **Exit:** all AI-text renders through MarkdownMessage; no off-token colors remain; Mongolian-only rule satisfied.

### Wave 6 — Public landing + auth + admin polish
- Landing sales page (SSR/OG, motion, hero visual); unify auth on AuthShell; rebrand admin; resolve/retire landing CMS.
- **Exit:** first-impression surfaces premium; SEO/OG present; `design:design-critique` + accessibility-review pass.

---

## 11. Skills & Tooling

| Wave | Skills | Libs to add |
|---|---|---|
| 0 | `design:design-system` (token audit/doc) | `motion`, `@dnd-kit/core`, `cmdk`, `vaul` |
| 1 | `premium-frontend-design`, `design:design-system`, `design:accessibility-review` | (uses existing radix-ui, @tanstack/react-table, recharts) |
| 2 | `modern-web-design`, `design:ux-copy` (microcopy: "Нэвтрэх", breadcrumbs), `design:accessibility-review` | — |
| 3–5 | `premium-frontend-design`, `framer-motion-animator` / `page-transitions`, `design:design-handoff`, `webapp-testing` (verify flows) | — |
| 6 | `landing-page-design`, `awwwards-animations` + `gsap-framer-scroll-animation` (landing only), `seo`, `image-optimization`, `performance` | optionally `lenis` (landing smooth-scroll) |

Run `design:design-critique` at the end of each surface wave and `design:accessibility-review` as a gate before merging any wave.

---

## 12. Risks & Guardrails

| Risk | Mitigation |
|---|---|
| **"Refinement ≠ 100% change"** — owner expects dramatic difference | Make the change *felt* through committed Fraunces hierarchy, the new type scale, completed elevation, full motion layer, unified chat/tables, and the collapsible rail. The brand hue stays but the product will feel transformed. Show before/after screenshots per wave. |
| **Warm palette reads soft if type stays cramped** | Type-scale + AA pass is a **hard prerequisite (Wave 0)**, not optional. Raise floor off 9–11px. |
| **Fraunces + long Cyrillic titles** wrap/legibility | Restrict Fraunces to ≥20px display/KPI; Plex Sans for anything under 20px; test `БОРЛУУЛАЛТ`/`САНХҮҮ / ERP` wrapping at 320px. |
| **De-rainbow breaks dark mode / a brand moment** | Sequence surface-by-surface (passes in Wave 2 & 5), with visual-regression screenshots; never one global find-replace. Protect the AI chat's intentional `from-brand to-brand-strong`. |
| **Motion regresses perf on field phones** | Gate all JS motion behind `useReducedMotion()`; durations 120–260ms; cap stagger counts; lazy-load Framer features. |
| **Live client (Mandala) downtime** | Each wave independently shippable off `main`; Wave 0/1 are invisible/additive; preserve every load-bearing flow (pipeline forecast, contract generation, finance 1000-row pagination) and hand-verify after Waves 3–4. |
| **Scope creep into backend** | This is front-end-only. No schema/API changes except the `/setup` redirect fix. Data plumbing (`workspaces.ts`, `useChartColors`, `formatMNT`) is reused, not rebuilt. |
| **Monolith refactors introduce bugs** | Split `customers/page.tsx` behaviorally 1:1 (extract, don't rewrite logic); diff-test against current behavior. |

---

### Bottom line
The plan is a **systematic refinement, not a rewrite**: ~40 tokens repaint everything, one Radix kit replaces three half-built systems, the AI chat's proven craft becomes the standard, and a real type scale + motion layer make the whole thing feel premium and alive. It commits 100% to the identity the team already half-built — and removes every reason it currently looks unfinished.

**Key files to start with (Wave 0):** `src/app/globals.css` (tokens), `src/components/dashboard/AppShell.tsx` + `src/app/dashboard/ai-assistant/layout.tsx` (layout tokens + calc bug), `package.json` (add `motion`/`@dnd-kit`/`cmdk`/`vaul`), `src/components/ui/Button.tsx` (press-scale + ring), and a new `src/hooks/useReducedMotion.ts`.
