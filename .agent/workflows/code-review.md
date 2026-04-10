---
description: Performs a comprehensive code review on the Syncly codebase. Checks for security vulnerabilities, logic errors, performance issues, and best practice violations.
---

# Code Review Workflow

## Steps

1. **Read the Code Review skill instructions**
   Read `skills/code-review/SKILL.md` for the full review methodology, severity levels, and output format.

2. **Read the project review guidelines**
   Read `REVIEW.md` in the project root for Syncly-specific review rules (always-check, style, skip patterns).

3. **Read the project context**
   Read `CLAUDE.md` for architecture context, tech stack, and conventions.

4. **Determine review scope**
   - If the user specified files or directories → review those only
   - If the user specified a git range (e.g., "last 3 commits") → run `git diff` and review changed files
   - Otherwise → scan all files under `src/` (respecting skip rules from `REVIEW.md`)

5. **Run the review**
   Analyze each file against:
   - All 7 review categories from `SKILL.md`
   - All rules from `REVIEW.md`
   - Syncly-specific checks

6. **Generate the review report**
   Output a structured markdown report following the format in `SKILL.md`:
   - Summary statistics (file count, finding counts by severity)
   - Findings grouped by severity (🔴 Must Fix → 🟡 Should Fix → 🟢 Consider → 💙 Praise)
   - Each finding includes: file path, line numbers, category, description, impact, and suggested fix
   - Final summary with top priorities and recommendations

7. **Save the report**
   Save the review report as an artifact for the user to review.
