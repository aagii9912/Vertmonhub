import { describe, it, expect } from 'vitest';
import {
    getVal,
    getNum,
    getInt,
    getPct,
    toDateStr,
    slugifyKey,
    knowledgeKey,
    isYes,
    findStaleKnowledgeKeys,
    mapPropertyType,
    mapPropertyStatus,
    mapLeadStatus,
    mapContractStatus,
    mapPropertyRow,
    mapLeadRow,
    mapContractRow,
    mapFaqRow,
    normalizePhoneKey,
    buildCompanyKnowledge,
    buildProjectKnowledge,
    buildPaymentPolicyKnowledge,
    buildLoanKnowledge,
    buildAmenitiesKnowledge,
    buildAiExtraEntries,
} from '../mappers';

describe('getVal / getNum', () => {
    it('эхний хоосон биш түлхүүрийг буцаана', () => {
        expect(getVal({ 'Нэр': ' A-301 ', name: 'x' }, 'Нэр', 'name')).toBe('A-301');
        expect(getVal({ 'Нэр': '', name: 'B-102' }, 'Нэр', 'name')).toBe('B-102');
        expect(getVal({}, 'Нэр')).toBe('');
    });

    it('₮, таслал, хувь тэмдэгтийг цэвэрлэж тоо болгоно', () => {
        expect(getNum({ 'Үнэ': '380,000,000₮' }, 'Үнэ')).toBe(380000000);
        expect(getNum({ 'Урьдчилгаа': '30%' }, 'Урьдчилгаа')).toBe(30);
        expect(getNum({ 'Үнэ': 'үнэгүй' }, 'Үнэ')).toBeNull();
        expect(getNum({}, 'Үнэ')).toBeNull();
    });

    it('getInt бутархайг бүхэлчилнэ (INTEGER багана)', () => {
        expect(getInt({ 'Өрөө': '2.5' }, 'Өрөө')).toBe(3);
        expect(getInt({ 'Өрөө': 3 }, 'Өрөө')).toBe(3);
        expect(getInt({}, 'Өрөө')).toBeNull();
    });

    it('getPct — Excel-ийн "30%" → 0.3 бутархайг 30 болгож сэргээнэ', () => {
        expect(getPct({ 'Урьдчилгаа': 0.3 }, 'Урьдчилгаа')).toBe(30);
        expect(getPct({ 'Урьдчилгаа': 0.755 }, 'Урьдчилгаа')).toBe(75.5);
        expect(getPct({ 'Урьдчилгаа': '30%' }, 'Урьдчилгаа')).toBe(30);
        expect(getPct({ 'Урьдчилгаа': 30 }, 'Урьдчилгаа')).toBe(30);
        expect(getPct({ 'Явц': 1 }, 'Явц')).toBe(100); // "100%" форматтай нүд raw=1.0
        expect(getPct({}, 'Урьдчилгаа')).toBeNull();
    });
});

describe('findStaleKnowledgeKeys — хуучирсан давхар түлхүүр цэвэрлэгээ', () => {
    it('гар скриптийн богино угтварт түлхүүрийг каноник нэрээр солиход устгана', () => {
        const stale = findStaleKnowledgeKeys(
            ['mandala_payment', 'mandala_overview', 'unrelated_key'],
            { mandala_garden_payment: 'x' },
            [{ key: 'mandala_garden_payment', suffix: 'payment' }],
            new Set(['mandala_garden'])
        );
        expect(stale).toEqual(['mandala_payment']);
    });

    it('patch-д багтсан түлхүүрийг хэзээ ч устгахгүй (нэг файлд угтвар-хамааралтай 2 төсөл)', () => {
        const patch = { vista_payment: 'a', vista_2_payment: 'b' };
        const stale = findStaleKnowledgeKeys(
            ['vista_payment', 'vista_2_payment'],
            patch,
            [
                { key: 'vista_payment', suffix: 'payment' },
                { key: 'vista_2_payment', suffix: 'payment' },
            ],
            new Set()
        );
        expect(stale).toEqual([]);
    });

    it('projects хүснэгтэд байгаа жинхэнэ төслийн түлхүүрийг устгахгүй', () => {
        // 'Vista' ба 'Vista 2' хоёулаа жинхэнэ төсөл — бие биенийхээ импортод устахгүй
        const stale = findStaleKnowledgeKeys(
            ['vista_payment'],
            { vista_2_payment: 'x' },
            [{ key: 'vista_2_payment', suffix: 'payment' }],
            new Set(['vista', 'vista_2'])
        );
        expect(stale).toEqual([]);
    });

    it('өөр suffix болон угтвар-хамааралгүй түлхүүрт хүрэхгүй', () => {
        const stale = findStaleKnowledgeKeys(
            ['mandala_loan', 'elysium_payment', 'payment'],
            { mandala_garden_payment: 'x' },
            [{ key: 'mandala_garden_payment', suffix: 'payment' }],
            new Set()
        );
        expect(stale).toEqual([]);
    });
});

describe('toDateStr', () => {
    it('Date обьектыг YYYY-MM-DD болгоно', () => {
        expect(toDateStr(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
    });

    it('Excel serial тоог хөрвүүлнэ', () => {
        // 46057 = 2026-02-04 (1900 date system)
        expect(toDateStr(46057)).toBe('2026-02-04');
    });

    it('текст огноог дэмжинэ (-, ., /)', () => {
        expect(toDateStr('2026-01-15')).toBe('2026-01-15');
        expect(toDateStr('2026.1.5')).toBe('2026-01-05');
        expect(toDateStr('2026/01/15')).toBe('2026-01-15');
    });

    it('буруу утгад null буцаана', () => {
        expect(toDateStr('')).toBeNull();
        expect(toDateStr(null)).toBeNull();
        expect(toDateStr('огноогүй')).toBeNull();
        expect(toDateStr(5)).toBeNull();
    });

    it('хүчингүй сар/өдрийг null болгоно (batch унагахгүй)', () => {
        expect(toDateStr('2026.13.05')).toBeNull();
        expect(toDateStr('2026-01-45')).toBeNull();
        expect(toDateStr('2026-00-10')).toBeNull();
    });
});

describe('slugifyKey / knowledgeKey', () => {
    it('латин болон кирилл нэрийг slug болгоно', () => {
        expect(slugifyKey('Mandala Garden')).toBe('mandala_garden');
        expect(slugifyKey('Ажлын цаг')).toBe('ажлын_цаг');
        expect(slugifyKey('  ')).toBe('general');
    });

    it('төслийн нэрээр угтварлана', () => {
        expect(knowledgeKey('Mandala Garden', 'payment')).toBe('mandala_garden_payment');
        expect(knowledgeKey('', 'payment')).toBe('payment');
        expect(knowledgeKey(null, 'loan')).toBe('loan');
    });

    it('ai_knowledge_base.key VARCHAR(100)-д багтааж клампдана', () => {
        const longProject = 'а'.repeat(80);
        const longSuffix = 'б'.repeat(80);
        expect(knowledgeKey(longProject, longSuffix).length).toBeLessThanOrEqual(100);
    });
});

describe('isYes', () => {
    it('үгүй/no/false/0-г худал гэж үзнэ', () => {
        expect(isYes('Тийм')).toBe(true);
        expect(isYes('Үгүй')).toBe(false);
        expect(isYes('no')).toBe(false);
        expect(isYes('')).toBe(false);
    });
});

describe('status mapping — схемийн жинхэнэ утгууд', () => {
    it('property type/status', () => {
        expect(mapPropertyType('Байр')).toBe('apartment');
        expect(mapPropertyType('оффис')).toBe('office');
        expect(mapPropertyType('юу ч биш')).toBe('apartment');
        expect(mapPropertyStatus('Зарагдсан')).toBe('sold');
        expect(mapPropertyStatus('бартер')).toBe('barter');
        expect(mapPropertyStatus('Худалдаанд')).toBe('available');
    });

    it('lead status зөвхөн lead_status enum-ийн утга буцаана', () => {
        const validStatuses = [
            'new', 'contacted', 'viewing_scheduled', 'offered',
            'negotiating', 'closed_won', 'closed_lost',
        ];
        const inputs = [
            'new', 'шинэ', 'contacted', 'холбогдсон', 'qualified', 'шалгарсан',
            'negotiation', 'хэлэлцэж буй', 'won', 'амжилттай', 'lost', 'алдсан',
            'буцсан', 'юу ч биш', '',
        ];
        for (const input of inputs) {
            expect(validStatuses).toContain(mapLeadStatus(input));
        }
        // Өмнөх код 'qualified'/'won'/'lost' гэх enum-д байхгүй утга үүсгэдэг байсан
        expect(mapLeadStatus('qualified')).toBe('offered');
        expect(mapLeadStatus('won')).toBe('closed_won');
        expect(mapLeadStatus('lost')).toBe('closed_lost');
        expect(mapLeadStatus('negotiation')).toBe('negotiating');
    });

    it('contract status нь dashboard-ийн active/closed/cancelled утгууд', () => {
        expect(mapContractStatus('идэвхтэй')).toBe('active');
        expect(mapContractStatus('completed')).toBe('closed');
        expect(mapContractStatus('дууссан')).toBe('closed');
        expect(mapContractStatus('цуцалсан')).toBe('cancelled');
        expect(mapContractStatus('pending')).toBe('active');
        expect(mapContractStatus('')).toBe('active');
    });
});

describe('mapPropertyRow', () => {
    it('бүрэн мөрийг properties схемд буулгана', () => {
        const { data, error } = mapPropertyRow({
            'Нэр': 'A-301 3 өрөө',
            'Төрөл': 'apartment',
            'Үнэ': '380000000',
            'Талбай': '95',
            'Өрөө': '3',
            'Унтлагын өрөө': '2',
            'Угаалгын өрөө': '1',
            'Давхар': '3/12',
            'Хаяг': 'Mandala Garden',
            'Дүүрэг': 'Хан-Уул',
            'Статус': 'available',
            'Блок': 'A',
            'Тайлбар': 'Өмнөд харагдацтай',
            '1м² үнэ': '4000000',
        }, 2);

        expect(error).toBeUndefined();
        expect(data).toMatchObject({
            name: 'A-301 3 өрөө',
            type: 'apartment',
            price: 380000000,
            price_per_sqm: 4000000,
            size_sqm: 95,
            rooms: 3,
            bedrooms: 2,
            bathrooms: 1,
            floor: '3/12',
            district: 'Хан-Уул',
            status: 'available',
            is_active: true,
        });
        expect(data!.features).toContain('Блок: A');
    });

    it('нэр эсвэл үнэ дутуу бол алдаа буцаана', () => {
        expect(mapPropertyRow({ 'Үнэ': '100' }, 3).error).toContain('Мөр 3');
        expect(mapPropertyRow({ 'Нэр': 'X' }, 4).error).toContain('Үнэ буруу');
        expect(mapPropertyRow({ 'Нэр': 'X', 'Үнэ': '0' }, 5).error).toContain('Үнэ буруу');
    });

    it('provided = зөвхөн файлд байсан баганууд (үнийн файл статус/төрлийг дарахгүй)', () => {
        const { provided } = mapPropertyRow({ 'Нэр': 'A-301', 'Үнэ': '380000000' }, 2);
        expect(provided).toEqual(['name', 'price']);

        const full = mapPropertyRow({ 'Нэр': 'A-301', 'Үнэ': '1', 'Статус': 'sold', 'Өрөө': '3' }, 2);
        expect(full.provided).toContain('status');
        expect(full.provided).toContain('rooms');
        expect(full.provided).not.toContain('description');
    });
});

describe('mapLeadRow — leads хүснэгтийн жинхэнэ баганууд', () => {
    it('customer_* багануудад буулгана (name/phone/email БИШ)', () => {
        const { data, error } = mapLeadRow({
            'Нэр': 'Бат Болд',
            'Утас': '99112233',
            'Имэйл': 'bat@email.com',
            'Сонирхож буй': 'A-301 3 өрөө',
            'Төсөв': '350000000',
            'Эх сурвалж': 'Facebook',
            'Тэмдэглэл': 'Зээлээр авна',
            'Статус': 'new',
        }, 2);

        expect(error).toBeUndefined();
        expect(data).toMatchObject({
            customer_name: 'Бат Болд',
            customer_phone: '99112233',
            customer_email: 'bat@email.com',
            budget_max: 350000000,
            source: 'Facebook',
            status: 'new',
        });
        // Схемд байхгүй interested_in баганын оронд notes-д нэгтгэнэ
        expect(data!.notes).toContain('Сонирхож буй: A-301 3 өрөө');
        expect(data!.notes).toContain('Зээлээр авна');
        expect(data).not.toHaveProperty('name');
        expect(data).not.toHaveProperty('interested_in');
        expect(data).not.toHaveProperty('budget');
    });

    it('нэр/утас дутууг алдаа болгоно', () => {
        expect(mapLeadRow({ 'Утас': '99112233' }, 2).error).toContain('Нэр хоосон');
        expect(mapLeadRow({ 'Нэр': 'Бат' }, 3).error).toContain('Утас хоосон');
    });

    it('normalizePhoneKey зөвхөн цифр үлдээнэ', () => {
        expect(normalizePhoneKey('9911-2233')).toBe('99112233');
        expect(normalizePhoneKey('+976 9911 2233')).toBe('97699112233');
    });
});

describe('mapContractRow — property_contracts-ийн жинхэнэ баганууд', () => {
    it('customer_name/unit_number/contract_status багануудад буулгана', () => {
        const { data, error } = mapContractRow({
            'Гэрээний дугаар': 'MG-2026-001',
            'Худалдан авагч': 'Бат Болд',
            'Худалдан авагч утас': '99112233',
            'Блок': 'A',
            'Байрны нэр': 'A-301',
            'Нийт үнэ': '380000000',
            'Урьдчилгаа': '114000000',
            'Гэрээний огноо': '2026-01-15',
            'Статус': 'active',
            'Тэмдэглэл': 'Зээлээр',
        }, 2);

        expect(error).toBeUndefined();
        expect(data).toMatchObject({
            contract_number: 'MG-2026-001',
            customer_name: 'Бат Болд',
            customer_phone: '99112233',
            block_name: 'A',
            unit_number: 'A-301',
            total_price: 380000000,
            prepayment_paid: 114000000,
            paid_amount: 114000000,
            balance: 266000000,
            contract_date: '2026-01-15',
            contract_status: 'active',
            product_type: 'residential',
            notes: 'Зээлээр',
        });
        expect(data).not.toHaveProperty('buyer_name');
        expect(data).not.toHaveProperty('property_name');
        expect(data).not.toHaveProperty('down_payment');
        expect(data).not.toHaveProperty('remaining_balance');
    });

    it('урьдчилгаагүй бол balance = нийт үнэ, paid_amount = 0', () => {
        const { data } = mapContractRow({
            'Гэрээний дугаар': 'X-1',
            'Худалдан авагч': 'Сараа',
            'Байрны нэр': 'B-501',
            'Нийт үнэ': '280000000',
        }, 2);
        expect(data!.balance).toBe(280000000);
        expect(data!.paid_amount).toBe(0);
        expect(data!.prepayment_paid).toBeNull();
    });

    it('заавал талбар дутууг алдаа болгоно', () => {
        expect(mapContractRow({ 'Худалдан авагч': 'X', 'Байрны нэр': 'Y', 'Нийт үнэ': '1' }, 2).error).toContain('Гэрээний дугаар');
        expect(mapContractRow({ 'Гэрээний дугаар': 'C-1', 'Байрны нэр': 'Y', 'Нийт үнэ': '1' }, 2).error).toContain('Худалдан авагч');
        expect(mapContractRow({ 'Гэрээний дугаар': 'C-1', 'Худалдан авагч': 'X', 'Нийт үнэ': '1' }, 2).error).toContain('Байрны нэр');
        expect(mapContractRow({ 'Гэрээний дугаар': 'C-1', 'Худалдан авагч': 'X', 'Байрны нэр': 'Y' }, 2).error).toContain('Нийт үнэ');
    });

    it('сөрөг урьдчилгааг алдаа болгоно (CHECK constraint batch унагахгүй)', () => {
        const { error } = mapContractRow({
            'Гэрээний дугаар': 'C-1', 'Худалдан авагч': 'X', 'Байрны нэр': 'Y',
            'Нийт үнэ': '100', 'Урьдчилгаа': '-5',
        }, 2);
        expect(error).toContain('сөрөг');
    });

    it('provided = зөвхөн файлд байсан баганууд (Урьдчилгаагүй файл төлбөрийн явцыг дарахгүй)', () => {
        const { provided } = mapContractRow({
            'Гэрээний дугаар': 'C-1', 'Худалдан авагч': 'X', 'Байрны нэр': 'Y', 'Нийт үнэ': '100',
        }, 2);
        expect(provided).toEqual(['contract_number', 'customer_name', 'unit_number', 'total_price']);
        expect(provided).not.toContain('paid_amount');
        expect(provided).not.toContain('contract_status');
    });
});

describe('mapFaqRow', () => {
    it('асуулт/хариултыг буулгана', () => {
        const { data } = mapFaqRow({ 'Асуулт': 'Урьдчилгаа хэд вэ?', 'Хариулт': '30%' }, 2);
        expect(data).toEqual({ question: 'Урьдчилгаа хэд вэ?', answer: '30%' });
    });

    it('дутуу мөрийг алдаа болгоно', () => {
        expect(mapFaqRow({ 'Асуулт': 'Х?' }, 2).error).toBeDefined();
        expect(mapFaqRow({ 'Хариулт': 'Тийм' }, 3).error).toBeDefined();
    });
});

describe('мэдлэгийн текст бүтээгчид', () => {
    it('компанийн мэдээллийг текст болгоно', () => {
        const text = buildCompanyKnowledge({
            'Компанийн бүтэн нэр': 'Vertmon LLC',
            'Утас': '77001122',
            'Вэбсайт': 'vertmon.mn',
        });
        expect(text).toContain('Компанийн нэр: Vertmon LLC');
        expect(text).toContain('Утас: 77001122');
        expect(text).not.toContain('Имэйл');
    });

    it('хоосон мөрөнд хоосон текст буцаана', () => {
        expect(buildCompanyKnowledge({})).toBe('');
    });

    it('төслийн мэдээлэл + projects хүснэгтийн талбарууд', () => {
        const { data, error } = buildProjectKnowledge({
            'Төслийн нэр': 'Mandala Garden',
            'Байршил': 'Зайсан',
            'Дүүрэг': 'Хан-Уул',
            'Нийт блокийн тоо': '3',
            'Нийт давхарын тоо': '12',
            'Нийт байрны тоо': '360',
            'Барилгын явц': '75%',
            'Хүлээлгэж өгөх огноо': '2026-06-01',
        }, 2);

        expect(error).toBeUndefined();
        expect(data!.name).toBe('Mandala Garden');
        expect(data!.text).toContain('Нийт блок: 3');
        expect(data!.text).toContain('Барилгын явц: 75%');
        expect(data!.text).toContain('Хүлээлгэж өгөх огноо: 2026-06-01');
        expect(data!.projectFields).toEqual({
            name: 'Mandala Garden',
            location: 'Зайсан',
            district: 'Хан-Уул',
            total_blocks: 3,
            total_floors: '12',
            total_units: 360,
            description: null,
        });
    });

    it('нэргүй төслийг алдаа болгоно', () => {
        expect(buildProjectKnowledge({}, 5).error).toContain('Мөр 5');
    });

    it('төлбөрийн бодлого — хуучин typo толгой мөрүүдийг мөн уншина', () => {
        const { project, text } = buildPaymentPolicyKnowledge({
            'Төсөл': 'Mandala Garden',
            'Урьдчилгаа': '30%',
            'Хөсөчилсөн төлбөр': 'Тийм',
            'Хасагчлэх хугацаа': '12 сар',
        });
        expect(project).toBe('Mandala Garden');
        expect(text).toContain('Урьдчилгаа: 30%');
        expect(text).toContain('Хэсэгчилсэн төлбөр: Тийм');
        expect(text).toContain('Хэсэгчлэх хугацаа: 12 сар');
    });

    it('зээлийн мэдээлэл', () => {
        const text = buildLoanKnowledge({
            'Хамтрагч банкууд': 'Хаан, Голомт',
            'Зээлийн хүү': '8-12%',
            '"8% зээл" хөтөлбөр': 'Тийм',
        });
        expect(text).toContain('Хамтрагч банкууд: Хаан, Голомт');
        expect(text).toContain('"8% зээл" хөтөлбөр: Тийм');
    });

    it('тохилог — төслөөр бүлэглэж, "Үгүй"-г хасна', () => {
        const byProject = buildAmenitiesKnowledge([
            { 'Төсөл': 'Mandala Garden', 'Онцлог': 'Автозогсоол', 'Тийм/Үгүй': 'Тийм', 'Дэлгэрэнгүй': '500 машины' },
            { 'Төсөл': 'Mandala Garden', 'Онцлог': 'Усан сан', 'Тийм/Үгүй': 'Үгүй' },
            { 'Төсөл': 'Elysium', 'Онцлог': 'Фитнес', 'Тийм/Үгүй': 'Тийм' },
        ]);
        expect(byProject.get('Mandala Garden')).toEqual(['Автозогсоол (500 машины)']);
        expect(byProject.get('Elysium')).toEqual(['Фитнес']);
    });

    it('AI нэмэлт — мөр бүр key/value, дутууг алдаа болгоно', () => {
        const { entries, errors } = buildAiExtraEntries([
            { 'Мэдээлэл': 'Ажлын цаг', 'Утга': 'Даваа-Баасан 09:00-18:00' },
            { 'Мэдээлэл': '', 'Утга': 'x' },
            { 'Мэдээлэл': 'Хоосон утга' },
        ]);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ key: 'ажлын_цаг', label: 'Ажлын цаг' });
        expect(errors).toHaveLength(2);
    });
});
