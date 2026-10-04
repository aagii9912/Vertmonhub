# Newsletter templates

`/marketing/newsletter` adds newsletter and announcement layouts, with the original plain-text layout retained. Marketing has a direct entry button and navigation/search entries.

The editor supports brand name, HTTPS logo/photo URLs, image alt text, inbox preheader, a CTA label/link pair and contact footer. The live preview, saved-draft preview, send confirmation and Resend Broadcast all use the same HTML renderer. Preview frames prohibit scripts, forms and navigation. Only the newsletter page permits arbitrary HTTPS image sources; the rest of the site CSP is unchanged.

Design is saved in `newsletters.design`. Existing NULL designs preserve their old rendering exactly. Prepared broadcasts cannot be edited; copy them to a new draft. Preparation locks compare content and design; send checks provider HTML, sender and segment. Existing confirmation, shop scope, role permissions, unsubscribe protection and ambiguous-send handling remain in place.

## Rollout

Apply `20260929120000_newsletter_design.sql`. It is standalone: creates only newsletter tables, enables RLS, denies browser table access, grants the service role access, and adds the nullable JSON design column. It does not require or activate ERP features. Record the version in `supabase_migrations.schema_migrations` in the same transaction.

Production uses the existing `RESEND_API_KEY`. Each project has its own sender settings and Resend segment, with project-scoped drafts and recipients. Configure the desired address for elysium.mn or mandalagarden.mn in the project selector. Domain verification is deferred; no sender is assumed from global EMAIL_FROM. Existing drafts without project_id are retained and are not automatically assigned to a project. No real recipient send is part of this release verification.

## Checks

- `npx vitest run src/lib/marketing/__tests__/newsletter.test.ts src/app/api/__tests__/newsletter.test.ts`
- `node scripts/test-newsletter.mjs`
- `E2E_BROWSER_CHANNEL=chrome npx playwright test --project=marketing`
- `npm run build`

Browser checks use isolated authentication and fixture recipients. A separate browser context retains the actual newsletter page CSP to verify the public production logo in the script-disabled iframe; this check requires network access. Node 22 is used for local Next.js checks.
