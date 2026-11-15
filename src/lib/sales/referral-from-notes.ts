/**
 * «Сэжим (хаанаас ирсэн)»-ийг уулзалтын «Тэмдэглэл»-ээс (agent_notes) таних — эзэмшигчийн шийдвэр 2026-11-15:
 * менежерүүд сэжмийг тусдаа сонгогчоор биш, тэмдэглэлдээ бичдэг («facebook», «ойрхон амьдардаг», «танил» …), тиймээс
 * тайлангийн «Сэжим» хүснэгт тэмдэглэлээс гарна; өмнөх уулзалтууд ч мөн адил (тайлан гаргах үед таних тул өгөгдөл
 * өөрчлөхгүй). Уулзалтад сэжим СОНГОСОН бол (`referral_source_id`) тэр нь давамгайлна.
 *
 * Дүрэм (цэвэр, client-safe):
 *  • Тэмдэглэлийг W12-ын нэрс (`DEFAULT_REFERRAL_SOURCES`) рүү түлхүүр үгээр тулгана; төслийн өөрийн идэвхтэй
 *    сэжмийн нэр тэмдэглэлд байвал тэр нэрээр.
 *  • Хэд хэдэн үг таарвал тэмдэглэлд ЭХЭЛЖ бичсэн нь (уулзалт бүр нэг сэжимд).
 *  • Нэг ч үг таараагүй тэмдэглэл → «Бусад»; хоосон тэмдэглэл → null (тайланд «Тодорхойгүй», 0 биш).
 * Түлхүүр үгс нь код дахь тогтмол — багийн бичдэг хэллэгээс (2026-11-15-ны бодит тэмдэглэлүүд) авсан.
 */
export const REFERRAL_OTHER = 'Бусад';

const KEYWORD_RULES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: 'Facebook', pattern: /facebook|ф[эе]йсб[үу]+к|(?:^|[^a-zа-яөү])fb(?![a-zа-яөү])|пэйж/i },
    { name: 'Инстаграм', pattern: /instagram|инстаграм|(?:^|[^a-zа-яөү])insta(?![a-zа-яөү])/i },
    { name: 'Монкон', pattern: /монкон|moncon/i },
    { name: 'Мандала Гарден ОС', pattern: /мандала|mandala|оршин суугч/i },
    { name: 'Бармаш түрээслэгч', pattern: /бармаш|barmash/i },
    { name: 'Ойрхон амьдардаг', pattern: /ойрхон|ойролцоо|(?:^|[^а-яөү])ойр(?![а-яөү])|хажуугаар|энэ хави/i },
    { name: 'Танил', pattern: /танил|найз|хамаатан/i },
];

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Тэмдэглэлээс сэжмийн нэр: таарсан үгсээс тэмдэглэлд хамгийн эхэнд байгаа нь. `projectNames` — төслийн идэвхтэй
 * сэжмийн нэрс (нэр нь тэмдэглэлд бүтнээрээ байвал таарна). Хоосон тэмдэглэл → null; таараагүй → «Бусад».
 */
export function referralFromNote(note: string | null | undefined, projectNames: readonly string[] = []): string | null {
    const text = typeof note === 'string' ? normalize(note) : '';
    if (!text) return null;
    let best: { name: string; index: number } | null = null;
    const consider = (name: string, index: number) => { if (index >= 0 && (!best || index < best.index)) best = { name, index }; };
    for (const name of projectNames) {
        const key = normalize(name);
        if (key && key !== normalize(REFERRAL_OTHER)) consider(name, text.indexOf(key));
    }
    for (const rule of KEYWORD_RULES) consider(rule.name, text.search(rule.pattern));
    return (best as { name: string; index: number } | null)?.name ?? REFERRAL_OTHER;
}
