# CLAUDE.md — Syncly Project Intelligence

> This file is the **single source of truth** for any AI code agent working on the Syncly codebase.
> Read this FIRST before making any change. Keep it updated when the project evolves.

---

## 🎯 Project Overview

**Syncly** is an AI-powered Social Commerce platform that manages Facebook Messenger & Instagram DM conversations with an AI sales agent, backed by a full admin dashboard.

- **Live URL:** https://www.syncly.mn
- **Repo:** https://github.com/aagii9912/smarthub.git
- **Language:** Монгол (UI text, comments, docs are in Mongolian)

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.1 |
| UI | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Database | Supabase (PostgreSQL + RLS) | — |
| Auth | Supabase Auth (Email, Google, Facebook OAuth) | 0.8.0 |
| AI | Google Generative AI (`@google/generative-ai`) + Vercel AI SDK | 0.24.1 / 6.0.33 |
| Validation | Zod | 4.x |
| ORM | Drizzle ORM | 0.45.1 |
| Monitoring | Sentry (client + server + edge) | 10.34.0 |
| Email | Resend | 6.7.0 |
| Push | Web Push (VAPID) | 3.6.7 |
| Testing | Vitest (unit) + Playwright (E2E) | 4.x / 1.58.x |
| Deployment | Vercel (sin1 region) | — |

---

## 🚀 Commands

```bash
# Development (runs on port 4001)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Type check
npm run typecheck

# Unit tests
npm run test

# E2E tests
npm run test:agent
```

---

## 📁 Source Structure (ACTIVE — use these)

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # 26 API route groups
│   │   ├── webhook/              # Facebook/IG webhook handler
│   │   ├── chat/                 # AI chat endpoint
│   │   ├── dashboard/            # Dashboard data APIs (stats, products, orders, customers, reports, export)
│   │   ├── admin/                # Super admin APIs
│   │   ├── orders/               # Order management
│   │   ├── cart/                 # Shopping cart
│   │   ├── facebook/             # FB page connection
│   │   ├── payment/              # QPay payment
│   │   ├── subscription/         # Plan management
│   │   ├── ai-settings/          # AI config save
│   │   ├── push/                 # Push notification subscribe/send
│   │   ├── cron/                 # Scheduled jobs (process-messages, daily @ midnight)
│   │   ├── health/               # Health check
│   │   ├── feedback/             # User feedback
│   │   ├── invoice/              # Invoice APIs
│   │   ├── shop/                 # Shop CRUD
│   │   ├── setup-shop/           # Shop onboarding
│   │   ├── user/                 # User APIs
│   │   ├── features/             # Feature flags
│   │   ├── leads/                # Lead management
│   │   ├── meta/                 # Meta data deletion callback
│   │   ├── auth/                 # Auth callback APIs
│   │   ├── docs/                 # API docs page
│   │   ├── debug/                # Debug endpoints (dev only)
│   │   └── debug-auth/           # Auth debug (dev only)
│   │
│   ├── dashboard/                # Dashboard pages
│   │   ├── page.tsx              # Main dashboard (stats overview)
│   │   ├── layout.tsx            # Dashboard layout (sidebar, header)
│   │   ├── products/             # Product management
│   │   ├── orders/               # Order management
│   │   ├── customers/            # CRM / customer list
│   │   ├── inbox/                # Chat inbox (all conversations)
│   │   ├── ai-settings/          # AI configuration
│   │   ├── comment-automation/   # FB/IG comment automation
│   │   ├── complaints/           # Complaint management
│   │   ├── reports/              # Sales reports
│   │   ├── settings/             # Shop settings
│   │   └── subscription/         # Subscription/plan management
│   │
│   ├── admin/                    # Super admin panel
│   ├── auth/                     # Login, Register, OAuth callback pages
│   ├── setup/                    # Shop setup wizard
│   ├── page.tsx                  # Landing page (marketing)
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles + Tailwind
│
├── lib/                          # Core business logic (MAIN CODE AREA)
│   ├── ai/                       # AI module — Router, Providers, Tools, Handlers
│   ├── facebook/                 # Meta Graph API helpers (messenger.ts)
│   ├── webhook/                  # WebhookService + RetryService
│   ├── services/                 # Business services — CartService, OrderService, ProductService
│   ├── auth/                     # Auth helpers
│   ├── payment/                  # Payment processing
│   ├── invoice/                  # Invoice generation
│   ├── email/                    # Resend email helpers
│   ├── monitoring/               # Sentry helpers
│   ├── validations/              # Zod schemas
│   ├── utils/                    # Rate limiter, general helpers
│   ├── constants/                # App constants
│   ├── landing/                  # Landing page utils
│   ├── supabase.ts               # Base Supabase client (service role)
│   ├── supabase-browser.ts       # Browser Supabase client
│   ├── supabase-server.ts        # Server-side Supabase client
│   ├── supabase-middleware.ts    # Middleware Supabase client
│   ├── notifications.ts          # Push notification helpers
│   └── plan-limits.ts            # Subscription plan limits
│
├── components/                   # React components
│   ├── ui/                       # Base UI primitives (buttons, inputs, cards, etc.)
│   ├── chat/                     # Chat/inbox components
│   ├── dashboard/                # Dashboard-specific widgets
│   ├── cart/                     # Cart components
│   ├── onboarding/               # Setup wizard components
│   ├── empty-states/             # Empty state illustrations
│   ├── feedback/                 # Feedback components
│   ├── providers/                # React providers
│   ├── setup/                    # Setup components
│   ├── FeatureGate.tsx           # Feature gating by plan
│   ├── NotificationButton.tsx    # Push notification UI
│   ├── PWAInstallPrompt.tsx      # PWA install prompt
│   ├── ServiceWorkerRegistration.tsx
│   └── UpgradePrompt.tsx         # Plan upgrade prompt
│
├── contexts/                     # React contexts (AuthContext)
├── hooks/                        # Custom React hooks
├── types/                        # TypeScript type definitions
├── middleware.ts                 # Auth + Rate limiting middleware
└── test/                         # Test utilities
```

---

## 🔑 Key Architecture Decisions

### Authentication
- **Supabase Auth** — Email/Password, Google OAuth, Facebook OAuth
- Middleware (`src/middleware.ts`) protects `/dashboard`, `/setup`, `/admin` routes
- Unauthenticated users are redirected to `/auth/login`

### AI Message Flow
1. Customer sends message via Messenger/Instagram DM
2. Meta webhook POSTs to `/api/webhook`
3. `WebhookService` verifies signature, saves message, loads shop config
4. `AI Router` gathers context (products, cart, customer memory)
5. Google Gemini generates response with Function Calling (search products, add to cart, create orders, check stock)
6. Response is sent back via Meta Graph API

### Supabase Clients (4 variants)
| File | Used For |
|------|---------|
| `supabase-browser.ts` | Client-side React components |
| `supabase-server.ts` | Server Components, API routes (user context) |
| `supabase-middleware.ts` | Next.js middleware (session refresh) |
| `supabase.ts` | Service-role operations (admin, webhooks) |

### API Authentication
- All `/api/dashboard/*` endpoints require authenticated user
- Shop context is passed via `x-shop-id` header (from `localStorage.getItem('smarthub_active_shop_id')`)

### Rate Limiting (Middleware)
- **Strict**: `/api/chat`, `/api/ai` routes
- **Standard**: All other API routes
- **Webhook**: `/api/webhook`, `/api/subscription/webhook`, `/api/payment/webhook` (relaxed)

---

## 🗄️ Database (Supabase PostgreSQL)

- **58 migration files** in `supabase/migrations/`
- Row Level Security (RLS) enabled on all tables
- Key tables: `shops`, `products`, `product_variants`, `orders`, `order_items`, `customers`, `conversations`, `messages`, `carts`, `cart_items`, `subscriptions`, `plans`, `push_subscriptions`, `comment_automations`, `complaints`, `feedback`, `invoices`, `ai_analytics`, `landing_content`

### Database Naming Conventions
- Tables: `snake_case` plural (e.g., `order_items`)
- Columns: `snake_case` (e.g., `created_at`, `shop_id`)
- Functions: `snake_case` (e.g., `decrement_stock`)

---

## ⚙️ Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Security headers (CSP, XSS, etc.), image domains, bundle analyzer |
| `vercel.json` | Deployment: sin1 region, CRON job (daily midnight), main branch only |
| `sentry.client.config.ts` | Client-side error tracking |
| `sentry.server.config.ts` | Server-side error tracking |
| `sentry.edge.config.ts` | Edge runtime error tracking |
| `vitest.config.ts` | Unit test config |
| `playwright.config.ts` | E2E test config |
| `tsconfig.json` | TypeScript config (`@/` path alias → `src/`) |

---

## 📐 Code Conventions

### Imports
- Use `@/` path alias for all internal imports (maps to `src/`)
- Example: `import { createSupabaseServerClient } from '@/lib/supabase-server'`

### Component Patterns
- React Server Components by default
- `"use client"` directive only when needed (interactivity, hooks)
- Tailwind CSS for styling (v4 — CSS-first config, no `tailwind.config.ts`)
- `lucide-react` for icons
- `sonner` for toast notifications
- `react-hook-form` + `zod` for forms

### API Route Patterns
- Use Next.js App Router route handlers (`route.ts`)
- Always validate input with Zod schemas from `lib/validations/`
- Return consistent error format: `{ error: string, details?: string[] }`
- Use `createSupabaseServerClient()` for user-context DB operations
- Use `createSupabaseClient()` (service role) for admin/webhook operations

### Error Handling
- Sentry for error tracking (auto-configured via `@sentry/nextjs`)
- API routes should catch errors and return appropriate HTTP status codes
- Use try/catch blocks in all API routes

---

## 🚫 DO NOT USE / ARCHIVED (Ignore These)

### Archived Migration Files (DO NOT apply)
- `supabase/skipped_migrations/` — Contains 2 deprecated Clerk-related migrations
- Any `.bak` file in `supabase/migrations/` (e.g., `20260115000000_fix_clerk_ids.sql.bak`, `20260118100000_webhook_jobs.sql.bak`, `20260119_create_storage.sql.bak`)

### Debug/Test Endpoints (Dev Only)
- `src/app/api/debug/` — Debug endpoints, not for production
- `src/app/api/debug-auth/` — Auth debug, not for production
- `src/app/test/` — Test pages
- `src/app/test-ui/` — UI test pages

### Deprecated Auth System
- The project previously used **Clerk** for authentication but migrated to **Supabase Auth**
- `skipped_migrations/` contains old Clerk-related migrations — DO NOT reference or use
- Any `clerk` references in the codebase are legacy and should not be followed

### Incomplete/Stub Features
These features have base code but are NOT fully implemented:
- **QPay/SocialPay payment integration** — Payment routes exist but integration is incomplete
- **Invoice PDF generation** — Route exists, PDF generation not fully built
- **Email notifications** — Resend SDK installed, not fully implemented
- **Excel export** — xlsx dependency exists, full UI not built
- **Instagram content publishing** — Only DM/comment replies, no post publishing
- **Multi-language** — Mongolian only

---

## 📚 Documentation (Reference)

Located in `docs/`:

| Doc | Path | Content |
|-----|------|---------|
| Architecture Overview | `docs/architecture/OVERVIEW.md` | Tech stack, data flow diagrams, module map |
| API Documentation | `docs/api/API_DOCUMENTATION.md` | All REST API endpoints |
| Setup Guide | `docs/guides/SETUP_GUIDE.md` | Initial installation, env setup |
| Deployment Guide | `docs/guides/DEPLOYMENT.md` | Vercel deployment steps |
| Facebook OAuth Setup | `docs/guides/FACEBOOK_OAUTH_SETUP.md` | FB/IG OAuth configuration |
| Frontend Dev Guide | `docs/guides/FRONTEND_DEVELOPER_GUIDE.md` | Frontend development guide |
| UI/UX Design System | `docs/design/UI_UX_DESIGN_SYSTEM.md` | Design tokens, component library |
| Advanced UI Components | `docs/design/ADVANCED_UI_COMPONENTS.md` | Complex component patterns |
| Meta App Review | `docs/meta-review/` | Meta submission docs (REFERENCE ONLY) |
| Business Reports | `docs/business/reports/` | Financial planning (REFERENCE ONLY) |
| Audit Plan | `docs/audit/AUDIT_PLAN.md` | Production audit checklist (REFERENCE ONLY) |

---

## 🧠 Skills (Agent Extensions)

Located in `skills/`:
- `skills/brand-identity/` — Brand identity guidelines
- `skills/code-review/` — Comprehensive code review with severity levels, security/logic/performance checks
- `skills/creating-skills/` — How to create new skills
- `skills/developing-ui/` — UI development patterns and standards

---

## 🌐 Environment Variables Required

```bash
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini AI (REQUIRED)
GEMINI_API_KEY=

# Facebook/Instagram (REQUIRED for social features)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_VERIFY_TOKEN=
FACEBOOK_PAGE_ID=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# App URL
NEXT_PUBLIC_APP_URL=https://www.syncly.mn

# Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=

# Sentry (optional)
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

---

## ⚠️ Important Notes for Agents

1. **Always check `middleware.ts`** before adding new routes — it controls auth protection and rate limiting
2. **Use the correct Supabase client** — browser vs server vs service-role matters
3. **Tailwind v4** uses CSS-first config — no `tailwind.config.ts` file, styles are in `globals.css`
4. **Port 4001** — Dev server runs on `localhost:4001`, not the default 3000
5. **Mongolian UI** — All user-facing text is in Mongolian
6. **Path alias** — Always use `@/` for imports (resolves to `src/`)
7. **Vercel deployment** — Only `main` branch deploys, `sin1` region (Singapore)
8. **CRON** — Daily midnight job at `/api/cron/process-messages`
