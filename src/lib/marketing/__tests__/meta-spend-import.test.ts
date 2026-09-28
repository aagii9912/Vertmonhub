// @vitest-environment node
import { expect, it } from 'vitest';
import { buildWorkbookBuffer, readSheetRows } from '@/lib/utils/xlsx';
import { MetaImportOptions, parseMetaSpendFile } from '../meta-spend-import';
import { mergeMarketingSpend } from '../spend-load';
import { buildMarketingPerformance, type MarketingSpend } from '../performance';
import { exportMarketingPerformance } from '../performance-export';

const settings = { accountId: '', currency: '', timezone: 'Asia/Ulaanbaatar', mntPerUnit: 3500, decimal: 'dot' as const };
const header = 'Account ID,Campaign ID,Campaign name,Reporting starts,Reporting ends,Amount spent (USD)\n';
const row = '123456789012345678,987654321098765432,Elysium,2026-09-01,2026-09-01,12.50';
const csv = (body = row) => Buffer.from(header + body);
it('preserves long Meta IDs and daily amounts from a BOM CSV, without an API account', async () => {
    const result = await parseMetaSpendFile(Buffer.from('\uFEFF' + header + row), settings);
    expect(result).toMatchObject({ accountId: 'act_123456789012345678', currency: 'USD', from: '2026-09-01', to: '2026-09-01' });
    expect(result.rows).toEqual([{ campaign_id: '987654321098765432', campaign_name: 'Elysium', spent_at: '2026-09-01', native_amount: '12.50' }]);
});
it('handles quoted commas, explicit summary rows and missing account/currency columns', async () => {
    const file = Buffer.from('Campaign ID,Campaign name,Day,Amount spent\n987,"Elysium, launch",2026-09-01,"1,234.56"\n,Total,,"1,234.56"');
    const result = await parseMetaSpendFile(file, { ...settings, accountId: 'act_123', currency: 'USD' });
    expect(result.rows[0]).toMatchObject({ campaign_name: 'Elysium, launch', native_amount: '1234.56' });
    expect(result.ignoredSummary).toBe(1);
});
it('supports UTF-16 TSV and explicit decimal comma without guessing money', async () => {
    const text = 'Account ID\tCampaign ID\tCampaign name\tDay\tAmount spent (EUR)\n123\t987\tTest\t2026-09-01\t1.234,56';
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    expect((await parseMetaSpendFile(buf, { ...settings, decimal: 'comma' })).rows[0].native_amount).toBe('1234.56');
    await expect(parseMetaSpendFile(buf, settings)).rejects.toThrow(/Мөр 2/);
});
it('supports Excel dates and text IDs, and rejects rounded numeric Meta IDs', async () => {
    const data = { 'Account ID': '123456789012345678', 'Campaign ID': '987654321098765432', 'Campaign name': 'Elysium', Day: new Date(2026, 8, 1), 'Amount spent (USD)': 12.5 };
    const input = await buildWorkbookBuffer([{ name: 'Campaigns', rows: [data] }]);
    expect((await parseMetaSpendFile(input, settings)).rows[0].spent_at).toBe('2026-09-01');
    const unsafe = await buildWorkbookBuffer([{ name: 'Campaigns', rows: [{ ...data, 'Campaign ID': 987654321098765400 }] }]);
    await expect(parseMetaSpendFile(unsafe, settings)).rejects.toThrow(/ID-ийн орон/);
});
it.each([
    [row.replace(/2026-09-01(?=,12)/, '2026-09-10'), /өдөрт хуваахгүй/],
    [`${row}\n${row}`, /давхардлаа/],
    [row.replace(/,12.50$/, ',-1'), /дүн буруу/],
    [row.replace(/,12.50$/, ',12abc'), /дүн буруу/],
    [row.replace(/,12.50$/, ','), /дүн буруу/],
    [row.replaceAll('2026-09-01', '2026-02-30'), /Огноог/],
    [row.replaceAll('2026-09-01', '2099-01-01'), /Ирээдүйн/],
    [row.replace('987654321098765432', '9.87654E+17'), /Campaign ID/],
    [`${row}\n${row.replace('123456789012345678', '999').replace('987654321098765432', '888')}`, /нэг зарын данс/],
])('rejects unsafe file before any writes: %s', async (body, message) => {
    await expect(parseMetaSpendFile(csv(body as string), settings)).rejects.toThrow(message as RegExp);
});
it('requires account timezone, consistent currency and a real conversion rate', async () => {
    expect(MetaImportOptions.safeParse({ ...settings, timezone: '' }).success).toBe(false);
    expect(MetaImportOptions.safeParse({ ...settings, mntPerUnit: 0 }).success).toBe(false);
    await expect(parseMetaSpendFile(csv(), { ...settings, currency: 'MNT' })).rejects.toThrow(/валюттай зөрж/);
    await expect(parseMetaSpendFile(Buffer.from((header + row).replace('USD', 'MNT')), settings)).rejects.toThrow(/ханш 1/);
    await expect(parseMetaSpendFile(csv(row.replace('123456789012345678', '')), settings)).rejects.toThrow(/дансны ID/);
});
it('rejects unquoted thousands separators and duplicate headers rather than truncating spend', async () => {
    await expect(parseMetaSpendFile(csv(row.replace('12.50', '1,234.56')), settings)).rejects.toThrow(/нэмэлт багана/);
    await expect(parseMetaSpendFile(Buffer.from(header.trim() + ',Amount spent (USD)\n' + row + ',20'), settings)).rejects.toThrow(/давхардсан багана/);
});
it('rejects ad-level breakdowns and files spanning too many days or sheets', async () => {
    await expect(parseMetaSpendFile(Buffer.from(header.trim() + ',Ad ID\n' + row + ',111'), settings)).rejects.toThrow(/Campaign түвшний/);
    await expect(parseMetaSpendFile(csv(`${row}\n${row.replaceAll('2026-09-01', '2026-01-01')}`), settings)).rejects.toThrow(/93/);
    const file = await buildWorkbookBuffer([{ name: 'one', rows: [{ A: 'value' }] }, { name: 'two', rows: [{ B: 'value' }] }]);
    await expect(parseMetaSpendFile(file, settings)).rejects.toThrow(/Нэг sheet/);
});
it('includes file spend in the shared dashboard/AI/Excel report, with mapped project and manual overlap', async () => {
    const activity = { id: 'activity', name: 'Elysium', project_id: 'project', marketing_owner_name: 'Номин', external_campaign_id: '987', channel: 'meta_ads', activity_kind: 'campaign' as const, status: 'active', start_date: null, completed_on: null };
    const manual: MarketingSpend = { id: 'manual', spent_at: '2026-09-01', amount: 43750, channel: 'meta_ads', project_id: 'project', marketing_owner_name: 'Номин', marketing_campaign_id: 'activity', note: null };
    const spend = mergeMarketingSpend([manual], [{ id: 'file', account_id: 'act_123', campaign_id: '987', campaign_name: 'Elysium', spent_at: '2026-09-01', native_amount: '12.5', currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: 43750, mnt_per_unit: 3500, ingestion_source: 'file' }], [], [activity]);
    expect(spend.find(s => s.id === 'manual')?.exclusion).toBe('manual_overlap');
    expect(spend.find(s => s.source === 'meta')).toMatchObject({ project_id: 'project', ingestionSource: 'file' });
    const report = buildMarketingPerformance({ projects: [{ id: 'project', name: 'Elysium' }], activities: [activity], leads: [], contracts: [], targets: [], spend }, { from: '2026-09-01', to: '2026-09-30' });
    expect(report.totals.spend).toBe(43750);
    expect(report.spendQuality.current.excludedManual).toBe(1);
    const sheet = await readSheetRows(await exportMarketingPerformance(report));
    expect(JSON.stringify(sheet)).toContain('43750');
});
