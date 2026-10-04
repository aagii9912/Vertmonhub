// @vitest-environment node
import { expect, it } from 'vitest';
import { buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { ChannelFileError, channelFileHash, readChannelFile, sampleValues } from '../channel-reports-file';
import { aggregateChannelReport, suggestMapping } from '../channel-reports';

it('finds the CallPro header below report titles in an xlsx and keeps Excel time cells', async () => {
    const workbook = await buildWorkbookBuffer([
        { name: 'Тайлбар', aoa: [['CallPro']] },
        { name: 'Бүлгийн тайлан', aoa: [
            ['Бүлгийн тайлан'],
            ['Хугацаа: 2026-09-23 — 2026-09-29'],
            ['Бүлэг', 'Бүлгийг сонгосон', 'Хариулсан', 'Нийт ярианы хугацаа (hh:mm:ss)', 'Алдсан'],
            ['Борлуулалт', 120, 100, new Date(1899, 11, 30, 5, 0, 0), 10],
            ['Үйлчилгээ', 30, 20, '01:00:00', 6],
        ] },
    ]);
    await expect(readChannelFile(workbook, 'callpro', 'Байхгүй')).rejects.toBeInstanceOf(ChannelFileError);
    const table = await readChannelFile(workbook, 'callpro', 'Бүлгийн тайлан');
    expect(table).toMatchObject({ sheets: ['Тайлбар', 'Бүлгийн тайлан'], sheet: 'Бүлгийн тайлан', headerRow: 3, firstLine: 4 });
    expect(table.headers).toEqual(['Бүлэг', 'Бүлгийг сонгосон', 'Хариулсан', 'Нийт ярианы хугацаа (hh:mm:ss)', 'Алдсан']);
    const result = aggregateChannelReport(table.rows, suggestMapping(table.headers, 'callpro'), 'callpro', { firstLine: table.firstLine });
    expect(result.totals).toMatchObject({ selected: 150, answered: 120, talk_seconds: 21600, missed: 16, avg_talk_seconds: 180 });
    expect(sampleValues(table, 1)).toMatchObject({ 'Бүлэг': ['Борлуулалт'], 'Хариулсан': ['100'] });
});

it('reads BOM CSV as text, rejects .xls content and hashes the exact bytes', async () => {
    const csv = Buffer.from('﻿Нэр,Төлөвлөсөн,Илгээсэн\nУрилга,"1,000",980\n');
    const table = await readChannelFile(csv, 'sms');
    expect(table.rows).toEqual([{ 'Нэр': 'Урилга', 'Төлөвлөсөн': '1,000', 'Илгээсэн': '980' }]);
    await expect(readChannelFile(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'sms')).rejects.toThrow(/\.xls/);
    await expect(readChannelFile(Buffer.from('Нэр,Илгээсэн\n'), 'sms')).rejects.toThrow(/өгөгдөлтэй мөр алга/);
    expect(channelFileHash(csv)).toBe(channelFileHash(new Uint8Array(csv)));
    expect(channelFileHash(csv)).not.toBe(channelFileHash(Buffer.from('x')));
});
