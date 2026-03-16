import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/import/templates?type=properties
 * Download Excel template for a specific import type
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'properties';

    const templates: Record<string, { headers: string[]; sampleRow?: Record<string, any>; sheetName: string }> = {
        properties: {
            sheetName: 'Байрны мэдээлэл',
            headers: [
                'Байрны нэр/код', 'Блок', 'Давхар', 'Өрөөний тоо',
                'Унтлагын өрөө', 'Угаалгын өрөө', 'Нийт талбай (м²)',
                'Үнэ (₮)', '1м²-ийн үнэ', 'Статус', 'Чиглэл (зүг)',
                'Тагт/Балкон', 'Дүүрэг', 'Тайлбар'
            ],
            sampleRow: {
                'Байрны нэр/код': 'A-301',
                'Блок': 'A',
                'Давхар': '3',
                'Өрөөний тоо': 3,
                'Унтлагын өрөө': 2,
                'Угаалгын өрөө': 1,
                'Нийт талбай (м²)': 95,
                'Үнэ (₮)': 380000000,
                '1м²-ийн үнэ': 4000000,
                'Статус': 'available',
                'Чиглэл (зүг)': 'Өмнөд',
                'Тагт/Балкон': 'Тийм',
                'Дүүрэг': 'Хан-Уул',
                'Тайлбар': 'Өмнөд харагдацтай, наранд'
            }
        },
        faq: {
            sheetName: 'FAQ',
            headers: ['Асуулт', 'Хариулт'],
            sampleRow: {
                'Асуулт': 'Урьдчилгаа хэд вэ?',
                'Хариулт': 'Урьдчилгаа 30% бөгөөд бэлнээр төлвөл 5% хөнгөлөлт үзүүлнэ.'
            }
        },
        company: {
            sheetName: 'Компанийн мэдээлэл',
            headers: [
                'Компанийн бүтэн нэр', 'Үүсгэн байгуулагдсан он', 'Утас (компани)',
                'Имэйл', 'Вэбсайт', 'Хаяг (оффис)', 'Facebook хуудас',
                'Instagram хуудас', 'Компанийн товч танилцуулга', 'Нийт барьсан төслийн тоо'
            ],
            sampleRow: {
                'Компанийн бүтэн нэр': 'Монкон Констракшн',
                'Үүсгэн байгуулагдсан он': '2010',
                'Утас (компани)': '7700-0000',
                'Имэйл': 'info@moncon.mn',
                'Вэбсайт': 'https://moncon.mn',
                'Хаяг (оффис)': 'УБ, Хан-Уул дүүрэг',
                'Facebook хуудас': 'https://facebook.com/moncon',
                'Instagram хуудас': 'https://instagram.com/moncon',
                'Компанийн товч танилцуулга': 'Монгол улсын тэргүүлэх барилгын компани',
                'Нийт барьсан төслийн тоо': '15'
            }
        },
        project: {
            sheetName: 'Төслийн мэдээлэл',
            headers: [
                'Төслийн нэр', 'Байршил', 'Дүүрэг', 'GPS координат (lat, lng)',
                'Нийт блокийн тоо', 'Нийт давхарын тоо', 'Нийт байрны тоо',
                'Баригдаж эхэлсэн огноо', 'Хүлээлгэж өгөх огноо',
                'Барилгын явц (%)', 'Төслийн тайлбар'
            ],
            sampleRow: {
                'Төслийн нэр': 'Mandala Garden',
                'Байршил': 'Энхтайвны өргөн чөлөө',
                'Дүүрэг': 'Баянгол',
                'GPS координат (lat, lng)': '47.9184, 106.9177',
                'Нийт блокийн тоо': 3,
                'Нийт давхарын тоо': '20 давхар',
                'Нийт байрны тоо': 450,
                'Баригдаж эхэлсэн огноо': '2024-06-01',
                'Хүлээлгэж өгөх огноо': '2026-12-01',
                'Барилгын явц (%)': '65%',
                'Төслийн тайлбар': 'Орчин үеийн амьдралын хотхон'
            }
        },
        payment_policy: {
            sheetName: 'Төлбөрийн бодлого',
            headers: [
                'Төсөл', 'Урьдчилгаа (%)', 'Хөсөчилсөн төлбөр',
                'Хөсөчлөх хугацаа', 'Бэлнээр хөнгөлөлт (%)',
                'VIP хөнгөлөлт (%)', 'Эрт захиалгын хөнгөлөлт'
            ],
            sampleRow: {
                'Төсөл': 'Mandala Garden',
                'Урьдчилгаа (%)': '30',
                'Хөсөчилсөн төлбөр': 'Тийм',
                'Хөсөчлөх хугацаа': '24 сар',
                'Бэлнээр хөнгөлөлт (%)': '5',
                'VIP хөнгөлөлт (%)': '3',
                'Эрт захиалгын хөнгөлөлт': '2%'
            }
        },
        loan_info: {
            sheetName: 'Зээлийн мэдээлэл',
            headers: [
                'Хамтрагч банкууд', 'Зээлийн хүү (жилийн)', 'Зээлийн хугацаа (жил)',
                '"8% зээл" хөтөлбөр', 'Ажоны байр хөтөлбөр', 'Шаардлагатай бичиг баримт'
            ],
            sampleRow: {
                'Хамтрагч банкууд': 'Хаан банк, Голомт банк, ХХБ',
                'Зээлийн хүү (жилийн)': '12% - 14%',
                'Зээлийн хугацаа (жил)': '20 - 30 жил',
                '"8% зээл" хөтөлбөр': 'Тийм',
                'Ажоны байр хөтөлбөр': 'Тийм',
                'Шаардлагатай бичиг баримт': 'Иргэний үнэмлэх, Орлого нотлох, Урьдчилгаа нотлох'
            }
        },
        amenities: {
            sheetName: 'Тохилог/Онцлог',
            headers: ['Төсөл', 'Онцлог', 'Тийм/Үгүй', 'Дэлгэрэнгүй'],
            sampleRow: {
                'Төсөл': 'Mandala Garden',
                'Онцлог': 'Лифт',
                'Тийм/Үгүй': 'Тийм',
                'Дэлгэрэнгүй': '4ш'
            }
        },
        ai_extra: {
            sheetName: 'AI нэмэлт мэдээлэл',
            headers: ['Мэдээлэл', 'Утга'],
            sampleRow: {
                'Мэдээлэл': 'Борлуулалтын менежерийн утас',
                'Утга': '9911-2233'
            }
        },
    };

    const tmpl = templates[type];
    if (!tmpl) {
        return NextResponse.json({ error: 'Буруу template төрөл' }, { status: 400 });
    }

    // Create workbook with headers + sample row
    const wb = XLSX.utils.book_new();
    const data = [tmpl.headers];
    if (tmpl.sampleRow) {
        data.push(tmpl.headers.map(h => tmpl.sampleRow![h] ?? ''));
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = tmpl.headers.map(h => ({ wch: Math.max(h.length + 4, 18) }));

    XLSX.utils.book_append_sheet(wb, ws, tmpl.sheetName);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${type}_template.xlsx"`,
        },
    });
}
