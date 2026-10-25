import { readFileSync } from 'node:fs';

/**
 * `scripts/apply-migrations.mjs`-ийн VERIFY асуулга (migration-ий дараах шалгалт). SQL тестүүд түүнийг жинхэнэ
 * схем дээр ажиллуулж `ok = true` гэдгийг шалгана — буруу асуулга production-д migration-ийг буцаахаас сэргийлнэ.
 */
export function migrationVerifyQuery(version: string): string {
    const script = readFileSync('scripts/apply-migrations.mjs', 'utf8');
    const match = script.match(new RegExp(`'${version}': \`([\\s\\S]*?)\``));
    if (!match) throw new Error(`apply-migrations.mjs-д ${version}-ийн VERIFY алга`);
    return match[1];
}
