## 2025-03-05 - [CRITICAL] Privilege Escalation and Hardcoded Session Secret fixes
**Vulnerability:**
1. A critical authorization bypass existed in `src/app/api/admin/setup/route.ts` where any authenticated user could upgrade their role to `super_admin`. This endpoint was fully functional in production.
2. A hardcoded fallback session secret (`fallback-secret-key-32chars-min!!`) was being used for encrypting custom session cookies across `src/app/api/auth/login/route.ts`, `src/lib/admin/auth.ts`, and `src/lib/auth/resolve-user.ts` if the environment variable was missing.

**Learning:**
1. Auto-setup scripts created for development speed can easily be forgotten and deployed to production, exposing severe privilege escalation flaws.
2. Hardcoding failover secrets directly in the source code can compromise session management entirely in a production environment if the environment variables fail to load or are forgotten.

**Prevention:**
1. Always wrap development-only "helper" endpoints with strict environment checks (e.g., `process.env.NODE_ENV !== 'production'`) and ensure they are inaccessible in a production build, or remove them entirely before going live.
2. Ensure cryptographic secrets are strictly validated. If a necessary environment variable for a secret is missing in production, the application should fast-fail by throwing an error rather than silently defaulting to a known (and thus insecure) static string.
