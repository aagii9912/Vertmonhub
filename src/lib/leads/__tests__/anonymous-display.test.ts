import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Нэргүй лидийн харагдах нэр НЭГ газар: `leadDisplayName` (lib/leads/labels.ts).
 * Өмнө нь «Нэргүй», «Нэргүй лид», «Тодорхойгүй», «Лид», «-» гэх мэт хуулбар
 * fallback хуудас, тайлан, AI-д тархаж зөрдөг байсан тул статик хамгаалалт:
 *   1) customer_name-ийн ард нэргүй орлуулагч үг (Нэргүй…, Тодорхойгүй, Лид, Facebook lead)
 *      шууд бичихийг хориглоно;
 *   2) лидийн мөрийн (lead / l / duplicate) customer_name-ийг дурын string-ээр нөхөхийг хориглоно.
 * Гэрээ, Inbox-ийн харилцагч (contract/conversation-ийн customer_name) энд хамаарахгүй.
 */
const SRC = path.join(process.cwd(), 'src');
const ALLOWED = new Set([path.join('lib', 'leads', 'labels.ts')]);

const PLACEHOLDER_FALLBACK = /customer_name\b.*?(?:\|\||\?\?)\s*['"`](?:Нэргүй[^'"`]*|Тодорхойгүй|Лид|Facebook lead)['"`]/i;
const LEAD_FALLBACK = /\b(?:lead|l|duplicate)\??\.customer_name\s*(?:\|\||\?\?)\s*['"`]/;

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name !== '__tests__' && name !== 'node_modules') walk(p, out);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
            out.push(p);
        }
    }
    return out;
}

describe('anonymous lead display regression guard', () => {
    it('uses leadDisplayName instead of hard-coded lead name fallbacks', () => {
        const offenders: string[] = [];
        for (const file of walk(SRC)) {
            const rel = path.relative(SRC, file);
            if (ALLOWED.has(rel)) continue;
            readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
                if (PLACEHOLDER_FALLBACK.test(line) || LEAD_FALLBACK.test(line)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
            });
        }
        expect(offenders, 'leadDisplayName(lead)-ийг ашиглана уу (lib/leads/labels.ts)').toEqual([]);
    });

    it('detects the old fallback styles', () => {
        for (const line of [
            "{lead.customer_name || 'Нэргүй'}",
            "const name = v.lead?.customer_name || 'Нэргүй';",
            "name: l.customer_name || 'Тодорхойгүй'",
            "title: lead.customer_name || 'Лид',",
            "customer_name: name || 'Facebook lead',",
            "'Нэр': lead.customer_name || '-',",
            "{duplicate.customer_name ?? ''}",
        ]) {
            expect(PLACEHOLDER_FALLBACK.test(line) || LEAD_FALLBACK.test(line), line).toBe(true);
        }
        for (const line of [
            "{c.customer_name || '—'}",
            'customer_name: lead?.customer_name || null,',
            "buyerName: prev.buyerName || normalizeLeadName(l.customer_name) || '',",
        ]) {
            expect(PLACEHOLDER_FALLBACK.test(line) || LEAD_FALLBACK.test(line), line).toBe(false);
        }
    });
});
