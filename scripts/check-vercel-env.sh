#!/usr/bin/env bash
# ============================================================
# Vercel-ийн production орчин АЛЬ Supabase төсөл рүү заасныг шалгана.
#
# ЯАГААД: репо дэх add_envs.sh нь `vmdfbijndijigohujfhr` руу заадаг ч
# CLI-ээр холбогдсон (мөн эзний баталгаажуулсан) төсөл нь
# `gwwzfrffwiiniqwqkgnq`. Хоёулаа өөр өгөгдлийн сан — миграцийг нэгд нь
# хэрэглээд апп нөгөөг нь уншиж байвал өөрчлөлт огт харагдахгүй.
#
# Ажиллуулах:  bash scripts/check-vercel-env.sh
# Шаардлага:   npx vercel login (нэг удаа)
# ============================================================
set -uo pipefail

EXPECTED_REF="gwwzfrffwiiniqwqkgnq"

echo "▸ Vercel-ийн production орчны хувьсагчдыг татаж байна..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! npx --yes vercel env pull "$TMP/.env.production" --environment=production --yes >/dev/null 2>&1; then
    echo "✗ Татаж чадсангүй. Эхлээд холбогдоно уу:"
    echo "    npx vercel login && npx vercel link"
    exit 1
fi

get() { grep -E "^$1=" "$TMP/.env.production" | head -1 | cut -d= -f2- | tr -d '"'; }

URL="$(get NEXT_PUBLIC_SUPABASE_URL)"
ANON="$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)"
SERVICE="$(get SUPABASE_SERVICE_ROLE_KEY)"

# JWT-ийн payload-оос `ref` шаардлагыг гаргана (base64url, гарын үсгийг шалгахгүй)
jwt_ref() {
    local token="$1"
    [ -z "$token" ] && { echo "(алга)"; return; }
    local payload="${token#*.}"; payload="${payload%%.*}"
    local pad=$(( 4 - ${#payload} % 4 )); [ $pad -lt 4 ] && payload="$payload$(printf '=%.0s' $(seq $pad))"
    echo "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null \
        | python3 -c "import json,sys; print(json.load(sys.stdin).get('ref','(ref алга)'))" 2>/dev/null \
        || echo "(задлаж чадсангүй)"
}

URL_REF="$(echo "$URL" | sed -E 's#https://([a-z0-9]+)\.supabase\.co.*#\1#')"
ANON_REF="$(jwt_ref "$ANON")"
SERVICE_REF="$(jwt_ref "$SERVICE")"

echo
printf '  %-34s %s\n' "NEXT_PUBLIC_SUPABASE_URL →" "$URL_REF"
printf '  %-34s %s\n' "ANON key ref →"             "$ANON_REF"
printf '  %-34s %s\n' "SERVICE key ref →"          "$SERVICE_REF"
printf '  %-34s %s\n' "Хүлээгдэж буй →"            "$EXPECTED_REF"
echo

fail=0
for pair in "URL:$URL_REF" "ANON:$ANON_REF" "SERVICE:$SERVICE_REF"; do
    name="${pair%%:*}"; val="${pair#*:}"
    if [ "$val" != "$EXPECTED_REF" ]; then
        echo "  ✗ $name нь «$val» руу заасан байна (хүлээгдэж буй: $EXPECTED_REF)"
        fail=1
    fi
done

if [ "$fail" -eq 0 ]; then
    echo "✅ Бүгд $EXPECTED_REF руу заасан — миграцийг тэр төсөлд хэрэглэх нь ЗӨВ."
else
    echo
    echo "⚠️  ЗӨРҮҮ БАЙНА. Миграцийг хэрэглэхээс өмнө шийднэ үү:"
    echo "   (а) Апп зөв төсөл рүү заасан бол — Vercel env-ээ шинэчил, дараа нь push"
    echo "   (б) Апп-ын заасан төсөл нь жинхэнэ бол — миграцийг ТЭР ref-д хэрэглэ"
    echo "   Vercel env солих:  npx vercel env rm <NAME> production && npx vercel env add <NAME> production"
    exit 2
fi
