// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    CHANNEL_SOURCES, aggregateChannelReport, applyRememberedMapping, buildTable, channelFields, compareWithPrevious,
    detectHeaderRow, formatChannelValue, headerSignature, normalizeHeader, parseCount, parseDateTime, parseDuration,
    durationHint, mappedField, parseHourBucket, peakMissedHours, suggestMapping, ChannelPeriodSchema, type ChannelMapping,
} from '../channel-reports';

const table = (header: string[], ...rows: unknown[][]) => rows.map(values => Object.fromEntries(header.map((h, i) => [h, values[i] ?? ''])));
const META = ['Campaign name', 'Reporting starts', 'Reporting ends', 'Reach', 'Impressions', 'Frequency', 'Link clicks', 'Page engagement', 'Post engagements', 'Amount spent (USD)'];
const CALLPRO_GROUPS = ['Бүлэг', 'Бүлгийг сонгосон', 'Хариулсан', 'Нийт ярианы хугацаа (hh:mm:ss)', 'Ярианы дундаж хугацаа', 'Дуудлагад хариулах хүртэл хамгийн удаан хүлээгдсэн хугацаа', 'Exit With Key', 'Шилжүүлсэн', 'Тасалсан', 'Алдсан', 'Дуудлагад хариулах хүртэл алдсан хугацаа', 'Хугацаа хэтэрсэн'];
const week = { from: '2026-09-23', to: '2026-09-29' };

describe('header matching', () => {
    it('normalizes case, spacing, punctuation, diacritics and unit suffixes', () => {
        expect(normalizeHeader('  Amount   spent (USD) ')).toBe('amount spent');
        expect(normalizeHeader('3-second_views')).toBe('3 second views');
        expect(normalizeHeader('НИЙТ  ярианы хугацаа (hh:mm:ss)')).toBe('нийт ярианы хугацаа');
        expect(normalizeHeader('Ё-й')).toBe('ё й');
        expect(normalizeHeader('Café Réach')).toBe('cafe reach');
    });

    it('suggests Meta, Facebook page and SMS columns by alias, one column per metric', () => {
        const meta = suggestMapping(['CAMPAIGN NAME', ' reach ', 'Link_Clicks', 'Amount spent (USD)', 'Post engagement', 'Post engagements', 'Unique link clicks'], 'meta_ads');
        expect(meta).toEqual({ 'CAMPAIGN NAME': 'campaign', ' reach ': 'reach', Link_Clicks: 'link_clicks', 'Amount spent (USD)': 'spend', 'Post engagement': 'post_engagements', 'Post engagements': '', 'Unique link clicks': '' });
        expect(suggestMapping(['Date', 'Views', 'Viewers', '3-second views', 'Content interactions', 'Watch time', 'Views from organic', 'Views from ads', 'Link clicks', 'Visits', 'Follows'], 'facebook_page'))
            .toEqual({ Date: 'date', Views: 'views', Viewers: 'viewers', '3-second views': 'three_sec_views', 'Content interactions': 'interactions', 'Watch time': 'watch_seconds', 'Views from organic': 'views_organic', 'Views from ads': 'views_ads', 'Link clicks': 'link_clicks', Visits: 'visits', Follows: 'follows' });
        expect(suggestMapping(['Нэр', 'Төлөвлөсөн', 'Илгээсэн', 'Алдаа', 'Хүргэгдсэн'], 'sms'))
            .toEqual({ 'Нэр': 'name', 'Төлөвлөсөн': 'planned', 'Илгээсэн': 'sent', 'Алдаа': 'failed', 'Хүргэгдсэн': 'delivered' });
    });

    it('recognizes all CallPro group report columns and switches to call-list or hourly fields by shape', () => {
        expect(Object.values(suggestMapping(CALLPRO_GROUPS, 'callpro'))).toEqual(['group', 'selected', 'answered', 'talk_seconds', 'avg_talk_seconds', 'max_wait_seconds', 'exit_with_key', 'transferred', 'abandoned', 'missed', 'lost_wait_seconds', 'timeout']);
        expect(suggestMapping(['Огноо', 'Цаг', 'Дугаар', 'Төлөв', 'Ярианы хугацаа', 'Бүлэг'], 'callpro'))
            .toEqual({ 'Огноо': 'call_at', 'Цаг': 'call_time', 'Дугаар': 'caller', 'Төлөв': 'status', 'Ярианы хугацаа': 'talk_seconds', 'Бүлэг': 'group' });
        expect(suggestMapping(['Цаг', 'Хариулсан', 'Алдсан'], 'callpro')).toEqual({ 'Цаг': 'hour', 'Хариулсан': 'answered', 'Алдсан': 'missed' });
    });

    it('has no ambiguous alias inside a source shape', () => {
        for (const source of CHANNEL_SOURCES) {
            for (const shape of source === 'callpro' ? (['groups', 'calls', 'hourly'] as const) : (['rows'] as const)) {
                const seen = new Map<string, string>();
                for (const field of channelFields(source, shape)) {
                    for (const alias of field.aliases.map(normalizeHeader)) {
                        expect(seen.get(alias) ?? field.key, `${source}/${shape}: ${alias}`).toBe(field.key);
                        seen.set(alias, field.key);
                    }
                }
            }
        }
    });

    it('applies a remembered mapping by normalized header and reports its origin', () => {
        const remembered: ChannelMapping = { 'Хүрсэн хүн': 'reach', 'Зардал $': 'spend', 'Frequency': '' };
        const headers = ['хүрсэн  хүн', 'Зардал $', 'Frequency'];
        expect(applyRememberedMapping(headers, 'meta_ads', remembered)).toEqual({ mapping: { 'хүрсэн  хүн': 'reach', 'Зардал $': 'spend', Frequency: '' }, origin: 'remembered' });
        const mixed = applyRememberedMapping([...headers, 'Impressions'], 'meta_ads', remembered);
        expect(mixed).toEqual({ mapping: { 'хүрсэн  хүн': 'reach', 'Зардал $': 'spend', Frequency: '', Impressions: 'impressions' }, origin: 'mixed' });
        expect(applyRememberedMapping(['Reach'], 'meta_ads', { Reach: 'retired_metric' }).origin).toBe('suggested');
        expect(applyRememberedMapping(['Reach'], 'meta_ads', null)).toEqual({ mapping: { Reach: 'reach' }, origin: 'suggested' });
    });

    it('treats headers named like object prototype members as plain columns', () => {
        const headers = ['constructor', 'toString', '__proto__', 'Илгээсэн'];
        const mapping = suggestMapping(headers, 'sms');
        expect(mapping).toEqual({ constructor: '', toString: '', ['__proto__']: '', 'Илгээсэн': 'sent' });
        expect(Object.getPrototypeOf(mapping)).toBe(Object.prototype);
        expect(applyRememberedMapping(headers, 'sms', { toString: 'planned' }).mapping).toMatchObject({ toString: 'planned', constructor: '', 'Илгээсэн': 'sent' });
        const { rows } = buildTable([headers, [1, 2, 3, 4]], 0);
        expect(Object.keys(rows[0])).toEqual(headers);
        expect(aggregateChannelReport(rows, { toString: 'planned', 'Илгээсэн': 'sent' }, 'sms').totals).toMatchObject({ planned: 2, sent: 4 });
        expect(mappedField({}, 'constructor')).toBe('');
    });

    it('builds a stable header signature regardless of order and case', () => {
        expect(headerSignature(['Reach', 'Impressions'])).toBe(headerSignature(['impressions ', 'REACH']));
        expect(headerSignature(['Reach'])).not.toBe(headerSignature(['Reach', 'Impressions']));
    });

    it('skips report titles above the real header row and de-duplicates headers', () => {
        const matrix = [['Бүлгийн тайлан'], ['2026-09-23 — 2026-09-29'], ['Бүлэг', 'Хариулсан', 'Алдсан', '', 'Алдсан'], ['Борлуулалт', 10, 2, 'x', 1]];
        const index = detectHeaderRow(matrix, 'callpro');
        expect(index).toBe(2);
        expect(buildTable(matrix, index)).toEqual({
            headers: ['Бүлэг', 'Хариулсан', 'Алдсан', 'Багана 4', 'Алдсан (2)'],
            rows: [{ 'Бүлэг': 'Борлуулалт', 'Хариулсан': 10, 'Алдсан': 2, 'Багана 4': 'x', 'Алдсан (2)': 1 }],
            firstLine: 4,
        });
    });
});

describe('cell parsing never guesses', () => {
    it('parses counts with thousands separators and currency, rejects ambiguous or negative numbers', () => {
        expect([12, '1,234', '1 234.5', '$1,234.56', '12.5%', '₮ 900', '', '—', 'N/A'].map(parseCount)).toEqual([12, 1234, 1234.5, 1234.56, 12.5, 900, null, null, null]);
        expect(['1,23', '1.234,56', '-5', 'abc', '12 apples'].map(parseCount)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
        expect(parseCount(new Date())).toBe('invalid');
    });

    it('parses durations from hh:mm:ss, Excel time cells and unit-labelled numbers only', () => {
        expect(parseDuration('01:02:03')).toBe(3723);
        expect(parseDuration('125:00:01')).toBe(450001);
        expect(parseDuration(new Date(1899, 11, 30, 0, 5, 30))).toBe(330);
        expect(parseDuration(new Date(1899, 11, 31, 2, 0, 0))).toBe(93600);
        expect(parseDuration('1h 2m 3s')).toBe(3723);
        expect(parseDuration('2м 5с')).toBe(125);
        expect(parseDuration('05:30')).toBe('invalid');
        expect(parseDuration('05:30', durationHint('Хугацаа (mm:ss)'))).toBe(330);
        expect(parseDuration(90)).toBe('invalid');
        expect(parseDuration(90, durationHint('Watch time (seconds)'))).toBe(90);
        expect(parseDuration('1.5', durationHint('Үзсэн хугацаа (минут)'))).toBe(90);
        expect(parseDuration(0)).toBe(0);
    });

    it('converts call times with an offset to Ulaanbaatar and keeps naive times as local wall clock', () => {
        expect(parseDateTime('2026-09-23 09:15:00')).toEqual({ date: '2026-09-23', hour: 9 });
        expect(parseDateTime('2026-09-23T17:30:00Z')).toEqual({ date: '2026-09-24', hour: 1 });
        expect(parseDateTime('2026/09/23 3:05 PM')).toEqual({ date: '2026-09-23', hour: 15 });
        expect(parseDateTime(new Date(2026, 8, 23, 22, 10))).toEqual({ date: '2026-09-23', hour: 22 });
        expect(parseDateTime('2026-09-23')).toEqual({ date: '2026-09-23', hour: null });
        expect(['23/09/2026 10:00', '2026-02-30 10:00', '2026-09-23 25:00'].map(parseDateTime)).toEqual(['invalid', 'invalid', 'invalid']);
        expect([9, '09', '09:00-10:00', '9 - 10', '21 цаг', 24, '9.5'].map(parseHourBucket)).toEqual([9, 9, 9, 9, 21, 'invalid', 'invalid']);
    });
});

describe('aggregateChannelReport', () => {
    const metaRows = (extra: unknown[][] = []) => table(META,
        ['Mandala Garden lead', '2026-09-23', '2026-09-29', 1000, 3000, 3, 120, 200, 150, '50.25'],
        ['Elysium awareness', '2026-09-23', '2026-09-29', 800, 1600, 2, 30, '1,000', 900, 20],
        ...extra);

    it('sums additive Meta metrics, keeps USD as reported and refuses to add overlapping reach', () => {
        const result = aggregateChannelReport(metaRows(), suggestMapping(META, 'meta_ads'), 'meta_ads', { period: week });
        expect(result.errors).toEqual([]);
        expect(result.totals).toEqual({ impressions: 4600, link_clicks: 150, page_engagement: 1200, post_engagements: 1050, spend: 70.25, currency: 'USD', cpm: 15.27, cost_per_link_click: 0.47, ctr_link: 3.26 });
        // Engagement баганууд заавал биш; Reach-ийг давхцдаг тул «дутуу».
        expect(result.missing).toEqual(['reach']);
        expect(result.warnings.map(w => w.code)).toContain('non_additive');
        expect(result.breakdown).toEqual([
            { kind: 'campaign', label: 'Mandala Garden lead', values: expect.objectContaining({ reach: 1000, frequency: 3, spend: 50.25 }) },
            { kind: 'campaign', label: 'Elysium awareness', values: expect.objectContaining({ reach: 800, page_engagement: 1000, spend: 20 }) },
        ]);
        expect(result.detectedPeriod).toEqual(week);
    });

    it('uses the file summary row for deduplicated reach and frequency, labelled or unlabelled', () => {
        const labelled = aggregateChannelReport(metaRows([['Results from 2 campaigns', '2026-09-23', '2026-09-29', 1500, 4600, 3.07, 150, 1200, 1050, 70.25]]), suggestMapping(META, 'meta_ads'), 'meta_ads');
        expect(labelled.totals).toMatchObject({ reach: 1500, impressions: 4600, frequency: 3.07, spend: 70.25 });
        expect(labelled.missing).toEqual([]);
        expect(labelled.totalRow).toBe(true);
        expect(labelled.rowCount).toBe(2);
        const unlabelled = aggregateChannelReport(table(META, ['', '2026-09-23', '2026-09-29', 1500, 4600, 3.07, 150, 1200, 1050, 70.25], ...metaRows().map(r => META.map(h => r[h]))), suggestMapping(META, 'meta_ads'), 'meta_ads');
        expect(unlabelled.totals).toMatchObject({ reach: 1500, impressions: 4600, spend: 70.25 });
        expect(unlabelled.rowCount).toBe(2);
    });

    it('counts non-numeric cells as warnings instead of zero and flags a summary mismatch', () => {
        const result = aggregateChannelReport(metaRows([['Broken', '2026-09-23', '2026-09-29', 'n/a?', 'abc', '', 5, 0, 0, '1.234,00'], ['Нийт', '', '', 9999, 4600, '', 999, 0, 0, 70.25]]), suggestMapping(META, 'meta_ads'), 'meta_ads');
        const invalid = result.warnings.filter(w => w.code === 'invalid_number');
        expect(invalid.map(w => [w.field, w.count, w.rows])).toEqual([['reach', 1, [4]], ['impressions', 1, [4]], ['spend', 1, [4]]]);
        expect(result.totals.impressions).toBe(4600);
        expect(result.totals.link_clicks).toBe(155);
        expect(result.warnings.find(w => w.code === 'total_mismatch')?.field).toBe('link_clicks');
        expect(result.totals.reach).toBe(9999);
    });

    it('excludes rows outside the chosen period and then ignores the stale summary row', () => {
        const result = aggregateChannelReport(metaRows([['Old', '2026-09-16', '2026-09-22', 10, 10, 1, 1, 1, 1, 1], ['Total', '', '', 1500, 4610, '', 151, 1201, 1051, 71.25]]), suggestMapping(META, 'meta_ads'), 'meta_ads', { period: week });
        expect(result.excludedRows).toBe(1);
        expect(result.totals.spend).toBe(70.25);
        expect(result.totals.reach).toBeUndefined();
        expect(result.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['out_of_period', 'total_ignored']));
        expect(result.detectedPeriod).toEqual({ from: '2026-09-16', to: '2026-09-29' });
        const none = aggregateChannelReport(metaRows(), suggestMapping(META, 'meta_ads'), 'meta_ads', { period: { from: '2026-10-01', to: '2026-10-07' } });
        expect(none.errors).toEqual(['Сонгосон хугацаанд хамаарах өгөгдөлтэй мөр алга. Хугацаа эсвэл файлаа шалгана уу.']);
    });

    it('never adds different currencies or different result types', () => {
        const header = ['Campaign name', 'Currency', 'Results', 'Result indicator', 'Amount spent'];
        const rows = table(header, ['A', 'USD', 10, 'actions:link_click', 5], ['B', 'MNT', 3, 'onsite_conversion.messaging', 15000]);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'meta_ads'), 'meta_ads');
        // Үр дүн төрлөөр тусдаа; өөр валютын зардал (төрлийн зардал, өртөг ч) нийтэд орохгүй.
        expect(result.totals).toEqual({ results_link_clicks: 10, results_other: 3 });
        expect(result.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['mixed_currency', 'mixed_results']));
        expect(result.warnings.find(w => w.code === 'mixed_results')?.level).toBe('info');
        const unknown = aggregateChannelReport(table(['Campaign name', 'Amount spent'], ['A', 5]), { 'Campaign name': 'campaign', 'Amount spent': 'spend' }, 'meta_ads');
        expect(unknown.totals).toEqual({ spend: 5 });
        expect(unknown.warnings.map(w => w.code)).toContain('unknown_currency');
    });

    it('rejects duplicate column assignments and an empty mapping', () => {
        const duplicate = aggregateChannelReport(metaRows(), { Reach: 'reach', Impressions: 'reach' }, 'meta_ads');
        expect(duplicate.errors[0]).toMatch(/2 багана сонгосон: Reach, Impressions/);
        expect(aggregateChannelReport(metaRows(), { 'Campaign name': 'campaign' }, 'meta_ads').errors).toEqual(['Дор хаяж нэг үзүүлэлтийн баганыг сонгоно уу.']);
    });

    it('aggregates the CallPro group report with hh:mm:ss durations', () => {
        const rows = table(CALLPRO_GROUPS,
            ['Борлуулалт', 120, 100, '05:00:00', '00:03:00', '00:02:10', 2, 5, 8, 10, '00:10:00', 1],
            ['Үйлчилгээ', 30, 20, '01:00:00', '00:03:00', '00:04:05', 0, 1, 4, 6, '00:05:00', 0],
            ['Нийт', 150, 120, '06:00:00', '00:03:00', '00:04:05', 2, 6, 12, 16, '00:15:00', 1]);
        const result = aggregateChannelReport(rows, suggestMapping(CALLPRO_GROUPS, 'callpro'), 'callpro');
        expect(result.shape).toBe('groups');
        expect(result.totals).toEqual({ selected: 150, answered: 120, talk_seconds: 21600, avg_talk_seconds: 180, max_wait_seconds: 245, exit_with_key: 2, transferred: 6, abandoned: 12, missed: 16, lost_wait_seconds: 900, timeout: 1, answer_rate: 80 });
        expect(result.missing).toEqual([]);
        expect(result.breakdown.map(r => [r.kind, r.label, r.values.answered, r.values.avg_talk_seconds])).toEqual([['group', 'Борлуулалт', 100, 180], ['group', 'Үйлчилгээ', 20, 180]]);
        const noTotal = aggregateChannelReport(rows.slice(0, 2), suggestMapping(CALLPRO_GROUPS, 'callpro'), 'callpro');
        expect(noTotal.totals.lost_wait_seconds).toBeUndefined();
        expect(noTotal.totals.avg_talk_seconds).toBe(180);
        expect(noTotal.missing).toEqual(['lost_wait_seconds']);
    });

    it('counts a CallPro call list by status, unique caller and missed calls by UB hour', () => {
        const header = ['Огноо', 'Чиглэл', 'Дугаар', 'Төлөв', 'Ярианы хугацаа', 'Бүлэг'];
        const rows = table(header,
            ['2026-09-23 09:05:00', 'Incoming', '99112233', 'ANSWERED', '00:02:00', 'Борлуулалт'],
            ['2026-09-23 09:40:00', 'Incoming', '+976 9911-2233', 'NO ANSWER', '00:00:00', 'Борлуулалт'],
            [new Date(2026, 8, 24, 13, 1), 'Incoming', '88001122', 'Тасалсан', '', 'Үйлчилгээ'],
            ['2026-09-24T05:30:00Z', 'Incoming', '88001122', 'Алдсан', '', 'Үйлчилгээ'],
            ['2026-09-25 10:00:00', 'Outgoing', '95000000', 'ANSWERED', '00:05:00', 'Борлуулалт'],
            ['2026-09-25 11:00:00', 'Incoming', '12', 'VOICEMAIL', '', 'Борлуулалт'],
            ['2026-09-30 11:00:00', 'Incoming', '95000001', 'ANSWERED', '00:01:00', 'Борлуулалт'],
            ['2026-09-26 12:00:00', 'Transfer?', '95000002', 'ANSWERED', '00:01:00', 'Борлуулалт'],
        );
        const result = aggregateChannelReport(rows, suggestMapping(header, 'callpro'), 'callpro', { period: week });
        expect(result.shape).toBe('calls');
        expect(result.errors).toEqual([]);
        expect(result.totals).toEqual({ calls_total: 5, answered: 1, missed: 2, abandoned: 1, other_status: 1, outbound_calls: 1, unique_callers: 2, unique_missed_callers: 2, talk_seconds: 120, avg_talk_seconds: 120, answer_rate: 20 });
        const hours = result.breakdown.filter(r => r.kind === 'hour');
        expect(hours).toHaveLength(24);
        expect(hours[9].values).toEqual({ calls_total: 2, answered: 1, missed: 1, abandoned: 0 });
        expect(hours[13].values).toEqual({ calls_total: 2, answered: 0, missed: 1, abandoned: 1 });
        expect(peakMissedHours(result.breakdown)).toEqual([{ label: '13:00', missed: 2 }, { label: '09:00', missed: 1 }]);
        expect(result.breakdown.filter(r => r.kind === 'group').map(r => [r.label, r.values.calls_total])).toEqual([['Борлуулалт', 3], ['Үйлчилгээ', 2]]);
        expect(result.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['unknown_status', 'unknown_direction', 'invalid_phone', 'out_of_period']));
        expect(JSON.stringify(result)).not.toContain('99112233');
    });

    it('requires date-time and status for a call list and states when direction is unknown', () => {
        const header = ['Огноо', 'Төлөв'];
        const rows = table(header, ['2026-09-23 10:00', 'Answered']);
        expect(aggregateChannelReport(rows, { 'Огноо': 'call_at' }, 'callpro').errors).toEqual(['Дуудлагын жагсаалтад «Дуудлагын төлөв» баганыг сонгоно уу.']);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'callpro'), 'callpro');
        expect(result.warnings.map(w => w.code)).toContain('no_direction');
        expect(result.missing).toEqual(['unique_callers', 'talk_seconds']);
    });

    it('reads an hourly CallPro table into the hour histogram', () => {
        const header = ['Цаг', 'Бүлгийг сонгосон', 'Хариулсан', 'Алдсан'];
        const rows = table(header, ['09:00-10:00', 10, 8, 2], ['10:00-11:00', 12, 6, 6], ['bad', 1, 1, 0]);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'callpro'), 'callpro');
        expect(result.shape).toBe('hourly');
        expect(result.totals).toMatchObject({ selected: 23, answered: 15, missed: 8, answer_rate: 65.2 });
        expect(result.breakdown.map(r => [r.label, r.values.missed])).toEqual([['09:00', 2], ['10:00', 6]]);
        expect(result.warnings.map(w => w.code)).toContain('invalid_hour');
    });

    it('sums Facebook page days but not unique viewers, and parses unit-labelled watch time', () => {
        const header = ['Date', 'Views', 'Viewers', 'Watch time (seconds)', 'Follows'];
        const rows = table(header, ['2026-09-24', 100, 80, 600, 2], ['2026-09-23', 50, 40, '00:05:00', 1]);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'facebook_page'), 'facebook_page', { period: week });
        expect(result.totals).toEqual({ views: 150, watch_seconds: 900, follows: 3 });
        expect(result.breakdown.map(r => r.label)).toEqual(['2026-09-23', '2026-09-24']);
        expect(result.missing).toContain('viewers');
    });

    it('totals mass SMS and derives send and delivery rates', () => {
        const header = ['Нэр', 'Төлөвлөсөн', 'Илгээсэн', 'Алдаа', 'Хүргэгдсэн'];
        const rows = table(header, ['Нээлтийн урилга', 1000, 980, 20, 950], ['Сануулга', 500, 500, 0, 490]);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'sms'), 'sms');
        expect(result.totals).toEqual({ planned: 1500, sent: 1480, failed: 20, delivered: 1440, send_rate: 98.7, delivery_rate: 97.3 });
        expect(result.missing).toEqual([]);
    });

    it('bounds the breakdown while keeping every row in the totals', () => {
        const header = ['Нэр', 'Илгээсэн'];
        const rows = table(header, ...Array.from({ length: 5 }, (_, i) => [`SMS ${i}`, 10]));
        const result = aggregateChannelReport(rows, suggestMapping(header, 'sms'), 'sms', { breakdownLimit: 3 });
        expect(result.breakdown).toHaveLength(3);
        expect(result.totals.sent).toBe(50);
        expect(result.warnings.map(w => w.code)).toContain('truncated');
    });
});

describe('compareWithPrevious', () => {
    it('returns delta and percentage, null percentage without a base', () => {
        const comparison = compareWithPrevious({ reach: 1500, spend: 70, currency: 'USD', link_clicks: 5 }, { reach: 1000, spend: 0, currency: 'USD' }, 'meta_ads');
        expect(Object.keys(comparison)).toEqual(['reach', 'link_clicks', 'spend']);
        expect(comparison.reach).toEqual({ current: 1500, previous: 1000, delta: 500, pct: 50, comparable: true });
        expect(comparison.spend).toEqual({ current: 70, previous: 0, delta: 70, pct: null, comparable: true });
        expect(comparison.link_clicks).toEqual({ current: 5, previous: null, delta: null, pct: null, comparable: true });
        expect(compareWithPrevious({ answered: 10 }, null, 'callpro').answered).toEqual({ current: 10, previous: null, delta: null, pct: null, comparable: true });
    });

    it('does not compare money across currencies', () => {
        const comparison = compareWithPrevious({ spend: 70, cpm: 2, reach: 10, currency: 'USD' }, { spend: 200000, cpm: 7000, reach: 5, currency: 'MNT' }, 'meta_ads');
        expect(comparison.spend).toMatchObject({ delta: null, pct: null, comparable: false });
        expect(comparison.cpm.comparable).toBe(false);
        expect(comparison.reach).toMatchObject({ delta: 5, pct: 100, comparable: true });
    });
});

describe('formatting and period', () => {
    it('formats values by kind', () => {
        expect(formatChannelValue(3723, 'duration')).toBe('1:02:03');
        expect(formatChannelValue(80, 'percent')).toBe('80%');
        expect(formatChannelValue(70.25, 'money', 'USD')).toMatch(/^70[.,]25 USD$/);
        expect(formatChannelValue(null, 'count')).toBe('—');
    });

    it('accepts up to 93 calendar days in order', () => {
        expect(ChannelPeriodSchema.safeParse(week).success).toBe(true);
        expect(ChannelPeriodSchema.safeParse({ from: '2026-06-01', to: '2026-09-01' }).success).toBe(true);
        expect(ChannelPeriodSchema.safeParse({ from: '2026-06-01', to: '2026-09-02' }).success).toBe(false);
        expect(ChannelPeriodSchema.safeParse({ from: '2026-09-29', to: '2026-09-23' }).success).toBe(false);
        expect(ChannelPeriodSchema.safeParse({ from: '2026-02-30', to: '2026-03-02' }).success).toBe(false);
    });
});
