import { z } from 'zod';
import { dateSchema } from './performance';
import { readWorkbookSheets } from '@/lib/utils/xlsx';

export const META_IMPORT_LIMITS = { bytes: 2 * 1024 * 1024, rows: 5000 };
export const MetaImportOptions = z.object({
    accountId: z.string().trim().max(44).default(''),
    currency: z.string().trim().toUpperCase().regex(/^([A-Z]{3})?$/).default(''),
    timezone: z.string().trim().min(1).max(100).refine(value => {
        try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }, 'Зарын дансны зөв цагийн бүс оруулна уу'),
    mntPerUnit: z.number().positive().max(1000000).refine(v => Number(v.toFixed(6)) === v),
    decimal: z.enum(['dot', 'comma']).default('dot'),
});
export type MetaImportSettings = z.infer<typeof MetaImportOptions>;
export interface MetaImportRow { campaign_id: string; campaign_name: string; spent_at: string; native_amount: string }
export interface MetaImportSummary {
    rows: number; added: number; updated: number; unchanged: number; skippedApi: number;
    nativeTotal: string; savedMnt: string; manualOverlap: number; fingerprint: string; id?: string;
}
export interface MetaImportPreview extends MetaImportSummary {
    accountId: string; currency: string; timezone: string; from: string; to: string; ignoredSummary: number;
    sample: MetaImportRow[];
}
export interface MetaImportHistory {
    id: string; file_name: string; account_id: string; currency: string; from_date: string; to_date: string;
    created_at: string; summary: MetaImportSummary;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');
const text = (v: unknown) => String(v ?? '').trim();
function identifier(value: unknown, account = false): string {
    // Excel numbers with >15 digits may already have lost precision. CSV text is preserved by readWorkbookSheets.
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || String(value).length > 15))
        throw new Error('ID-ийн орон Excel-д алдагдсан байна. Meta-гаас CSV татах эсвэл ID-г текстээр хадгална уу.');
    const id = text(value).replace(account ? /^act_/ : /$^/, '');
    if (!/^[0-9]{1,40}$/.test(id)) throw new Error(account ? 'Зарын дансны ID буруу эсвэл байхгүй байна.' : 'Campaign ID буруу эсвэл байхгүй байна.');
    return account ? `act_${id}` : id;
}
function amount(value: unknown, decimal: MetaImportSettings['decimal']): string {
    let raw = text(value);
    if (typeof value !== 'number') {
        const valid = decimal === 'dot'
            ? /^(?:\d+|\d{1,3}(?:[,\s]\d{3})+)(?:\.\d{1,6})?$/
            : /^(?:\d+|\d{1,3}(?:[.\s]\d{3})+)(?:,\d{1,6})?$/;
        if (!valid.test(raw)) throw new Error('Зардлын дүн буруу. Бутархайн тэмдэг болон мянгатын тусгаарлагчаа шалгана уу.');
        raw = decimal === 'dot' ? raw.replace(/[,\s]/g, '') : raw.replace(/[.\s]/g, '').replace(',', '.');
    }
    if (!/^\d+(\.\d{1,6})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) >= 1e12)
        throw new Error('Зардал 0–1 их наядын хооронд, 6 хүртэл бутархай оронтой байна.');
    return raw;
}
function day(value: unknown): string {
    const raw = value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
        : text(value);
    if (!dateSchema.safeParse(raw).success) throw new Error('Огноог YYYY-MM-DD хэлбэрээр экспортлоно уу.');
    return raw;
}

export async function parseMetaSpendFile(input: ArrayBuffer | Uint8Array, options: MetaImportSettings) {
    const settings = MetaImportOptions.parse(options);
    const sheets = (await readWorkbookSheets(input)).filter(s => s.rows.length);
    if (sheets.length !== 1) throw new Error('Нэг sheet бүхий, хоосон биш Meta тайлан сонгоно уу.');
    const { rows, columns } = sheets[0];
    if (rows.length > META_IMPORT_LIMITS.rows) throw new Error('Нэг файлд 5,000 хүртэл мөр оруулна уу.');
    if (columns.some(c => /^__EMPTY(?:_\d+)?$/.test(c) && rows.some(row => text(row[c]))))
        throw new Error('Толгойгүй нэмэлт багана байна. CSV-ийн таслал, хашилт болон баганын тоог шалгана уу.');
    if (columns.some(c => /_\d+$/.test(c) && columns.includes(c.replace(/_\d+$/, ''))))
        throw new Error('Файлд давхардсан багана байна. Давхардлыг арилгана уу.');
    function column(aliases: string[], required = false): string | undefined {
        const matches = columns.filter(c => aliases.includes(normalize(c)));
        if (matches.length > 1) throw new Error(`Давхардсан багана: ${matches.join(', ')}`);
        if (required && !matches.length) throw new Error(`Шаардлагатай багана алга: ${aliases[0]}`);
        return matches[0];
    }
    const campaign = column(['campaign id', 'кампанит ажлын id'], true)!;
    const name = column(['campaign name', 'кампанит ажлын нэр'], true)!;
    const date = column(['day', 'date', 'spent at', 'өдөр', 'огноо']);
    const start = column(['reporting starts', 'date start']);
    const end = column(['reporting ends', 'date stop']);
    if (!date && (!start || !end)) throw new Error('Өдрийн задаргаа алга. Breakdown: Time → Day сонгон экспортлоно уу.');
    const spendColumns = columns.filter(c => /^(amount spent|spend|native amount|зарцуулсан дүн)( \([a-z]{3}\))?$/.test(normalize(c)));
    if (spendColumns.length !== 1) throw new Error('Amount spent багана нэг байх ёстой.');
    const spend = spendColumns[0];
    const headerCurrency = /\(([A-Za-z]{3})\)/.exec(spend)?.[1].toUpperCase() || '';
    const accountColumn = column(['account id', 'ad account id', 'дансны id']);
    const currencyColumn = column(['account currency', 'currency', 'валют']);
    const breakdown = columns.filter(c => ['ad id', 'ad set id', 'adset id', 'age', 'gender', 'country', 'region', 'placement', 'platform', 'publisher platform', 'device platform'].includes(normalize(c)));
    let accountId = settings.accountId ? identifier(settings.accountId, true) : '';
    let currency = settings.currency || headerCurrency;
    if (settings.currency && headerCurrency && settings.currency !== headerCurrency) throw new Error('Сонгосон валют файлын валюттай зөрж байна.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const parsed: MetaImportRow[] = [];
    const seen = new Set<string>();
    let ignoredSummary = 0;
    for (const [index, row] of rows.entries()) {
        const value = (key?: string) => key ? row[key] : undefined;
        if (Object.values(row).every(v => text(v) === '')) continue;
        if (!text(row[campaign]) && /^(total|нийт|results from \d+ campaigns?)$/i.test(text(row[name]))) { ignoredSummary++; continue; }
        try {
            if (breakdown.some(c => text(row[c]))) throw new Error('Campaign түвшний тайлан сонгоно уу. Ad, Ad set болон хүн ам зүйн задаргааг арилгана уу.');
            const id = identifier(row[campaign]);
            const account = identifier(value(accountColumn) || accountId, true);
            if (accountId && accountId !== account) throw new Error('Нэг файлд нэг зарын данс оруулна уу.');
            accountId = account;
            const rowCurrency = text(value(currencyColumn) || currency).toUpperCase();
            if (!/^[A-Z]{3}$/.test(rowCurrency) || (currency && rowCurrency !== currency)) throw new Error('Валют байхгүй эсвэл файлын валютууд зөрж байна.');
            currency = rowCurrency;
            const spentAt = day(value(date || start));
            if (!date && day(value(end)) !== spentAt) throw new Error('Нийт хугацааны дүнг өдөрт хуваахгүй. Time → Day задаргаатай экспортлоно уу.');
            if (spentAt > today) throw new Error('Ирээдүйн өдрийн зардал оруулах боломжгүй.');
            const key = `${id}:${spentAt}`;
            if (seen.has(key)) throw new Error('Ижил campaign, өдөр давхардлаа. Нэмэлт задаргаа болон нийт мөрийг арилгана уу.');
            seen.add(key);
            const campaignName = text(row[name]);
            if (!campaignName || campaignName.length > 255) throw new Error('Campaign нэр хоосон эсвэл 255 тэмдэгтээс урт байна.');
            parsed.push({ campaign_id: id, campaign_name: campaignName, spent_at: spentAt, native_amount: amount(row[spend], settings.decimal) });
        } catch (error) { throw new Error(`Мөр ${index + 2}: ${error instanceof Error ? error.message : 'Мэдээлэл буруу'}`); }
    }
    if (!parsed.length) throw new Error('Импортлох campaign-ийн мөр алга.');
    if (currency === 'MNT' && settings.mntPerUnit !== 1) throw new Error('MNT валютын ханш 1 байна.');
    parsed.sort((a, b) => a.spent_at.localeCompare(b.spent_at) || a.campaign_id.localeCompare(b.campaign_id));
    const from = parsed[0].spent_at, to = parsed.at(-1)!.spent_at;
    if (Date.parse(to) - Date.parse(from) > 92 * 86400000) throw new Error('Файлаа 93 хүртэл өдрийн хугацаагаар салгана уу.');
    return { accountId, currency, timezone: settings.timezone, from, to, ignoredSummary, rows: parsed };
}
