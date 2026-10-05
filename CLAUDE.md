# CLAUDE.md — Vertmon Hub

Real-estate sales CRM for Vertmon LLC's projects (Mandala Garden, Elysium, …): leads → meetings → contracts → payments, unit inventory, a Facebook/Instagram DM Inbox, marketing performance and an OpenAI dashboard assistant. All UI copy is Mongolian; keep new copy Mongolian. Default branch `main`; Vercel deploys `main` to production (`sin1`, www.vertmon.mn).

Feature specifics live in `docs/features/` (verify status lines against the code); `docs/archive/` is history only.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Turbopack), React 19, TypeScript, Node ≥ 20.9 |
| Styling | Tailwind v4, CSS-first tokens in `src/app/globals.css` (no `tailwind.config.ts`) |
| Data / auth | Supabase Postgres + RLS + Auth (email/password, invites, Google/Facebook OAuth) |
| AI | OpenAI Responses (`openai`) for the dashboard assistant; Google Gemini only for the public lead-form welcome reply and competitor analysis |
| Other | Zod 4, react-query, Resend, web-push (VAPID), exceljs, Sentry, Vitest 4, Playwright |

## Commands

```bash
npm run dev            # http://localhost:3001
npm run build
npm run lint           # eslint . (flat config)
npm run typecheck      # tsc --noEmit
npm run test           # vitest (TZ=Asia/Ulaanbaatar)
npm run test:payments  # payment RPC on disposable PostgreSQL
npm run test:rbac      # RLS/privilege regressions on disposable PostgreSQL
npm run test:workflow  # CI browser flow (login → lead → schedule → report)
npm run test:e2e       # every isolated browser project (playwright.config.ts)
```

Browser specs run against `e2e/support/fixture-server.mjs` (fake GoTrue + `next dev` with every `.env` key blanked) — never production credentials. `E2E_BROWSER_CHANNEL=chrome` uses installed Chrome. Next dev may add build-dir type paths to `tsconfig.json` while fixtures run; revert them. CI runs typecheck, lint, unit, `test:payments`, `test:rbac`, `test:workflow`, `npm audit` (critical) and build.

## Layout

- `src/proxy.ts` — auth redirects for `/dashboard`, `/admin` and API rate limits (there is no `middleware.ts`): strict for `/api/ai*`, `/api/ai-assistant`, `/api/ai-settings`; relaxed for `/api/webhook` and FB lead ads; standard elsewhere.
- `src/app/api/**` route handlers; `src/app/dashboard/**` staff UI; `src/app/admin/**` super-admin (users, roles, projects, sales targets/roster, import); `src/app/marketing/**` marketing; public `/`, `/help`, `/terms`, `/privacy`, `/contact`.
- `src/lib/auth` — `require-permission.ts` (`requireModule*`, `resolvePermissions`), `supabase-auth.ts` (`getUserShop`, `supabaseAdmin`), `cron.ts`, admin auth.
- `src/lib/sales` — `project-scope.ts`, `manager-identity.ts` (`resolveReportViewer` = personal vs org rule), targets, `kpi(-load).ts` (KPI card v2), `activity(-load).ts` (daily calls / meetings / request SLA per manager). `src/lib/leads` — `labels.ts`, `work-queue.ts`, `activities.ts`, `timeline(-load).ts` (manager timeline), `quotes.ts`, `elysium.ts`. `src/lib/service-logs` — «Санал гомдол» labels and SLA. `src/lib/projects/shop-project.ts` (the shop's single project). `src/lib/erp` — snapshot import/diff, `records.ts` (property.sale + product export parsers), `snapshots.ts`.
- `src/lib/services` — `LeadService` (staff lead rules + idempotent `insertLeadOnce` for every intake channel), `LeadCategoryService`, `ViewingService`, `TaskService`, `PaymentService`, `ContractService` (holder transfer), `ServiceLogService`, `ElysiumLeadSync`, `CustomerOps`, `MarketingOps`: shared by API routes and AI tools (put new business logic here, not in both).
- `src/lib/dashboard` — operations report loader, `my-stats`, `kpi-report(-build)`, weekly review, `weekly-sales(-load)` (Wednesday sales report from ERP exports/CRM). `src/lib/marketing` — performance(+load), budget, spend, Meta spend, channel export reports.
- `src/lib/ai/orchestrator` (loop, prompt, memory, `shop-knowledge.ts`, `http.ts`, agents), `src/lib/ai/tool-catalog.ts` (the one tool registry), `src/lib/ai/data-assistant` (`tools.ts` schemas, `index.ts` handlers, `functions.ts`/`actions*.ts`).
- `src/lib/webhook/WebhookService.ts` + `src/lib/facebook/messenger.ts` — Meta DM persistence and staff replies.
- `src/lib/navigation/nav.ts` (single nav source), `src/lib/api/dashboardFetch.ts` (browser → API), `src/lib/utils/date.ts` (Ulaanbaatar dates), `src/lib/utils/xlsx.ts` (Excel I/O).
- Supabase clients: `lib/supabase.ts` `supabaseAdmin()` (service role, server only; `lib/auth/supabase-auth.ts` re-exports it), `lib/auth/supabase-auth.ts` (session + middleware clients, `getUserId`, `getUserShop`), `lib/supabase-browser.ts` (auth and realtime in the browser).

## Rules that must not regress

### Auth, tenancy, RBAC
- Only Supabase `getUser()` is trusted; no custom session cookies.
- Standard business handlers use `withRoute({ module, access, error })` (`lib/api/route.ts`): module gate → `getUserShop()` (403 when the user has no accessible organization) → handler, with uncaught errors logged and answered in Mongolian. Handlers with their own flow (self-scoped, cron, webhooks, public intake, custom error mapping) keep explicit gates.
- Every business `/api` handler authenticates itself: reads `requireModule`/`requireAnyModule`, writes `requireModuleWrite`, deletes `requireModuleDelete`, then `getUserShop()` (validates `x-shop-id` against owner ∪ `shop_members`). A generic write/delete flag alone is not enough. Personal tasks, preferences and AI conversations stay self-scoped. Business data goes through `supabaseAdmin()` only after these checks.
- RBAC modules (`lib/rbac.ts`): dashboard, properties, leads, viewings, contracts, customers, customer-service, finance, erp-imports, inbox, reports, reports-leads, marketing-roi, ai-assistant, ai-settings, settings. `finance` has no page; it gates the operations report's cash sections. Server resolution is strict (`fetchRolePermissions(role, db, true)`): DB errors or a missing role deny; only `super_admin` keeps a static fallback; `admin` does not bypass module grants. Role create/update use the `save_role` RPC (role row, grants and `admin_audit_log` in one transaction). Roles may still hold retired grants (e.g. `surveys`); the roles page ignores them.
- Shop = project (owner decision 2026-10-04): each project (Mandala Garden, Mandala 360&365 Tower, Elysium Residence…) is its own shop with exactly one `projects` row (`projects_one_per_shop` trigger); never add sub-projects — blocks and phases are unit attributes. New projects only via `create_project_shop` (Admin → Төслүүд); users switch projects with the header «Төсөл» switcher. Staff join projects at Admin → Хэрэглэгчид → Төслүүд (`/api/admin/users/projects`, provisioning links the roster and the shop's project); roster links are explicit, never by profile-name matching. A sales manager needs a real name at create/invite; staff phone (8 digits) and name edits go through `/api/admin/users/profile` (a linked manager is renamed in the roster, not here). Production was split on 2026-10-04 (`scripts/migrate-project-shops.mjs`; a re-run is a no-op).
- Project scope (`lib/sales/project-scope.ts`): a sales manager sees, creates and claims only leads assigned to them inside projects they are registered for. Only one active `sales_managers.user_id` link grants access; registration and project membership are saved together by `save_sales_manager_roster` from `/admin/sales-targets` (a single-project shop assigns its project automatically). admin/super_admin are unrestricted. API, AI tools, reports, exports and caches all use `applyLeadScope`; restricted managers cannot merge customers. New leads need a validated project (Facebook Lead Ads take it from the `/marketing` campaign mapping; leads from unmapped campaigns arrive without one for an admin to assign).
- Business writes are server-only at the database level (migration `20260928120000`). The browser never queries business tables; it calls the API through `dashboardFetch`/`dashboardJson`/`dashboardMutate`/`dashboardDownload` and never hand-writes `x-shop-id` (lint-enforced).
- Cron routes call `isAuthorizedCron()` (fails closed outside development; `CRON_SECRET` is required in production). Secrets and signatures are compared with `safeEqual`; the Meta webhook verifies `X-Hub-Signature-256`.
- `PATCH` bodies go through Zod allow-lists; never spread a request body into `.update()`.
- Storage: public listing images via `/api/properties/upload`; AI images/PDFs via `/api/dashboard/upload` into the private `ai-attachments` bucket, rechecked (identity, shop membership, linked module) on every download. Private attachments never enter `properties.images`.

### Money, dates and data
- Contract payments only through the service-role `mutate_contract_payment` RPC (`PaymentService`): stable `client_request_id`, explicit `receipt_kind` (`advance|installment|other`). Never write paid amounts directly. Contract value, cash receipts, advances, barter and imported snapshots stay separate; missing targets or classifications show as unavailable, never guessed.
- A contract's holder changes only through the `transfer_contract` RPC (`ContractService`, «Гэрээ шилжүүлэх»: `transfer` = new holder, `rename` = same person): same row, history in `contract_transfers` + lead timeline + `data_audit_log` in one transaction; money, `sales_manager`, `contract_date`, lead, unit and number stay. Contracts PATCH no longer accepts `customer_name`; `/admin/import` keeps a transferred holder. The ERP status `transferred` («Тоот шилжсэн») is unrelated.
- Server day/month boundaries use `lib/utils/date.ts` (`ubStartOfDay`, `ubDayRange`, `ubDateStr`, `ubMonthRange`, `ubParts`). Never `setHours(0,0,0,0)`, `new Date(y, m, 1)` or `toISOString().slice(0, 10)` for business dates on the server (Vercel runs in UTC). Boundary code deserves a test with `process.env.TZ = 'UTC'`.
- Reads that may exceed 1,000 rows use `fetchAllRows` and surface errors instead of returning empty data.
- Excel I/O through `lib/utils/xlsx.ts` (`.xls` is rejected with 400; CSV via `csv-parse`); Excel dates through `toDateStr`.
- ERP exports (`erp_imports`) are imported snapshots: the weekly report and KPI read them as such (contract value, ERP «Нийт төлсөн дүн» differences between two snapshots as cash, labelled with both dates) and never write them into contract paid amounts. Product statuses use the units-import vocabulary (`inventoryStatusOf`).
- `/admin/import` validates `projectId` against the shop and stamps it on rows; re-imports never overwrite paid values or live unit status; unit CSV codes keep leading zeros; invalid rows fail the file. The assistant's company knowledge is `shops.custom_knowledge` + `shop_faqs` (`orchestrator/shop-knowledge.ts`); `ai_knowledge_base` is an archive.
- Lead vocabulary (status/source/interest labels) lives only in `lib/leads/labels.ts`; adding a source means updating every map and the AI enums.
- Anonymous lead = `customer_name IS NULL`, never a label: display only through `leadDisplayName` (a regression test rejects `customer_name || '…'` fallbacks), writes through `normalizeLeadName`/`insertLeadOnce`; staff and AI need explicit `anonymous: true` plus an 8+ digit phone or an email.
- Lead categories are per-project DB settings (`lead_categories`, Тохиргоо → «Лидийн ангилал», settings write); `leads.category_id` must reference the same shop (composite FK), one category per lead, used categories are archived, never deleted. The AI never invents a category name.
- Activity KPI (`lib/sales/activity(-load).ts`, `/api/dashboard/reports/manager-activity`): calls = `lead_activities` type `call` attributed by `created_by` → `sales_managers.user_id` first; KPI `calls_chats` = manual override ?? CRM count (never summed); meetings = completed viewings by UB day; requests = `service_logs.manager_name` within the priority SLA. Price quotes (`lead_activities` type `quote`) are contacts, never revenue or KPI sales.
- «Санал гомдол» writes go through `ServiceLogService` (strict Zod, roster `manager_name`, `resolved_at` set on resolve, kept on close, cleared on reopen).
- Attribution: lead creation stamps `sales_manager_name` server-side (`resolveManagerIdentity`); viewings stamp the canonical manager; `manager_performance`/`manager_monthly_sales` exclude soft-deleted contracts and keep `security_invoker = on`. `/dashboard` mode (personal Today vs org Director) is decided by `GET /api/dashboard/mode`; `?manager=` on my-stats/KPI reports is honoured only for admin/reports users who are not personal-mode.

### Dashboard AI assistant
- OpenAI Responses (`OPENAI_API_KEY`; `OPENAI_MODEL`/`OPENAI_FAST_MODEL`, default `gpt-5.6-luna`). No key → 503; there is no fallback provider. `runLoop`: ≤ 8 rounds, parallel reads, sequential writes, `ask_user` clarifications, `delegate_to_specialists`.
- Each tool's kind (read/write/delete/admin), module, `auto`, `alwaysConfirm` and project `scoped` flag live only in `lib/ai/tool-catalog.ts` (client-safe); `tools.ts` holds schemas and `data-assistant/index.ts` a typed handler per catalog name (tests and the compiler keep the three aligned). Write tools return a preview; execution goes through `POST /api/ai-assistant/action`, which re-checks RBAC and audits. `auto` tools (reversible, low-risk) run directly with an audit entry; deletes, contracts, payments and outbound messages are never `auto`, and money tools are `alwaysConfirm` (never remembered). The module check hides tools from the model and blocks execution.
- Development-only mock: `localStorage.vertmonhub_ai_mock = ok|error|delegate|clarify` (sent as `x-ai-mock`); never active in production.

### Other
- Elysium site leads: live push `/api/integrations/elysium/leads` (Bearer secret) plus the reconciliation cron `/api/cron/elysium-leads-sync` that pulls Elysium `event_leads` (Admin → «Холболтууд», disabled until a super_admin enables it after a dry run): `client_request_id = event_leads.id`, `created_at` backdated to the submission, phone/email match within the window instead of duplicates, every row recorded in `external_lead_imports`.
- Meta DMs: `/api/webhook` verifies the signature, ACKs immediately and, in `after()`, saves the customer and a `chat_history` row (attachments as type labels, never CDN URLs). No auto-reply. Staff answer from the Inbox via `/api/dashboard/conversations/reply` (Meta's 24 h window; Facebook only).
- Sentry: `src/instrumentation.ts` (server/edge init) + `src/instrumentation-client.ts` + `withSentryConfig`; no root `sentry.*.config.ts`.
- `shops` is load-bearing (one shop = one project); a multi-tenant rework is out of scope for routine changes.

## Database and migrations

- Migrations in `supabase/migrations` are additive and idempotent. Apply them with node + `pg` over `DATABASE_URL` (no Supabase CLI), one transaction per file, and record each version in `supabase_migrations.schema_migrations`: `node scripts/apply-migrations.mjs <from> <to>` checks read-only, `--apply` applies only that explicit range (10 s lock timeout, stops at the first failing file). Data changes are separate, explicitly approved statements. Production has every migration through `20261004165000` (`20261004160000`–`20261004165000` — contract transfers, lead categories, lead quotes, activity KPI, Elysium sync, staff phone — applied 2026-10-05 through the Supabase SQL Editor, confirmed by the owner). Apply new migrations before deploying the code that reads them.
- `DATABASE_URL` in `.env.local` is the production database: read-only queries and approved migrations only.
- Real inventory is `property_units` (`property_block_summary` view); the `properties` listing table is mostly empty. `admins`, `plans`, `subscriptions`, `invoices`, `ai_memory` and `exec_sql` never existed — do not query them.
- `node scripts/rls-audit.mjs` audits RLS/`security_invoker` read-only.

## UI conventions

- Design system v2: Vertmon blue `#2D6FE6` is the only accent, borders over shadows, status colours only from `--status-*`, `.focus-ring` is the one focus style, `.num` for tabular figures; Golos Text + JetBrains Mono via `next/font`.
- Navigation from `lib/navigation/nav.ts` (`PRIMARY_NAV`, `BOTTOM_NAV`, `MOBILE_TABS`, `SECONDARY_ROUTES` for ⌘K and the mobile «Бусад» sheet), filtered by `canAccessModule(Dynamic)`.
- Icons `lucide-react`, toasts `sonner`, forms are controlled inputs + Zod, data via react-query. `@/` → `src/`.
- Before browser-checking UI changes, unregister the service worker (`sw.js` serves cached JS).

## Removed — do not reintroduce

- The Syncly e-commerce product (products, orders, carts, QPay, comment automation, plans/subscriptions), the `vertmon-session` cookie, Clerk helpers and `/api/admin/setup`.
- 2026-10-04: the Gemini FB/IG DM bot (auto-replies, AI pause, bot tools/prompts, retry queue), the finance/procurement and survey UIs with their APIs and AI tools, `/auth/register` + i18n, `/docs`, uncalled API routes, the legacy contracts Excel importer and the landing CMS editor (`/admin/landing`, `/api/dashboard/landing-content`; `/` never read it — public copy lives in `src/components/landing`). Their tables remain until an approved migration drops them.
- Still present without a UI, pending an owner decision: `leads/[id]/convert`, `inbox/remind` and `handover` APIs.

## Environment

`.env.example` lists every variable the app reads. Production requires the Supabase keys, `OPENAI_API_KEY`, `FACEBOOK_APP_SECRET`, `FACEBOOK_VERIFY_TOKEN`, `CRON_SECRET` and `TOKEN_ENCRYPTION_KEY` (`src/lib/env.ts` reports missing ones at startup); the rest enable optional features (e.g. `ELYSIUM_SUPABASE_URL` / `ELYSIUM_SUPABASE_SERVICE_KEY` for the Elysium pull, server-only).

## Notes for agents

- Other sessions share this checkout and may switch branches or stash; commit early and check `git stash list` if work disappears.
- Prefer the shared service/helper over re-implementing a rule in a route, a tool or a page — duplicated copies of business rules have drifted before.
