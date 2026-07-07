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

### Dashboard AI Orchestrator (`/dashboard/ai-assistant`)
The internal staff assistant is a **multi-agent orchestrator** (`src/lib/ai/orchestrator/`), not a manual dual-mode chat anymore. Reliability: all Gemini calls (planner, agents, synthesizer) use `withRetry` (`orchestrator/retry.ts`, backoff on 429/503); agent history is capped to the last 10 messages for token control. Markdown answers render via a dependency-free renderer (`components/ai-assistant/MarkdownMessage.tsx`). An admin-only audit view lives at `/dashboard/ai-assistant/audit` (`GET /api/dashboard/ai-audit`, reads `ai_audit_log`). Orchestrator unit tests: `src/lib/ai/orchestrator/__tests__`. Flow:
1. `POST /api/ai-assistant` (RBAC `ai-assistant`, shop-scoped) calls `runOrchestrator()`.
2. **Planner** (`planner.ts`) analyzes the request → JSON plan selecting 1–3 specialized agents.
3. **Agents** (`agents.ts`): `data-analyst`, `property-expert`, `crm-specialist`, `finance-analyst`, `advisor`, `operations-admin` (super_admin), `marketing-specialist`. Each has a focused Mongolian system prompt + a curated subset of the shared data-assistant tools. They run via the generic `runAgent.ts` (reuses `executeDataTool` from `lib/ai/data-assistant`; write tools gated by `perms.canWrite`).
   - Marketing: `get_marketing_summary` (read), `create_social_post` (confirm-gated draft/scheduled into `social_posts`).
   - **Long-term shop memory**: `ai_shop_memory` table (migration `20260617180000`); `remember_fact` tool (executes directly, `canWrite`) stores key→value; `getShopMemory`/`formatShopMemory` inject it into every run's context. Attachments shown on detail pages via `EntityAttachments` + `GET /api/dashboard/ai-attachments`. Proactive daily push digest: `GET/POST /api/cron/ai-digest` (vercel.json cron, `CRON_SECRET`).
4. **Synthesizer** merges multi-agent output into one answer (skipped for single-agent).
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
8. The `shops` table is intentionally still load-bearing — a full multi-tenant rework is a planned follow-up, not in scope for routine changes.
