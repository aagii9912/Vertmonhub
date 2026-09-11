#!/usr/bin/env bash
# ============================================================
# Git түүхээс бодит хэрэглэгчийн PII файлуудыг БҮРМӨСӨН арилгах (REVIEW-2026-09-11 C4).
#
# ⚠️  ЭЗЭМШИГЧ ГАРААР АЖИЛЛУУЛНА. Энэ нь БҮХ салбарын commit hash-ийг өөрчилж, GitHub руу
#     force-push хийнэ. Хамтрагч бүр дараа нь repo-гоо ДАХИН clone хийх ёстой
#     (хуучин clone-оос push хийвэл PII буцаж орно).
#
# Урьдчилсан нөхцөл:
#   pip install git-filter-repo        (эсвэл brew install git-filter-repo)
#   бүх ажлаа commit/push хийсэн, worktree-үүд цэвэр (git worktree list)
#
# Ажиллуулах:  bash scripts/purge-pii-history.sh
# ============================================================
set -euo pipefail

command -v git-filter-repo >/dev/null || { echo "git-filter-repo суулгаагүй: pip install git-filter-repo"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Working tree цэвэр биш — эхлээд commit/stash хий"; exit 1; }

echo "1) Хамгаалалтын backup (bundle)…"
git bundle create "../vertmonhub-before-purge-$(date +%Y%m%d%H%M).bundle" --all

echo "2) Түүхээс файлуудыг арилгаж байна…"
git filter-repo --invert-paths \
  --path "all-contacts.csv" \
  --path "all-contacts 2.csv" \
  --path "hubspot-listing-lib-exports-all-segments-2026-03-10.csv" \
  --path "hubspot-listing-lib-exports-all-segments-2026-03-10 (1).csv" \
  --path "REPORTS/customers-not-in-hubspot.csv" \
  --path "REPORTS/lead-assignment.csv" \
  --path "Property Wrong Info (property.sale) (3).xlsx" \
  --force

echo "3) origin-ийг дахин холбож force-push (filter-repo remote-ийг устгадаг)…"
git remote add origin https://github.com/aagii9912/Vertmonhub.git
git push --force --all origin
git push --force --tags origin

cat <<'MSG'

✅ Дууслаа. Дараагийн алхмууд:
  • GitHub Support-д "purge cached views / remove sensitive data" хүсэлт илгээх
    (https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
  • Хамтрагч бүр: rm -rf repo && git clone … (хуучин clone-оос push ХИЙХГҮЙ)
  • Vercel deploy-ууд шинэ hash-аар дахин үүснэ — асуудалгүй
MSG
