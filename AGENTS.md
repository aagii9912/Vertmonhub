# CLAUDE.md — Vertmon Hub Project Intelligence

> Single source of truth for any AI agent working on the Vertmon Hub codebase.
> Read this FIRST before making changes. Keep it current as the project evolves.

---

## Project Overview

**Vertmon Hub** is an AI-powered Real Estate Sales & CRM Platform. Real estate sales managers use it to manage properties, handle Facebook/Instagram DM leads via an AI agent, schedule viewings, track contracts, and run marketing.

- **Repo:** https://github.com/aagii9912/smarthub.git
- **UI Language:** Mongolian (all labels, comments and content)
- **Branch under active cleanup:** `chore/remove-syncly-legacy` (removes leftover Syncly e-commerce code)

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
npm run lint           # next lint
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

The following Syncly e-commerce surface was removed in [chore/remove-syncly-legacy](#):

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
