# CLAUDE.md — Vertmon Hub Project Intelligence

> Single source of truth for any AI agent working on the Vertmon Hub codebase.
> Read this FIRST before making changes. Keep it current as the project evolves.

---

## Project Overview

**Vertmon Hub** is an AI-powered Real Estate Sales & CRM Platform. Real estate sales managers use it to manage properties, handle Facebook/Instagram DM leads via an AI agent, schedule viewings, track contracts, and run marketing.

- **Repo:** https://github.com/aagii9912/smarthub.git
- **UI Language:** Mongolian (all labels, comments and content)
- **Default branch:** `main`

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.1 |
| UI | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS (v4 — CSS-first config, no `tailwind.config.ts`) | 4.x |
| Database / Auth | Supabase (PostgreSQL + RLS, Email + Google + Facebook OAuth) | — |
| AI | Google Gemini via `@google/generative-ai` | 0.24.1 |
| Validation | Zod | 4.x |
| Email | Resend | 6.7.0 |
| Push notifications | web-push (VAPID) | 3.6.7 |
| Tests | Vitest | 4.x |
| Deployment | Vercel (`sin1` region) | — |

---

## Commands

```bash
# Dev server runs on http://localhost:3001
npm run dev

npm run build          # production build
npm run lint           # eslint . (flat config; Next 16 removed `next lint`)
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
```

---

## Source Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhook/                # Facebook/Instagram webhook → routes DMs into the AI router and saves leads
│   │   ├── chat/                   # Inbox AI chat endpoint
│   │   ├── dashboard/              # Dashboard data APIs (stats, customers, export, posts, etc.)
│   │   │   ├── customers/          # CRM contacts API (PATCH for edits)
│   │   │   ├── stats/              # Real-estate KPIs
│   │   │   ├── export/excel/       # Properties / leads / customers Excel export
│   │   │   └── ...
│   │   ├── leads/                  # Lead CRUD
│   │   ├── marketing/              # Marketing channels, campaigns, FB/IG insights
│   │   ├── surveys/                # Customer surveys
│   │   ├── feedback/               # In-app feedback widget
│   │   ├── push/                   # VAPID push subscribe + send (sales-manager handover)
│   │   ├── shop/                   # Shop CRUD + import
│   │   ├── ai-assistant/           # AI assistant tools
│   │   ├── ai-settings/            # AI configuration
│   │   ├── auth/                   # Auth callbacks
│   │   ├── meta/data-deletion/     # Meta required data-deletion endpoint
│   │   └── health/                 # Health probe
│   │
│   ├── dashboard/                  # Dashboard UI (RBAC-gated)
│   │   ├── page.tsx                # KPI overview
│   │   ├── layout.tsx              # Sidebar + Header + MobileNav + FeedbackWidget
│   │   ├── properties/             # Property listings + create/edit
│   │   ├── leads/                  # Leads list + new + pipeline
│   │   ├── viewings/               # Property viewings
│   │   ├── contracts/              # Sale contracts
│   │   ├── customers/              # CRM contacts (incoming-contact handover view)
│   │   ├── inbox/                  # Live inbox for FB/IG DMs
│   │   ├── reports/                # Reports hub (currently renders leads sub-report)
│   │   │   ├── leads/              # Leads analytics
│   │   │   └── properties/         # Properties analytics
│   │   ├── marketing-roi/          # Marketing ROI
│   │   ├── surveys/                # Survey builder + responses
│   │   ├── ai-assistant/           # AI assistant page (and /agents)
│   │   ├── ai-settings/            # AI prompt + behaviour config
│   │   └── settings/               # Shop settings
│   │
│   ├── admin/                      # Super-admin panel
│   ├── auth/                       # /login, /register, /callback
│   ├── marketing/                  # Public marketing/landing hub
│   ├── page.tsx                    # Landing page
│   └── layout.tsx                  # Root layout
│
├── lib/
│   ├── ai/
│   │   ├── AIRouter.ts             # Main entry — `routeToAI()` and `analyzeProductImageWithPlan()`
│   │   ├── services/
│   │   │   ├── PromptService.ts    # Builds the real-estate system prompt
│   │   │   └── ToolExecutor.ts     # Executes tool calls (real-estate only)
│   │   ├── tools/
│   │   │   ├── definitions.ts      # 8 Gemini tool definitions
│   │   │   └── memory.ts           # Customer preference memory
│   │   ├── helpers/memoryTTL.ts    # Memory TTL utilities
│   │   ├── config/plans.ts         # Plan-tier feature gates (still gates AI features)
│   │   ├── intent-detector.ts
│   │   └── comment-detector.ts
│   ├── webhook/
│   │   └── WebhookService.ts       # FB/IG webhook helpers — getShopByPageId, getOrCreateCustomer, processAIResponse, etc.
│   ├── facebook/messenger.ts       # Meta Graph send helpers
│   ├── services/
│   │   ├── CustomerService.ts      # Customer CRUD (no e-commerce aggregations)
│   │   └── ChatHistoryService.ts
│   ├── auth/                       # Supabase auth helpers
│   ├── email/                      # Resend helpers
│   ├── notifications.ts            # Push notification dispatcher
│   ├── rbac.ts                     # Role-based access control (DB + static fallback)
│   ├── supabase.ts                 # Service-role client
│   ├── supabase-browser.ts         # Browser client
│   ├── supabase-server.ts          # Server-component / route-handler client
│   └── supabase-middleware.ts      # Edge middleware client
│
├── components/
│   ├── ui/                         # Base primitives
│   ├── chat/                       # Inbox chat UI
│   ├── dashboard/                  # Sidebar, Header, MobileNav, dashboard widgets
│   ├── feedback/                   # FeedbackWidget
│   ├── providers/                  # React context providers
│   └── ...
│
├── contexts/                       # AuthContext, LanguageContext
├── hooks/                          # useDashboard, useRealtimeNotifications, ...
├── types/
│   ├── ai.ts                       # ChatContext, ChatResponse, ImageAction, NotifySettings (real-estate shape)
│   ├── database.ts                 # Shop, Customer, ChatHistory, DashboardStats
│   └── property.ts                 # Property type
└── middleware.ts                   # Auth + rate limiting
```

---

## Key Architecture Decisions

### Authentication
Supabase Auth (Email/Password, Google, Facebook). `src/middleware.ts` protects `/dashboard` and `/admin`. Unauthenticated users are bounced to `/auth/login`.

### Per-manager dashboards («Миний самбар»)
`/dashboard` is **role-aware**: `src/app/dashboard/page.tsx` is a thin router driven by `GET /api/dashboard/mode` (server-side decision — never client role-guessing).
- **personal** — users with the `sales_manager` role OR an active `sales_managers` roster match get `ManagerDashboard` (`src/components/dashboard/my/`). Identity resolution is centralized in `src/lib/sales/manager-identity.ts` (`resolveManagerIdentity`: `sales_managers.user_id` link wins, then `user_profiles.full_name` string match; canonical name = roster name). The roster-empty "show to everyone" fallback exists ONLY in `/api/dashboard/my-target`, never in mode routing.
- **org** — everyone else keeps the org dashboard (`src/components/dashboard/OrgDashboard.tsx`); users with the `reports` module also get `TeamOverview` (leaderboard over `manager_performance`) + `ManagerSelector` (Sheet drill-in to any manager's board).
- **Data**: `GET /api/dashboard/my-stats?period=&manager=` returns the whole personal payload in one round trip (leads/viewings via `sales_manager_name`, contracts via `property_contracts.sales_manager`, revenue via `manager_monthly_sales` + `lib/sales/targets.ts`). `?manager=` is honored only for admin/reports users who are not themselves personal-mode; otherwise it silently falls back to self. Reads are soft-delete-filtered and resilient to missing columns (pre-migration envs degrade to empty sections, never 500). Pure aggregation helpers live in `src/lib/dashboard/my-stats.ts` (unit-tested).
- **Widget customization**: `user_dashboard_prefs` table (migration `20260707150000`, per user+shop) via `GET/PUT /api/dashboard/prefs`; merge/order logic in `src/lib/dashboard/widget-prefs.ts` (`MANAGER_WIDGETS` registry — add new widgets there; saved order preserved, new widgets auto-appear).
- **Manager list**: `GET /api/dashboard/managers` (requireModule `reports`) = `sales_managers` roster ∪ `manager_performance` names ∪ distinct `leads.sales_manager_name` — feeds both the admin selector and the lead-assign dropdown.
- **Attribution rules (do not regress)**: dashboard lead creation goes through `POST /api/dashboard/leads` which stamps `sales_manager_name` server-side from `resolveManagerIdentity` (admin may pass `assignManager`); leads list API supports `?manager=`; `PATCH /api/dashboard/leads/[id]` accepts `sales_manager_name` (assign/reassign UI in the leads detail Sheet); the viewings form stamps the canonical `mode.managerName` (server `user_profiles`), NOT client `user_metadata`. `manager_performance` / `manager_monthly_sales` views exclude soft-deleted contracts and must keep `WITH (security_invoker = on)` (migration `20260707140000`).

### Personal tasks + monthly KPI report («Миний ажлууд» / «Сарын KPI тайлан»)
Two connected features so managers never hand-write their monthly KPI report again:
- **Tasks** (`/dashboard/tasks`, module `dashboard` — everyone): free-format personal to-dos in `user_tasks` (migration `20260721120000`, RLS self-access, soft delete). CRUD via `GET/POST /api/dashboard/tasks` + `PATCH/DELETE /api/dashboard/tasks/[id]` — every query is scoped `user_id + shop_id` (strictly personal). Client: `useMyTasks` hook. Pending tasks with a due date merge into the «Хийх ажлууд» widget (`buildTaskList` in `lib/dashboard/my-stats.ts`, type `personal`; my-stats fetches them **only for self view**, never admin drill-in). The widget has an inline ✓ complete button for personal rows.
- **Reminders**: `remind_at` → `GET/POST /api/cron/task-reminders` (vercel.json, every 5 min, CRON_SECRET) batches due reminders per user into ONE push via `sendPushNotificationToUser` (new in `lib/notifications.ts`, filters `push_subscriptions.user_id`). `/api/push/subscribe` now stamps `user_id` (legacy subs get linked on next app load — the hook re-POSTs on load). `reminder_sent_at` prevents duplicates; changing `remind_at` re-arms it (PATCH nulls it); reminders older than 24h are marked sent without pushing.
- **KPI report** (`/dashboard/reports/kpi`): `GET /api/dashboard/kpi-report?year=&month=&manager=` auto-compiles a manager's month — leads (by status/source), viewings, contracts (by `contract_date`), revenue from `manager_monthly_sales` (canonical, same as dashboards), completed `user_tasks`, team target + prev-month deltas. Permission model IDENTICAL to my-stats (`?manager=` only honored for admin/reports non-personal users; silent self fallback). Pure helpers + Mongolian plain-text formatter (`formatKpiReportText` — the «Хуулах» button) in `lib/dashboard/kpi-report.ts` (unit-tested). Print support: AppShell chrome is `print:hidden`. Tasks of another manager resolve via `sales_managers.user_id` roster link.

### Marketing budget + channel tracking («Төсвийн хяналт»)
Meeting-driven marketing analytics layer (migration `20260721140000`):
- **Budget** (`/marketing/budget`): `marketing_budgets` (monthly plan per shop) + `marketing_spend_entries` (manual spend log by channel — billboard/radio/boosts; canonical channel list `SPEND_CHANNELS` in `lib/marketing/budget.ts`). `GET/PUT/POST/DELETE /api/marketing/budget` — GET compares budget vs spend vs **contract revenue** (`manager_monthly_sales`, same source as dashboards) with color rule <80% ok/green, 80–100% warn/yellow, >100% over/red (`budgetStatus`, unit-tested). Meta Ads spend (`ad_campaigns.spend`) shown as a separate total (no monthly attribution — log manually to break down).
- **Channel contract timeline + expiry reminders**: `/marketing/sources` is now shop-scoped (was leaking cross-tenant — reads/inserts must filter `shop_id`), gained a contract-create Sheet (POST `/api/marketing/contracts`) and a current-year timeline of `channel_contracts` with days-left badges. Cron `GET/POST /api/cron/channel-expiry` (daily, vercel.json) pushes shop-wide when an active contract ends in 7/3/1/0 days (`CONTRACT_REMINDER_DAYS`).
- **Market indicators** (research): `market_indicators` table (mortgage/bank/macro, manual entry) + `/api/marketing/indicators` + `MarketIndicators` card on `/dashboard/competitor-research`.
- **AI**: read tools `get_marketing_budget_status` + `get_market_indicators` (impl in `data-assistant/functions.ts`, registered to `marketing-specialist` + `advisor` agents).
- **Lead sources**: `radio` added to `LeadSource` union + all label maps (types/property.ts, leads/new select, leads page, reports/leads, marketing-roi, weekly-report cron, kpi-report lib); `board` relabeled «Билборд / Самбар». Adding a source value requires touching ALL these maps.

### Dashboard AI Orchestrator (`/dashboard/ai-assistant`)
The internal staff assistant is a **multi-agent orchestrator** (`src/lib/ai/orchestrator/`), not a manual dual-mode chat anymore. Reliability: all Gemini calls (planner, agents, synthesizer) use `withRetry` (`orchestrator/retry.ts`, backoff on 429/503); agent history is capped to the last 10 messages for token control. Markdown answers render via a dependency-free renderer (`components/ai-assistant/MarkdownMessage.tsx`). An admin-only audit view lives at `/dashboard/ai-assistant/audit` (`GET /api/dashboard/ai-audit`, reads `ai_audit_log`). Orchestrator unit tests: `src/lib/ai/orchestrator/__tests__`. Flow:
1. `POST /api/ai-assistant` (RBAC `ai-assistant`, shop-scoped) calls `runOrchestrator()`.
2. **Planner** (`planner.ts`) analyzes the request → JSON plan selecting 1–3 specialized agents.
   **Role-aware:** the planner only ever sees agents the user is entitled to —
   `allowedAgentsFor(perms)` (`agents.ts`) filters `AGENT_LIST` by each agent's
   `requiredModules`. Never reintroduce an unfiltered roster.
3. **Agents** (`agents.ts`): `my-work`, `executive-overseer`, `data-analyst`, `property-expert`, `crm-specialist`, `finance-analyst`, `advisor`, `operations-admin` (super_admin), `marketing-specialist`.
   - **`my-work` («Миний ажил»)** is the manager's daily-work surface: `get_my_day`,
     `list_my_leads`, `list_viewings`, `log_activity`, `update_viewing`,
     `complete_viewing`, `set_lead_followup`, `reassign_lead`, `create_task`,
     `complete_task` (impl in `data-assistant/manager-functions.ts`). These are
     scoped to the acting manager's canonical name — `list_leads` (shop-wide) is
     NOT a substitute for `list_my_leads`.
   - **`executive-overseer` («Хяналтын зөвлөх»)** answers management's progress
     questions: `get_team_activity`, `get_manager_progress`, `get_anomalies`
     (impl in `data-assistant/oversight-functions.ts`, pure logic in
     `lib/dashboard/oversight.ts`). Each has a focused Mongolian system prompt + a curated subset of the shared data-assistant tools. They run via the generic `runAgent.ts` (reuses `executeDataTool` from `lib/ai/data-assistant`; write tools gated by `perms.canWrite`).
   - Marketing: `get_marketing_summary` (read), `create_social_post` (confirm-gated draft/scheduled into `social_posts`).
   - **Long-term shop memory**: `ai_shop_memory` table (migration `20260617180000`); `remember_fact` tool (executes directly, `canWrite`) stores key→value; `getShopMemory`/`formatShopMemory` inject it into every run's context. Attachments shown on detail pages via `EntityAttachments` + `GET /api/dashboard/ai-attachments`. Proactive daily push digest: `GET/POST /api/cron/ai-digest` (vercel.json cron, `CRON_SECRET`).
4. **Synthesizer** merges multi-agent output into one answer (skipped for single-agent).
   **Agents run in parallel** (`Promise.all` in `orchestrator/index.ts`) — they are
   independent domain specialists and the synthesizer does the merging, so total
   latency is the slowest agent, not the sum. Do not reintroduce the sequential
   `for` loop; it made a 3-agent request exceed the function timeout.
   **Streaming:** `POST /api/ai-assistant` with `{ stream: true }` returns SSE
   (`phase: progress|done|error`), driven by `OrchestratorContext.onProgress`.
   The chat UI consumes it (`consumeStream`) to show live progress and offers a
   cancel button (`AbortController`). `maxDuration = 300`.
5. Returns `{ text, data, chartConfig, agentsUsed, trace, pendingActions }`. The **trace** (planner reasoning, per-step latency/tokens/tools) is shown in the UI (`components/ai-assistant/OrchestrationTrace.tsx`) and persisted to `ai_messages.agents_used` / `ai_messages.trace` (migration `20260616150000`). The old `data`/`general` mode toggle was removed — routing is automatic. Persistence and trace reads are migration-resilient (best-effort update + fallback select).

**Write / actions (confirm-gated).** Agents can perform real CRM/sales/admin actions, not just read:
- Property (property-expert): `create_property`, `update_property_*`, `delete_property`.
- Leads/customers/viewings (crm-specialist): `create_lead`, `delete_lead`, `update_lead_*`, `add_lead_note`, `bulk_update_leads`, `create_customer`, `delete_customer`, `schedule_viewing`, `delete_viewing`.
- Contracts/finance (finance-analyst): `process_contract_action`, `create_contract`, `delete_contract`.
- Admin (`operations-admin`, super_admin only): `invite_user`, `assign_role`, `create_role`.
- RBAC gating in `executeDataTool` (`lib/ai/data-assistant`): create/update→`canWrite`, delete→`canDelete`, admin→`role === 'super_admin'`.
- **Sales-manager attribution:** create/schedule tools stamp the acting user's name (resolved from `user_profiles.full_name` via `resolveSalesManagerName`, passed as `OrchestratorContext.userName` → `executeDataTool(..., userName)`). Contracts use the existing `property_contracts.sales_manager` column; leads/viewings/customers use `sales_manager_name` (migration `20260617120000`, best-effort stamp so creates don't regress pre-migration).
- **File attachments (read + attach).** The chat composer (`components/ai-assistant/ChatComposer.tsx`) uploads files/images to `POST /api/dashboard/upload` (bucket `products`, returns `{ url }`) and sends them as `attachments: [{url,name,mimeType}]`. `runAgent` passes image/PDF attachments to Gemini as `inlineData` (vision: AI reads/analyzes) and lists their URLs in the prompt. The confirm-gated `attach_file` tool links a file to a property/lead/customer/contract via the `ai_attachments` table (migration `20260617140000`); for property images it also appends to `properties.images[]`. Rendered via `components/ai-assistant/MessageAttachments.tsx`. The chat UI was redesigned (gradient header, agent legend, suggestion cards, animated bubbles, composer with drag-drop).
- **Confirmation flow:** mutating tools are `confirm`-gated. During an agent run they are called with `confirm=false`, which returns a **preview** (no mutation) and is surfaced as a `pendingAction`. The UI (`components/ai-assistant/ActionConfirmCard.tsx`) renders an approve/cancel card; on approve the browser calls `POST /api/ai-assistant/action`, which re-checks RBAC + shop scope and re-runs the tool with `confirm=true` to actually mutate. Deletes are **soft** (`deleted_at`); migrations `20260617100000` (leads), `20260617120000` (viewings/contracts/customers + `sales_manager_name`). Reads hide soft-deleted rows via `runExcludingDeleted` (resilient to the column not existing yet). Audit via `logAiAudit` fires on real execution only. Tool name sets live in `lib/ai/data-assistant/tools.ts` (`WRITE_TOOL_NAMES`, `DELETE_TOOL_NAMES`, `ADMIN_TOOL_NAMES`, `MUTATING_TOOL_NAMES`).

### Identity chain — how a user becomes a "manager" (do not regress)

This chain is the single most common source of "the dashboard shows zeros":

1. **Provisioning.** `handle_new_user` was dropped (`20260322_drop_auth_triggers.sql`),
   so `src/lib/auth/ensure-provisioned.ts` (`ensureUserProvisioned`) creates
   `user_profiles` + `shop_members` on every login — both the OAuth callback
   (`app/auth/callback/route.ts`) and the password route call it. It **never**
   grants a role (that is an admin action) and **never** writes the e-mail into
   `full_name` (that silently breaks roster matching).
2. **Name matching.** `resolveManagerIdentity` → `matchRosterEntry`
   (`lib/sales/manager-identity.ts`) resolves the canonical name:
   `sales_managers.user_id` link wins, then a *normalized* name match
   (`normalizeName`: trim/collapse/lowercase), then an initials-stripped match
   (`stripInitials`, e.g. «Б.Батбаяр» → «Батбаяр») **only when unique**.
   Never go back to `===` string equality.
3. **One resolver for AI and dashboard.** `resolveSalesManagerName(shopId, userId)`
   (`data-assistant/functions.ts`) delegates to `resolveManagerIdentity`. Returning
   an e-mail fallback is what previously made AI-created records invisible.
4. **Explain empty states.** `/api/dashboard/my-stats` returns
   `onboarding` + `onboardingReason` (`no_session` / `no_name` / `not_in_roster`)
   and `ManagerDashboard` renders the reason. Never hardcode `onboarding: false`.

### Activity log — the oversight data source

`activity_log` (migration `20260822120000`, append-only, service-role writes) is
what makes "management inspects work progress" real. Before it, the system only
recorded **outcomes** (contracts/revenue), so an active manager with no closed
deal was invisible.

- Write through `recordActivity` (`lib/services/ActivityService.ts`) — never
  insert directly. It is best-effort and must never fail the primary action.
- Wired into lead create/update/assign (UI) and every mutating manager tool (AI).
  When adding a new write path, add a `recordActivity` call.
- Read via `GET /api/dashboard/activity` (module `reports`) and the AI oversight
  tools. Missing-migration environments degrade to `available: false`, never 500.
- `computeAnomalies` (`lib/dashboard/oversight.ts`, unit-tested) is shared by the
  AI tool, the API and `/api/cron/anomaly-watch`. **Invariant:** an empty
  `activity_log` must never be read as "everyone is inactive".

### AI permission model (module-level, not just write/delete)

`executeDataTool` enforces four layers: write→`canWrite`, delete→`canDelete`,
admin→`super_admin`, **and module→`TOOL_MODULE_MAP`** (`data-assistant/tools.ts`).
The module layer was missing, which let a marketing user read contracts through
chat. Two drift guards protect this:
`src/lib/ai/__tests__/riskTiers.test.ts` (tool-name copies stay in sync) and
`src/lib/ai/orchestrator/__tests__/agent-permissions.test.ts` (every tool is
mapped; role↔agent expectations hold). **Adding a tool means touching
`tools.ts` (definition + `WRITE_TOOL_NAMES` + `TOOL_MODULE_MAP`),
`riskTiers.ts`, the dispatch in `data-assistant/index.ts`, and an agent's
tool list** — the guards will fail otherwise.

### Gemini model IDs

All API call sites import from `src/lib/ai/config/models.ts` (`GEMINI_FLASH`,
`GEMINI_PRO`), overridable via `GEMINI_MODEL` / `GEMINI_MODEL_PRO`. Previously
five different IDs were hardcoded in 16 places; if the one used by the
orchestrator were invalid, the whole chat would fail with no obvious cause.
(`config/plans.ts` and `types/ai.ts` keep literal names — they are display
metadata and a settings union, not call sites.)

### Inbound message flow (lead generation)
1. Customer DMs the shop's Facebook Page or Instagram account.
2. Meta posts to `/api/webhook` (signature-verified).
3. `WebhookService` resolves the shop, gets/creates a `Customer`, and gathers AI features.
4. `AIRouter.routeToAI()` calls Gemini with the real-estate system prompt and 8 function-calling tools.
5. `ToolExecutor` runs tools that hit `properties`, `leads`, `customers`, etc.
6. The final response is sent back via `messenger.ts` (text, gallery, or property images).
7. Notable handover: when a tool fires `request_human_support`, the platform pushes a notification to the sales manager via `/api/push`.

### Supabase clients
| File | Purpose |
|------|---------|
| `supabase-browser.ts` | Client React components |
| `supabase-server.ts` | Server components, API routes (user context) |
| `supabase-middleware.ts` | Edge middleware (session refresh) |
| `supabase.ts` | Service-role (webhooks, admin operations) |

### Dashboard auth header
Dashboard API routes accept the active shop via `x-shop-id` header. The browser reads `localStorage.getItem('vertmonhub_active_shop_id')` and attaches it to fetches.

### Cron jobs (`vercel.json`)

13 crons; the newest is `/api/cron/anomaly-watch` (daily 07:30 UTC) — it runs
`computeAnomalies` per shop, upserts into `work_anomalies` (unique per
shop+manager+kind+day) and pushes only when something needs attention.

### Rate limiting (middleware)
Keys are **per user**, not per IP — `getClientIdentifier` hashes the Supabase
session cookie alongside the IP, because an office behind one NAT used to share
a single 20 req/min AI quota.

- **Strict:** `/api/chat`, `/api/ai*`
- **Webhook:** `/api/webhook`
- **Standard:** everything else under `/api/`

---

## RBAC

Defined in [src/lib/rbac.ts](src/lib/rbac.ts). Modules:

```
dashboard, tasks, properties, leads, viewings, contracts, customers,
customer-service, finance, procurement, inbox, reports, reports-leads,
marketing, marketing-roi, surveys, ai-assistant, ai-settings, settings
```

Static fallback roles: `super_admin`, `admin`, `executive`, `sales_manager`,
`marketing`, `finance_manager`, `accountant`, `viewer`.

`executive` (Гүйцэтгэх удирдлага) is read-only by design — it sees the whole
picture (`reports`, `contracts`, `finance`, …) but `canWrite: false`, because
management inspects progress rather than editing CRM records.

**Nav gating invariant:** every item in `src/lib/navigation/workspaces.ts` must
carry a real `module`. `module: ''` means "always visible" (`Sidebar.tsx:64`) and
is reserved for Help only — a nav test enforces this. The same applies to
`WorkspaceSwitcher`: an empty `accessModules` array means *ungated*, so it must
never be empty for a workspace holding real data. The runtime first tries to load permissions from the `roles` / `role_permissions` / `user_roles` tables and falls back to the static map if Supabase is unreachable.

---

## AI Tools (Gemini function calling)

Defined in [src/lib/ai/tools/definitions.ts](src/lib/ai/tools/definitions.ts), executed in [ToolExecutor.ts](src/lib/ai/services/ToolExecutor.ts).

| Tool | Purpose |
|------|---------|
| `search_properties` | Search by type, price, district, rooms, size |
| `show_property_images` | Send property images to the customer |
| `calculate_loan` | Mortgage payment calculator |
| `schedule_viewing` | Book a property viewing |
| `create_lead` | Create a lead record |
| `collect_contact_info` | Save a name + phone for follow-up |
| `request_human_support` | Page the sales manager |
| `remember_preference` | Save customer preferences (district, rooms, budget...) for next session |

---

## Admin Data Import (`/admin/import`)

Bulk CSV/Excel import for onboarding a new project's data. UI: `src/app/admin/import/page.tsx`; API: `POST /api/admin/import`; pure row-mappers (unit-tested) in `src/lib/admin/import/mappers.ts`.

**Where each category lands (this is the load-bearing part):**

| Category | Destination | Read by |
|----------|-------------|---------|
| `properties` | `properties` table (insert; re-import updates by `shop_id`+`name`) | DM AI `search_properties`, dashboard |
| `leads` | `leads` table — real columns (`customer_name`/`customer_phone`/`customer_email`/`budget_max`, `status` = `lead_status` enum). Existing phones are skipped, never overwritten | CRM |
| `contracts` | `property_contracts` — real columns (`customer_name`/`unit_number`/`prepayment_paid`/`paid_amount`/`balance`, `contract_status` = `active\|closed\|cancelled`). Re-import updates by `contract_number` | dashboard/contracts |
| `faq` | `shop_faqs` (upsert by question) | `WebhookService.getAIFeatures` → DM AI |
| `company`, `project`, `payment_policy`, `loan_info`, `amenities`, `ai_extra` | `shops.custom_knowledge` JSONB (merge, keys prefixed by project slug e.g. `mandala_garden_payment`) + `ai_knowledge_base` as structured archive | `PromptService.buildDynamicKnowledge` → DM AI prompt |

Rules that must not regress:
- **`shops.custom_knowledge` + `shop_faqs` + `properties` are the ONLY sources the FB/IG DM AI reads.** `ai_knowledge_base` is an archive (only competitors routes read it) — never write AI-facing knowledge only there.
- `projectId` is validated server-side against `projects` (must belong to the posted `shopId`) and stamped best-effort onto `properties`/`leads`/`property_contracts` (`project_id`, migration `20260707120000`); inserts retry without optional columns when a migration hasn't been applied yet.
- The `project` import category also upserts into the `projects` table (by `shop_id`+`name`) so imported projects appear in the project dropdown.
- `POST /api/admin/projects` requires an explicit `shop_id` when more than one shop exists (never silently attaches to the first shop).
- Excel date cells arrive as `Date` objects (`cellDates: true`) or serials — always go through `toDateStr`.

---

## Database (Supabase PostgreSQL)

Active migrations live in `supabase/migrations/`. Old e-commerce migrations are archived in `supabase/skipped_migrations/` for audit.

Key real-estate tables: `shops`, `properties`, `leads`, `property_viewings`, `customers`, `chat_history`, `ai_memory`, `roles`, `role_permissions`, `user_roles`, `push_subscriptions`, plus marketing/survey tables.

Note: the `customers` table still carries legacy e-commerce columns (`total_orders`, `total_spent`, `is_vip`). They are no longer read by the app and are scheduled for a future destructive migration.

Conventions: tables `snake_case` plural, columns `snake_case`, functions `snake_case`.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Security headers, image domains |
| `vercel.json` | Region (`sin1`), main-only deploys |
| `sentry.*.config.ts` | Sentry client/server/edge |
| `vitest.config.ts` | Vitest setup |
| `tsconfig.json` | `@/` → `src/` path alias |

---

## Code Conventions

- Imports use the `@/` alias (`@/lib/...`, `@/components/...`).
- Server components by default; `"use client"` only when interactive.
- Tailwind v4 — styles configured in `globals.css`, not a `tailwind.config.ts`.
- Icons: `lucide-react`. Toasts: `sonner`. Forms: `react-hook-form` + `zod`.
- API routes: validate input with Zod, return `{ error, details? }` on failure, use `createSupabaseServerClient()` for user-scoped calls and `supabaseAdmin()` for service-role/webhook calls.

---

## Recently Removed (do NOT reintroduce)

The following Syncly e-commerce surface was removed during the earlier `chore/remove-syncly-legacy` cleanup (now merged and the branch deleted):

- Pages: `dashboard/products`, `dashboard/orders`, `dashboard/comment-automation`, `dashboard/complaints`, `dashboard/subscription`, `setup/`, `test-ui/`
- API routes: `cart/*`, `orders/*`, `payment/*` (QPay), `dashboard/active-carts`, `dashboard/products`, `dashboard/orders`, `dashboard/comment-automations`, `dashboard/complaints`, `setup-shop`, `invoice`, `admin/plans`, `admin/subscriptions`, `cron/process-messages`, `cron/cleanup-orders`, `dashboard/reports` (the old e-commerce reports endpoint)
- Services: `CartService`, `ProductService`, `OrderService`, `StockService`, `CommentAutomationService`, `OrderNotificationService`
- AI: handlers under `lib/ai/tools/handlers/order/`, `CartHandlers`, `ProductHandlers`, `stockHelpers`, `discountExpiry`, `fuzzyMatch`, the abstract `providers/AIProvider` + `GeminiProvider`
- Components: `components/cart/`, `components/dashboard/AbandonedCartWidget`, `ActiveCartWidget`, `AutomationCard`, `BestSellersTable`, `RevenueStats`, `SmartInsights`, `products/ProductForm`, the e-commerce chat actions
- Hooks: `useActiveCarts`, `useProducts`, `useOrders`, `useUpdateOrder`, `useReports`, `useConfetti`, `useOnboardingState`
- Types: `Product`, `Order`, `OrderItem`, `OrderStatus`, `AIProduct`, `Cart`, `ActiveCart`, `CreateOrderData`, `OrderItemData`, `ProductImageData`

If you need to bring any of this back, do it intentionally — these were removed as a deliberate cleanup, not an oversight.

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Gemini
GEMINI_API_KEY=
# Загварын ID-г кодгүйгээр солих (заавал биш — анхдагч нь config/models.ts)
GEMINI_MODEL=
GEMINI_MODEL_PRO=

# Facebook / Instagram
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_VERIFY_TOKEN=
FACEBOOK_PAGE_ID=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# App
NEXT_PUBLIC_APP_URL=

# VAPID push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=

# Email (Resend) — EMAIL_FROM нь verify хийсэн домэйн (ж: mandala-garden.mn) байх ёстой
RESEND_API_KEY=
EMAIL_FROM=
DIGEST_EMAIL=

# Гадаад landing page-ээс лид хүлээн авах (/api/leads CORS)
LEAD_ALLOWED_ORIGINS=
LEAD_WELCOME_SITE_URL=

# Sentry (optional)
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

---

## Notes for Agents

1. **Check `middleware.ts`** before adding new routes — it controls auth and rate limits.
2. **Pick the right Supabase client** — browser vs server vs middleware vs service role.
3. **Tailwind v4** has no `tailwind.config.ts`; theme tokens live in `globals.css`.
4. **Dev port is 3001**, not the Next.js default 3000.
5. **All user-facing copy is in Mongolian** — keep that consistent.
6. **`@/` path alias** maps to `src/`.
7. **Vercel deploys only `main`** to the `sin1` region.
8. **Adding an AI tool touches 5 files** — `data-assistant/tools.ts` (definition,
   `WRITE_TOOL_NAMES`, `TOOL_MODULE_MAP`), `riskTiers.ts`, the dispatch in
   `data-assistant/index.ts`, the implementation, and an agent's tool list in
   `orchestrator/agents.ts`. Two drift-guard test suites fail if you miss one.
9. **Every new write path needs a `recordActivity` call** — otherwise the work is
   invisible to the oversight layer.
10. The `shops` table is intentionally still load-bearing — a full multi-tenant rework is a planned follow-up, not in scope for routine changes.
