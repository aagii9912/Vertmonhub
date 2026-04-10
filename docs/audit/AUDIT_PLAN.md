# 🔍 Syncly Production Audit Plan

> 8-фазын цогц аудит төлөвлөгөө — 14 skill ашиглана

## Аудитын Хүрээ

| Шинж чанар | Дэлгэрэнгүй |
|-----------|-------------|
| **App** | Syncly — AI-Powered Social Commerce Platform |
| **Framework** | Next.js 16.1.1 + React 19.2.3 |
| **Database** | Supabase (PostgreSQL) + Drizzle ORM |
| **Integrations** | Meta Graph API, Webhooks, Instagram |
| **Deployment** | Vercel (sin1 region) |
| **API Routes** | 25 route groups |

---

## Фаз 1: Код Чанар + Архитектур
**Skill:** `@production-code-audit`

- Бүх src/ файлуудыг мөр бүрээр сканнердах
- God classes (WebhookService 19KB, page.tsx 33KB)
- Circular dependencies, dead code
- TypeScript type safety

## Фаз 2: Аюулгүй Байдал
**Skills:** `@security-review` + `@api-security-best-practices`

- Secrets management, hardcoded keys
- Input validation (Zod schemas)
- XSS, CSRF, SQL injection
- Security headers шалгах

## Фаз 3: Auth + IDOR Тестинг
**Skills:** `@broken-authentication` + `@idor-testing`

- Middleware auth bypass шалгах
- IDOR: хэрэглэгч А → хэрэглэгч Б data
- Admin route protection

## Фаз 4: API Security Testing
**Skills:** `@api-fuzzing-bug-bounty` + `@api-tester`

- 25 endpoint input validation
- Webhook signature verification
- Rate limiting effectiveness

## Фаз 5: Supabase + Database
**Skills:** `@supabase-postgres-best-practices` + `@nextjs-supabase-auth`

- RLS policies
- N+1 queries, missing indexes
- 4 Supabase client instances

## Фаз 6: Next.js + Performance
**Skills:** `@nextjs-best-practices` + `@web-performance-optimization`

- Server vs Client components
- Bundle size analysis
- page.tsx (33KB!) оновчлох

## Фаз 7: Deployment Review
**Skills:** `@vercel-deployment` + `@deployment-procedures`

- Vercel config, CRON
- Sentry setup (3 config files)
- Health check endpoint

## Фаз 8: UI/UX Accessibility
**Skill:** `@web-design-guidelines`

- ARIA labels, keyboard navigation
- Responsive design
- PWA, Service Worker

---

## Existing Tests

- **Unit Tests (Vitest):** 20 test files (AI, Services, Webhook)
- **E2E Tests (Playwright):** 9 spec files (auth, dashboard, orders, etc.)

## Verification Commands

```bash
npm test               # Unit tests
npm run typecheck      # TypeScript check
npm run lint           # ESLint
npm run analyze        # Bundle size
```
