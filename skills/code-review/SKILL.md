---
name: code-review
description: Performs comprehensive code reviews on the Syncly codebase. Use when the user asks for a code review, audit, quality check, or wants to find bugs and security issues.
---

# Code Review Skill

Performs multi-category code analysis with severity-graded findings, modeled after Claude Code's Code Review.

## When to use this skill
- User asks for a code review or code audit
- User triggers `/code-review` workflow
- User asks to find bugs, security issues, or code quality problems
- Before major deployments or releases

## Severity Levels

| Level | Label | Meaning |
|-------|-------|---------|
| 🔴 | **Must Fix** | Bugs, security vulnerabilities, data loss risks, crashes |
| 🟡 | **Should Fix** | Logic errors, missing error handling, performance issues, bad patterns |
| 🟢 | **Consider** | Style improvements, refactoring opportunities, minor optimizations |
| 💙 | **Praise** | Well-written code worth highlighting as a good example |

## Review Categories

1. **Security** — XSS, injection, auth bypass, secrets exposure, missing RLS
2. **Logic Errors** — Wrong conditions, off-by-one, race conditions, null safety
3. **Performance** — N+1 queries, unnecessary renders, missing memoization, large bundles
4. **Error Handling** — Uncaught exceptions, missing try/catch, silent failures
5. **Type Safety** — `any` usage, missing types, incorrect type assertions
6. **Best Practices** — Code conventions, DRY violations, SOLID principles
7. **Code Style** — Naming, formatting, import order, dead code

## Workflow

### Step 1: Load Review Guidelines
```
Read REVIEW.md from the project root for project-specific rules.
Read CLAUDE.md for project conventions and architecture context.
```

### Step 2: Determine Scope
- **Full review**: Scan `src/` directory (skip `node_modules/`, `.next/`, `test-results/`)
- **Targeted review**: User specifies files or directories
- **Changed files**: User can specify git diff range

### Step 3: Analyze Code
For each file in scope, check against all 7 categories above plus any rules from `REVIEW.md`.

Priority order:
1. Security issues (always check first)
2. Logic errors and bugs
3. Error handling gaps
4. Type safety problems
5. Performance concerns
6. Best practices violations
7. Style issues

### Step 4: Generate Report

Output a structured markdown report:

```markdown
# 🔍 Code Review Report — [Scope Description]
**Date:** [date]
**Files reviewed:** [count]
**Findings:** 🔴 [n] Must Fix · 🟡 [n] Should Fix · 🟢 [n] Consider · 💙 [n] Praise

---

## 🔴 Must Fix

### [Finding Title]
**File:** `path/to/file.ts` (line X-Y)
**Category:** Security | Logic | Error Handling | ...
**Description:** Clear explanation of the issue
**Impact:** What could go wrong
**Fix:**
\```typescript
// suggested code fix
\```

---

## 🟡 Should Fix
[Same format...]

## 🟢 Consider
[Same format...]

## 💙 Praise
[Same format — highlight good patterns]

---

## Summary
[Brief overview of code health, top priorities, and recommendations]
```

## Syncly-Specific Checks

These checks are specific to this project — always verify:

### Supabase Client Selection
- Browser components → `supabase-browser.ts`
- Server Components / API routes → `supabase-server.ts`
- Admin/webhook operations → `supabase.ts` (service role)
- Middleware → `supabase-middleware.ts`
- **Flag:** Using wrong client for the context

### API Route Patterns
- All inputs validated with Zod schemas from `lib/validations/`
- Consistent error format: `{ error: string, details?: string[] }`
- Proper HTTP status codes
- try/catch in all route handlers

### Security
- No secrets in client-side code
- `x-shop-id` header validated, not blindly trusted
- RLS policies exist for new tables
- Meta webhook signatures verified

### Imports & Conventions
- All imports use `@/` alias (not relative `../`)
- Icons from `lucide-react`
- Toasts from `sonner`
- Forms: `react-hook-form` + `zod`

### Components
- Server Components by default
- `"use client"` only when necessary
- Tailwind CSS v4 (CSS-first config)
