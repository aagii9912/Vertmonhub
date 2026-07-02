import next from "eslint-config-next/core-web-vitals";

/**
 * ESLint flat config (ESLint 9 + Next.js 16).
 * `next lint` устсан тул `eslint .` шууд ажиллана.
 * eslint-config-next 16 нь native flat config (массив) экспортолдог тул
 * FlatCompat-гүйгээр шууд spread хийнэ (FlatCompat нь ESLint 9 дээр
 * "circular structure" алдаа өгдөг байсан).
 */
const eslintConfig = [
  {
    // Build гаралт, worktree хуулбар, static asset, миграц зэргийг алгасна.
    // ('.next/**' биш '**/.next/**' — worktree доторх .next-ийг ч хамруулна.)
    ignores: [
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/node_modules/**",
      ".claude/**",
      "next-env.d.ts",
      "public/**",
      "supabase/**",
      "coverage/**",
    ],
  },
  ...next,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
      // Олон хэлний (Монгол) JSX текстэд шаардлагагүй, зөвхөн чимэг.
      "react/no-unescaped-entities": "off",
      // React Compiler-эра зөвлөмжийн дүрмүүд: блоклохгүй, харагдахын тулд warn.
      // (Бодит rules-of-hooks нь error хэвээр — жинхэнэ алдааг барина.)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Server код (API route, auth helper, middleware) cookie-д итгэдэг getSession()-ийг
    // ашиглаж БОЛОХГҮЙ — Auth сервертэй тулгадаг getUser()-ийг хэрэглэнэ.
    // (Client тал: contexts/, components/, hooks/ — энэ дүрэмд хамаарахгүй.)
    files: ["src/app/api/**/*.ts", "src/lib/auth/**/*.ts", "src/middleware.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='getSession']",
          message: "Server-side код getSession() ашиглаж болохгүй — supabase.auth.getUser() хэрэглэнэ (cookie-д шууд итгэхгүй, Auth сервертэй тулгана).",
        },
      ],
    },
  },
];

export default eslintConfig;
