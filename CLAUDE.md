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
| AI | Claude via `@anthropic-ai/sdk` (dashboard туслах) · Google Gemini via `@google/generative-ai` (FB/IG DM) | 0.125 · 0.24.1 |
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

### Dashboard AI туслах v3 — Claude гибрид orchestrator (`/dashboard/ai-assistant`, branch `feat/ai-v3-claude`)
Модель: **Claude** (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`; `AI_MODEL` анхдагч `claude-opus-5`, `AI_FAST_MODEL` анхдагч `claude-sonnet-5`). Gemini зөвхөн FB/IG DM AI (`AIRouter`)-д үлдсэн. Бүрэн review: `docs/AI-REVIEW-2026-09-12.md`.
- **Бүтэц** (`src/lib/ai/orchestrator/`): `index.ts` (`runOrchestrator`) → `loop.ts` (`runLoop` — Claude streaming agentic loop, parallel tool_use, ≤8 раунд, `ask_user` дээр зогсоно) → `executeDataTool` (`lib/ai/data-assistant`, confirm=false → preview → pendingAction). Planner/synthesizer байхгүй: үндсэн туслах RBAC-д тохирсон БҮХ data tool-той (`lib/ai/claude/tools.ts` `dataToolsForPerms`, Gemini schema → `input_schema` хөрвүүлэлт) + `ask_user` (тодруулга → UI chip) + `delegate_to_specialists` (нарийн олон домэйны асуултад `agents.ts` registry-ийн дэд агентуудыг `runAgent.ts`-ээр Sonnet дээр ЗЭРЭГ ажиллуулж, үр дүнг өөрөө нэгтгэнэ).
- **Prompt** (`prompt.ts`): тогтмол persona+домэйн блок `cache_control`-той эхэнд, shop мэдлэг + `ai_shop_memory` дараа нь, огноо/хэрэглэгч/ярианы хураангуй ХАМГИЙН СҮҮЛД. Claude Opus 5 `temperature` хүлээж авахгүй — `effort` хэрэглэнэ. Алдааг `lib/ai/claude/client.ts` `describeClaudeError` (typed SDK class) — regex string-matching бүү бич.
- **Санах ой** (`memory.ts`): 24+ мессежтэй яриаг Sonnet-оор хураангуйлж `ai_conversations.summary`/`summary_message_count`-д (migration `20260912120000`, best-effort) хадгална; хүсэлт бүрт хураангуй + сүүлийн 20 мессеж. `http.ts` `prepareAssistantRequest` уншина, `persistAssistantExchange` → `maybeUpdateSummary`.
- **SSE event-үүд**: `status`, `tool_start`/`tool_done` (inline «Лид хайж байна… → 12 лид олдлоо»), `step_start`/`step_done` (дэд агент), `token`/`token_reset`, `clarify`, `done` (+`clarification`), `error` (+`code`). UI: `components/ai/AiChat.tsx` (`ActivityView`, тодруулгын chip, олон үйлдэлд «Бүгдийг зөвшөөрөх»; гүйцэтгэсэн/цуцалсан үйлдлийн төлөв дараагийн хүсэлтийн түүхэнд `[Үйлдлийн төлөв: …]` болж ордог), `components/ai-assistant/OrchestrationTrace.tsx` (model, rounds, tools, steps, cache токен).
- **Dev mock**: development-д `localStorage.vertmonhub_ai_mock = ok|error|delegate|clarify` → client `x-ai-mock` header → stream route Claude дуудахгүй; түлхүүргүй орчинд ч ажиллана. Production-д хэзээ ч идэвхгүй.
- **Баталгаажуулалтын бодлого**: 2026-09-11 Wave 0/1 нь БҮХ write tool-ыг confirm-gated болгосон (`executeDataTool` confirm=false → preview). v3 үүн дээр `AUTO_TOOL_NAMES` (tools.ts) нэмсэн: буцаах боломжтой, эрсдэл багатай tool-уудыг loop confirm=**true**-ээр шууд дуудна (audit бичигдэнэ) — эзний «хэлээд хийлгэх» шаардлага. Устгах/гэрээ/төлбөр/гадагш илгээх хэзээ ч AUTO биш.
- **Service давхарга (wave 1, 2026-09-12)**: уулзалт/ажил/төлбөр/дуудлагын логик `lib/services/{ViewingService,TaskService,PaymentService}.ts` + `lib/leads/activities.ts` (`recordLeadContact`)-д — API route ба AI tool (`lib/ai/data-assistant/actions.ts`) ХОЁУЛАА эндээс дамжина; шинэ tool нэмэхдээ route-ийн логикийг давхардуулахгүй, service гарга. Wave 1 tool-ууд: `list_viewings`, `list_my_tasks`, `list_contract_payments` (read); `log_call`, `set_followup`, `record_viewing_outcome`, `create_task`, `complete_task` (**AUTO** — `AUTO_TOOL_NAMES`, картгүй шууд гүйцэтгэгдэнэ, audit бичигдэнэ); `assign_lead_manager`, `reschedule_viewing`, `add_contract_payment`, `mark_payment_paid` (confirm). `riskTiers.ts` WRITE жагсаалтыг tools.ts-тэй тэнцүү байлгах (drift тест).
- **Хэвээр**: confirm-gated үйлдлийн урсгал (`POST /api/ai-assistant/action`, RBAC дахин шалгана, soft delete, `logAiAudit`), tool нэрсийн олонлог (`WRITE/DELETE/ADMIN/MUTATING_TOOL_NAMES`), хавсралт (зураг/PDF base64 блок), `remember_fact` shop memory, контекст тэмдэглэл (`buildContextNote`). Unit test: `src/lib/ai/orchestrator/__tests__`.

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
| `lib/auth/supabase-auth.ts` → `createSupabaseMiddlewareClient` | Edge middleware (session refresh); the old `supabase-middleware.ts` was dead and is deleted |
| `supabase.ts` | Service-role (webhooks, admin operations) |

### Dashboard auth header
Dashboard API routes accept the active shop via `x-shop-id` header. The browser reads `localStorage.getItem('vertmonhub_active_shop_id')` and attaches it to fetches.

### Design system v2 (2026-09, branch `feat/redesign-v2`)
The «Editorial Terracotta» direction (docs/UI-REDESIGN-PLAN.md) is **superseded**. v2 = Linear/Notion-style: cool neutral ground, **Vertmon blue `#2D6FE6` as the only accent**, borders over shadows, dense rows. Everything is driven from the primitive tokens in `src/app/globals.css` (`:root` light + `.dark`/`[data-theme=dark]` + `prefers-color-scheme` fallback) through the unchanged `@theme inline` semantic layer — so the 900+ `text-muted-foreground` / `bg-surface` call sites repaint without edits. Rules:
- Fonts: **Golos Text** (UI, Cyrillic) + **JetBrains Mono** (numbers/dates/IDs) via `next/font` in `src/app/layout.tsx`. The serif display face is retired; `font-display`/`.heading-display` now resolve to the UI face.
- Density ladder lives in tokens: `--control-h-xs 26 / --control-h-sm 30 / --control-h 34 / --control-h-lg 44`, `--row-h 36`, `--row-h-head 32`, `--header-h 3.25rem` (constant at every breakpoint — `ai-assistant/layout.tsx` depends on it), `--sidebar-w 14.5rem` (driven at runtime by `useSidebarCollapsed`, rail = 3.75rem). Radii compressed to 4/5/6/8/10/12/16.
- New utilities: `.num` (tabular figures), `.mono-label`, `.focus-ring` (the one focus style). Never introduce raw Tailwind palette colors or gradients; status colors come from `--status-*` only.

### Navigation v2 — one sidebar, 8 items
`src/lib/navigation/nav.ts` is the single source of truth (the three-workspace `workspaces.ts` + `WorkspaceSwitcher` were deleted). `PRIMARY_NAV` = Өнөөдөр · Лид · Уулзалт · Гэрээ · Байр · Inbox · Тайлан · Маркетинг; `BOTTOM_NAV` = AI туслах · Тохиргоо; `MOBILE_TABS` = first three + a centre «+» FAB + «Бусад» sheet. Rarely used pages (finance/ERP, procurement, surveys, competitor research, customer-service, marketing sub-pages, AI settings, tasks) are **not in the sidebar** — they live in `SECONDARY_ROUTES` and are reachable via ⌘K (`CommandPalette`), the mobile «Бусад» sheet, or direct URL. RBAC filtering happens in `Sidebar`/`MobileNav`/`CommandPalette` via `canAccessModule(Dynamic)`. Helpers: `isNavItemActive`, `findNavItem`, `getBreadcrumb` (max 3 crumbs, rendered in `Header` on every breakpoint), `getNavTitle`. Unit tests: `src/lib/navigation/__tests__/nav.test.ts`.
- Live sidebar counts come from `GET /api/dashboard/nav-counts` (`useNavCounts`, react-query, 60s stale): new leads, today's scheduled viewings, customers with `ai_paused_until > now` (= human handling inbox).
- **Quick create**: `openQuickCreate('lead'|'meeting'|…)` (`src/lib/navigation/commandPalette.ts`, window events) is fired by the header «Шинэ» button, the `N` key, the mobile FAB and ⌘K. `QuickCreateSheet` (mounted once in `AppShell`) posts to `POST /api/dashboard/leads` and checks duplicates with `GET /api/dashboard/leads?phone=…` (format-agnostic match) before saving. `?q=` is a name/phone/email search on the same endpoint.
- All browser → dashboard API calls should go through `src/lib/api/dashboardFetch.ts` (`dashboardFetch` / `dashboardJson` / `dashboardMutate`), which attaches `x-shop-id` automatically — stop hand-writing the header.

### Leads v2 («Лид», W2)
`/dashboard/leads` renders `components/leads/LeadsPage.tsx`: saved views as tabs (`LEAD_VIEWS` → API `?view=all|mine|new|meetings|active`, counts from `GET /api/dashboard/leads/summary`), filter chips, debounced `?q=`, server sort (`?sort=&dir=`), 25/page. Two layouts the user toggles (persisted in `localStorage vertmonhub_leads_mode`): **table** (row click → `Sheet` with `LeadPanel`) and **split** (persistent right panel). `?lead=<id>` deep-links a lead (used by QuickCreateSheet's duplicate «Нээх» and Today); `?new=1` opens the quick-create sheet (`/dashboard/leads/new` now redirects there).
- Inline edits go through `useUpdateLead` (optimistic list/detail cache update, then invalidate `leads/*`, `nav-counts`, `my-stats`). `StatusPicker` asks for `lost_reason` inline when choosing «Алдсан»; `ManagerPicker` needs `GET /api/dashboard/managers` (reports module) — hidden otherwise. Bulk bar = the same pickers over the checked rows.
- `LeadPanel` = facts (status/manager/interest/budget inline), actions (Уулзалт товлох → `/dashboard/viewings?lead=&new=1`, Гэрээ үүсгэх → `/dashboard/contracts/generate?lead=`), note/call composer, timeline, interested properties. Data: `GET /api/dashboard/leads/[id]` (lead + viewings + contracts + activities + property, each sub-query fail-soft).
- **Timeline table** `lead_activities` (migration `20260910120000`, RLS by shop membership, append-only): `POST /api/dashboard/leads/[id]/activities` (`note` | `call`, optional `next_followup_at`; a `call` stamps `last_contact_at`), and `PATCH /api/dashboard/leads/[id]` auto-logs `status` / `manager` changes. Helpers in `lib/leads/activities.ts` are best-effort (missing table → silently empty). All lead vocabulary (status/source/interest labels, tones, views) lives in `lib/leads/labels.ts` — never add a page-local label map.
- Interest is stored as `preferred_rooms` (1–4) or `preferred_type` (`office`), shown via `interestLabel()`.

### Meetings + contracts v2 («Уулзалт» / «Гэрээ», W3)
- **Viewings** now go through an API instead of the browser Supabase client: `GET /api/dashboard/viewings?range=today|upcoming|past|all&status=&manager=&lead=` (joins lead + property, returns tab counts), `POST /api/dashboard/viewings` (finds/creates the lead by phone→name, stamps the canonical manager server-side, sets `leads.status=viewing_scheduled` for new/contacted leads, logs a `meeting` activity; `walk_in=true` records a completed meeting with outcome), `PATCH /api/dashboard/viewings/[id]` (status/time/outcome, syncs `leads.last_contact_at` / `viewing_scheduled_at` / optional `next_followup_at`, logs the outcome). UI: `components/viewings/ViewingsPage.tsx` (day-grouped list, create sheet with property typeahead via `GET /api/dashboard/properties/search?q=`, outcome sheet with interest 1–5 + follow-up chips). `?lead=<id>&new=1` opens the create sheet prefilled from the lead. Labels in `lib/viewings/labels.ts`.
- **Contracts**: list = `components/contracts/ContractsPage.tsx` (KPI strip from the API's `stats`, filters, search, server sort; `GET /api/dashboard/contracts?page=&pageSize=` now returns a page + `pagination` while still computing stats over all rows). Detail = full page `/dashboard/contracts/[id]` (`components/contracts/ContractDetail.tsx`): general grid, payment schedule from `GET/POST/PATCH /api/dashboard/contracts/[id]/payments` (inline add row, «Төлсөн» marks a row paid), progress, `EntityAttachments`, timeline merged from the linked lead's activities + paid installments. «PDF татах» links to `/dashboard/contracts/generate` with the buyer/unit fields prefilled; the generator also accepts `?lead=<id>`.
- Date/time helpers are v2 now: `formatTime` = 24h `HH:mm` and `formatShortDate` = `YYYY-MM-DD`, both in Asia/Ulaanbaatar; `formatRelativeDays` for «Сүүлд холбогдсон» columns.

### AI assistant v2 — side panel, streaming, context (branch `feat/ai-v2`)
- **UI**: `components/ai/AiPanel.tsx` is mounted once in `AppShell` and opens from the sidebar «AI туслах» row, ⌘J, the mobile «Бусад» sheet, or `openAiPanel(prompt?)` (`lib/ai/context.ts`). It stays mounted when closed (conversation survives). `components/ai/AiChat.tsx` is the shared chat (also used by the full page `/dashboard/ai-assistant` with `ConversationSidebar` history); `components/ai/AiComposer.tsx` handles text + image/PDF uploads.
- **Context awareness**: pages call `useRegisterAiContext({type:'lead'|'contract'|'today'|'dashboard', id, label})` (LeadPanel, ContractDetail, TodayDashboard, DirectorDashboard). The panel shows a context chip + `suggestionsFor(ctx)` one-click prompts, and the server prepends a `[КОНТЕКСТ]` note with the entity id so agents call `get_lead_details` / `get_contract_details` with the right id (`buildContextNote` in `lib/ai/orchestrator/http.ts`).
- **Streaming**: `POST /api/ai-assistant/stream` (SSE) runs the orchestrator with `ctx.onEvent` (`OrchestratorEvent`: plan → step_start → tool → step_done → synthesis_start → token/token_reset) and ends with `done` (same payload as the JSON route) or `error`. Single-agent plans stream the agent's final text (`streamFinal`), multi-agent plans stream the synthesis. The JSON `POST /api/ai-assistant` still works; both share `prepareAssistantRequest` / `persistAssistantExchange` in `lib/ai/orchestrator/http.ts`. Client: `streamAssistant` in `lib/ai/client.ts` (90s timeout, abort, friendly errors).
- **Actions**: mutating tools still return previews; `AiChat` renders them as cards (Зөвшөөрөх / Болих / Үргэлж зөвшөөрөх → `POST /api/ai-assistant/action`, RBAC re-checked server-side). `lib/ai/allowedTools.ts` remembers «always allow» per session.
- **Dev mock**: in development only, a request header `x-ai-mock: ok|error` makes the stream route emit a scripted run without calling Gemini — use it to exercise the UI. Never available in production.
- **Environment (2026-09-12)**: dashboard туслах Claude руу шилжсэн (`ANTHROPIC_API_KEY`). `GEMINI_API_KEY` одоогоор хүчингүй (`API key not valid`) тул FB/IG DM AI ажиллахгүй — тусад нь шийдэх.
- `/dashboard/ai-assistant/agents` lists the real orchestrator agents from `GET /api/ai-assistant/agents` (static `AGENTS` definitions, tool permissions per agent); the old `ai_agents` table page is gone.

### Server-side dates = Asia/Ulaanbaatar (2026-09-11)
Vercel runs in UTC, so `new Date().setHours(0,0,0,0)` on the server is 08:00 Ulaanbaatar and «өнөөдөр» was wrong between 00:00–08:00 UB. Every server-side day/month boundary must use the helpers in `src/lib/utils/date.ts`: `ubStartOfDay`, `ubDayRange`, `ubDateStr`, `ubMonthRange`, `ubParts` (`getStartOfToday/getStartOfPeriod` now delegate to them). Vitest pins `process.env.TZ = 'Asia/Ulaanbaatar'` so local-date fixtures match. Never write `setHours(0, 0, 0, 0)` or `new Date(y, m, 1)` in API routes, libs or crons.

### Auth / tenant rules that must not regress (2026-09-11 review, `docs/REVIEW-2026-09-11.md`)
- No custom session cookie: the `vertmon-session` cookie is dead; `middleware.ts`, `resolve-user.ts`, `admin/auth.ts` and the marketing routes only trust Supabase `getUser()`.
- Every `/api/*` handler self-authenticates: reads use `requireModule(...)` / `requireAnyModule([...])`, writes `requireModuleWrite(...)` / `requireWrite()`, deletes `requireModuleDelete(...)` (`src/lib/auth/require-permission.ts`), then `getUserShop()` (validates `x-shop-id` against owner ∪ `shop_members`). Public landing-page edits are super_admin only.
- Cron routes use `isAuthorizedCron()` (`src/lib/auth/cron.ts`): timing-safe compare, **fails closed** unless `NODE_ENV === 'development'`. `CRON_SECRET` must be set in Vercel prod. Secrets/signatures are compared with `safeEqual` (`src/lib/crypto/safe-equal.ts`).
- `PATCH` bodies never go straight into `.update()` — use a Zod allow-list (see `UpdatePaymentScheduleSchema`).
- Storage: the `products` bucket policies are shop-folder scoped (migration `20260911120000`); server uploads go through `/api/dashboard/upload` (MIME allow-list, ≤4MB) and `/api/properties/upload`.
- DM bot (`ToolExecutor.check_payment_status`) only reveals contract finances when **contract number + registered phone both match**; `request_human_support` pauses the bot (`ai_paused_until` +30 min).
- Browser code never hand-writes `x-shop-id` or reads `vertmonhub_active_shop_id` — use `dashboardFetch`/`dashboardJson`/`dashboardMutate` (lint-enforced).

### Rate limiting (middleware)
- **Strict:** `/api/chat`, `/api/ai*`
- **Webhook:** `/api/webhook`
- **Standard:** everything else under `/api/`

---

## RBAC

Defined in [src/lib/rbac.ts](src/lib/rbac.ts). Modules:

```
dashboard, properties, leads, viewings, contracts, customers,
inbox, reports, reports-leads, marketing-roi, surveys,
ai-assistant, ai-settings, settings
```

Static fallback roles: `super_admin`, `admin`, `sales_manager`, `marketing`, `viewer`. The runtime first tries to load permissions from the `roles` / `role_permissions` / `user_roles` tables and falls back to the static map if Supabase is unreachable.

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
- Excel date cells arrive as `Date` objects or serials — always go through `toDateStr`.
- **Excel I/O goes through `src/lib/utils/xlsx.ts`** (`readSheetRows`, `readSheetCsv`, `buildWorkbookBuffer`, built on `exceljs`; SheetJS `xlsx` was removed for an unfixable prototype-pollution/ReDoS advisory). `.xls` (Excel 97-2003) is **not** readable — upload routes return 400 asking for `.xlsx`/`.csv`; CSV/TSV is parsed via `csv-parse`.

---

## Database (Supabase PostgreSQL)

Active migrations live in `supabase/migrations/`. Old e-commerce migrations are archived in `supabase/skipped_migrations/` for audit.

Key real-estate tables: `shops`, `properties`, `leads`, `property_viewings`, `customers`, `chat_history`, `ai_memory`, `roles`, `role_permissions`, `user_roles`, `push_subscriptions`, plus marketing/survey tables.

Notes (verified against the live DB on 2026-09-11):
- Legacy e-commerce/SaaS objects are **gone** (migration `20260911140000`: `orders`, `order_items`, `products`, `discount_schedules`, `pending_messages`, `ai_documents`, `ai_agents`, `satisfaction_surveys`, `email_logs`, `facebook_tokens`, `user_facebook_pages`, `hubspot_contacts`, `ai_analytics`, `conversion_funnel`, `ab_experiments*`, views `lead_funnel`/`customer_service_dashboard`, 11 dead functions). Backup JSON/SQL lives in `supabase/backups/2026-09-11-legacy/` (git-ignored). `customers.total_orders/total_spent/is_vip` were dropped in `20260608160000`. The phantom SaaS objects (`admins`, `plans`, `subscriptions`, `invoices`, `ai_memory`, `exec_sql`) never existed — do not write code that queries any of these.
- `node scripts/rls-audit.mjs` — read-only RLS/view audit against `DATABASE_URL` (exit 1 when a table lacks RLS or a view is not `security_invoker`).
- `properties` (listing with images) is **empty** in prod; the real inventory is `property_units` (2 500+ units, `property_block_summary` view). The DM bot's `search_properties` / `schedule_viewing` and the prompt's inventory summary fall back to `property_units`.
- Migrations are applied with node + `pg` over `DATABASE_URL` (no CLI). **Always record the version in `supabase_migrations.schema_migrations`** (the apply script in the 2026-09-11 session did this; history was stale before). Schema-only, additive DDL; data changes are separate, explicitly approved statements.
- `rate_limits` is cleaned by the `data-cleanup` cron (pg_cron was not running); `leads.client_request_id` is the idempotency key for lead creation.

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

**Removed in the 2026-09-11 review waves (branch `fix/wave-0-security`, see `docs/REVIEW-2026-09-11.md`):** `api/ai-assistant/analyze-messages` (unauthenticated), `api/admin/setup` (bootstrap backdoor against a nonexistent `admins` table), `api/features` + `FeatureGate` + `useFeatures` (phantom `plans` gating), the `vertmon-session` cookie readers, `sentry.client.config.ts` (replaced by `src/instrumentation-client.ts`), the data-assistant `list_orders`/`get_product_stats` tools, the webhook `ORDER_` postback, 32 zero-importer files (`components/charts/*`, `components/chat/*`, `NotificationButton`, `ThemeToggle`, `ConversationItem`, `EmptyCart`, `useDashboard`, `usePWAInstall`, `lib/ai/{index,analytics,experiments,resilience,services/ProductParser,tools/index,tools/definitions/customer,config/index,helpers/index}`, `lib/{errors,monitoring,services,webhook}/index`, `lib/webhooks`, `lib/supabase-middleware`, `lib/utils/{ai-preview,api-response,mobile-utils}`, `lib/validations/index`), the stale e2e specs (`workspace-switcher`, `admin-plan-change`, `ui_playground`), root scripts `check-db.ts`/`add_envs.sh`/`update_landing.js`, and the deps `@supabase/auth-helpers-nextjs`, `jsonwebtoken`, `puppeteer`. The HubSpot/contract PII CSVs were untracked (`.gitignore` now blocks `*.csv`, `REPORTS/*`) — the git history still has to be purged (`git filter-repo`), which needs the owner's go-ahead.

**Removed in the v2 redesign (2026-09-10, branch `feat/redesign-v2`):** the three-workspace navigation (`lib/navigation/workspaces.ts`, `useActiveWorkspace.ts`, `WorkspaceSwitcher`), the v1 dashboards (`OrgDashboard`, `components/dashboard/my/*`, `AskAIHero`, `TeamOverview`, `SalesChart`, `AIMonitor`, `SalesTargetWidget`, `useDashboardPrefs`), dead primitives (`ui/Avatar`, `BottomSheet`, `Breadcrumb`, `Label`, `LiveIndicator`, `PullToRefresh`, `RadioGroup`, `Separator`, `Tooltip`), dead dashboard/chat components (`ActionCenter`, `ConversationList`, `FloorPlan`, `MessageThread`, `ShopSwitcher`, `chat/ChatContainer`), and the `src/app/test/*` playground routes. The `user_dashboard_prefs` table + `/api/dashboard/prefs` still exist but have no UI.

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude (dashboard AI туслах)
ANTHROPIC_API_KEY=
# AI_MODEL=claude-opus-5 / AI_FAST_MODEL=claude-sonnet-5 (заавал биш)

# Gemini (FB/IG DM AI)
GEMINI_API_KEY=

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
LEAD_SHOP_ID=              # олон shop-той үед public лидийн эзэн shop (байхгүй бол хамгийн эртний shop)
TURNSTILE_SECRET_KEY=      # зөвлөмжтэй: тохируулмагц public /api/leads captcha шаардана (байхгүй бол origin allowlist + rate limit + honeypot л)

# Cron (Vercel Cron → Authorization: Bearer $CRON_SECRET) — prod-д ЗААВАЛ, байхгүй бол cron 401
CRON_SECRET=

# Sentry source map upload (заавал биш; байхгүй бол upload алгасна)
SENTRY_ORG=
SENTRY_PROJECT=

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
8. The `shops` table is intentionally still load-bearing — a full multi-tenant rework is a planned follow-up, not in scope for routine changes.
9. **Current improvement plan:** `docs/REVIEW-2026-09-11.md` (Wave 0–3). Wave 0/1 and part of Wave 2 are done on `fix/wave-0-security`; §8 of that doc tracks what is still open (git history PII purge, browser-Supabase → API routes, `/api/me`, UI consolidation, tests for RBAC/RLS).
10. Sentry only works through `src/instrumentation.ts` + `src/instrumentation-client.ts` + `withSentryConfig` in `next.config.ts` — never add root-level `sentry.*.config.ts` files that nothing imports.
11. Prod DB facts are in the auto-memory note `live-db-state-2026-09-11` and §7.1 of the review doc; check them before writing DB-dependent code.
