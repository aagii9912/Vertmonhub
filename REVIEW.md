# Code Review Guidelines — Syncly

> Project-specific review rules. Read by the code-review skill during every review.

---

## Always Check

### Security
- [ ] New API endpoints validate authentication (check `middleware.ts` coverage)
- [ ] Database queries use parameterized inputs (no string concatenation in SQL)
- [ ] No secrets, API keys, or tokens in client-side code (`NEXT_PUBLIC_` prefix only for public values)
- [ ] `x-shop-id` header is validated against the authenticated user's shops
- [ ] Meta webhook requests verify the `X-Hub-Signature-256` header
- [ ] New Supabase tables have Row Level Security (RLS) policies
- [ ] Error responses don't leak internal details (stack traces, DB schema, etc.)

### Data Integrity
- [ ] Database migrations are backward-compatible
- [ ] Foreign key relationships are properly defined
- [ ] `created_at` / `updated_at` timestamps are set
- [ ] Soft-delete patterns are used where appropriate

### Error Handling
- [ ] API routes wrap logic in try/catch blocks
- [ ] Errors are reported to Sentry (`@sentry/nextjs`)
- [ ] User-facing error messages are in Mongolian
- [ ] Failed webhook deliveries are retried (via `RetryService`)

### Input Validation
- [ ] All API inputs validated with Zod schemas from `lib/validations/`
- [ ] Form submissions use `react-hook-form` + `zod` resolver
- [ ] File uploads check size and type

---

## Style

### Imports
- Use `@/` path alias for all internal imports (maps to `src/`)
- Group imports: external → internal → types → styles
- No unused imports

### Components
- React Server Components by default
- `"use client"` directive only when required (hooks, interactivity, browser APIs)
- Use `lucide-react` for icons (not other icon libraries)
- Use `sonner` for toast notifications

### API Routes
- Use Next.js App Router route handlers (`route.ts`)
- Return consistent error format: `{ error: string, details?: string[] }`
- Use proper HTTP status codes (400, 401, 403, 404, 500)
- Include `Content-Type: application/json` header

### TypeScript
- Avoid `any` type — use proper types from `src/types/`
- Prefer `interface` over `type` for object shapes
- Use Zod `z.infer<typeof schema>` for types that mirror validation schemas

### Naming
- Files: `kebab-case` for routes, `PascalCase` for components
- Functions: `camelCase`
- Database columns: `snake_case`
- Constants: `UPPER_SNAKE_CASE`

---

## Skip

- Files in `node_modules/`
- Files in `.next/` build output
- Files in `test-results/`
- `package-lock.json`
- `tsconfig.tsbuildinfo`
- Files in `supabase/skipped_migrations/`
- `.bak` files in `supabase/migrations/`
- Debug/test endpoints (`src/app/api/debug/`, `src/app/api/debug-auth/`)
- Generated files (e.g., `next-env.d.ts`)

---

## Syncly-Specific

### Supabase Client Rules
| Context | Correct Client |
|---------|---------------|
| Client-side React components | `supabase-browser.ts` |
| Server Components, API routes | `supabase-server.ts` |
| Admin/webhook (service-role) | `supabase.ts` |
| Middleware | `supabase-middleware.ts` |

**Flag any usage of the wrong client for the context.**

### AI Module
- AI tool handlers must return structured responses (`AIToolResult`)
- Function calling schemas must be validated
- Customer memory operations must be shop-scoped

### Deployment
- Only `main` branch deploys
- Vercel region: `sin1` (Singapore)
- Dev server: port `4001`
- CRON job: `/api/cron/process-messages` at midnight
