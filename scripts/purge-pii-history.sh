#!/usr/bin/env bash
# ============================================================
# Git түүхээс бодит хэрэглэгчийн PII файлуудыг БҮРМӨСӨН арилгах (REVIEW-2026-09-11 C4).
#
# Аюулгүй арга: ажлын repo-д хүрэхгүй — тусдаа MIRROR clone дээр түүхийг дахин бичиж,
# GitHub руу бүх ref-ийг force-push хийнэ. Дараа нь ажлын repo-гоо шинэ түүх рүү шилжүүлнэ.
#
# ⚠️  Энэ нь БҮХ салбар/tag-ийн commit hash-ийг өөрчилнө. Хамтрагч бүр дараа нь repo-гоо
#     ДАХИН clone хийнэ (хуучин clone-оос push хийвэл PII буцаж орно).
#
# Урьдчилсан нөхцөл: `git push` хийх эрхтэй (osxkeychain), python3.
# Ажиллуулах:   bash scripts/purge-pii-history.sh
# ============================================================
set -euo pipefail

REMOTE="https://github.com/aagii9912/Vertmonhub.git"
WORK="$(mktemp -d /tmp/vertmonhub-purge.XXXXXX)"
MIRROR="$WORK/repo.git"
FR="$WORK/git-filter-repo"

echo "▶ 1/6 git-filter-repo татаж байна…"
if command -v git-filter-repo >/dev/null 2>&1; then FR="$(command -v git-filter-repo)"; else
  curl -sSL -o "$FR" https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo
fi
python3 "$FR" --version >/dev/null

echo "▶ 2/6 Хамгаалалтын bundle backup (бүх ref) — $WORK/before-purge.bundle"
git bundle create "$WORK/before-purge.bundle" --all

echo "▶ 3/6 Mirror clone…"
git clone --quiet --mirror "$REMOTE" "$MIRROR"
cd "$MIRROR"
# GitHub-ийн refs/pull/* ref-үүд push хийгддэггүй — хасна
git for-each-ref --format='%(refname)' refs/pull | while read -r r; do git update-ref -d "$r"; done
echo "   PII-тэй commit (өмнө): $(git log --all --oneline -- 'all-contacts.csv' 'all-contacts 2.csv' 'REPORTS/lead-assignment.csv' 'REPORTS/customers-not-in-hubspot.csv' | wc -l | tr -d ' ')"

echo "▶ 4/6 Түүхээс файлуудыг арилгаж байна…"
python3 "$FR" --invert-paths --force \
  --path "all-contacts.csv" \
  --path "all-contacts 2.csv" \
  --path "hubspot-listing-lib-exports-all-segments-2026-03-10.csv" \
  --path "hubspot-listing-lib-exports-all-segments-2026-03-10 (1).csv" \
  --path "REPORTS/customers-not-in-hubspot.csv" \
  --path "REPORTS/lead-assignment.csv" \
  --path "Property Wrong Info (property.sale) (3).xlsx"
LEFT="$(git log --all --oneline -- 'all-contacts.csv' 'all-contacts 2.csv' 'REPORTS/lead-assignment.csv' 'REPORTS/customers-not-in-hubspot.csv' | wc -l | tr -d ' ')"
echo "   PII-тэй commit (дараа): $LEFT"
[ "$LEFT" = "0" ] || { echo "❌ Түүхэнд PII үлдсэн — зогслоо"; exit 1; }

echo "▶ 5/6 GitHub руу бүх ref-ийг force-push (mirror)…"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push --mirror origin

echo "▶ 6/6 Ажлын repo-г шинэ түүх рүү шилжүүлж байна…"
cd "$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
CUR="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin --prune
git reset --hard "origin/$CUR"
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  [ "$b" = "$CUR" ] && continue
  git show-ref --verify --quiet "refs/remotes/origin/$b" && git branch -f "$b" "origin/$b" || true
done
git gc --prune=now --quiet || true

cat <<MSG

✅ Дууслаа. Backup: $WORK/before-purge.bundle
Дараагийн алхмууд:
  • GitHub Support-д "remove sensitive data / purge cached views" хүсэлт илгээх:
    https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
  • Хамтрагч бүр: rm -rf <repo> && git clone $REMOTE   (хуучин clone-оос push ХИЙХГҮЙ)
  • .claude/worktrees/* доторх хуучин worktree-үүдийг устгах (git worktree remove --force …)
MSG
