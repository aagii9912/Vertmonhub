/**
 * «Сэжим (хаанаас ирсэн)» — уулзалт ба гэрээнд сонгох төслийн жагсаалт (эзэмшигчийн шийдвэр W12, 2026-10-22).
 * Client-safe, pure: нэр, санал болгосон жагсаалт, давхардлын түлхүүр, заавал эсэхийн дүрэм. DB-ийн уншилт,
 * бичилт `referral-sources-store.ts`-д.
 *
 * • Төсөл (= shop) бүр өөрийн жагсаалттай; ашиглагдсан сонголтыг устгахгүй, архивлана.
 * • Анхны жагсаалтыг migration seed хийхгүй — Тохиргооны «Санал болгосон жагсаалт нэмэх» товч байхгүйг нь нэмнэ.
 * • Шинэ харилцагчийн уулзалтад заавал (төсөлд идэвхтэй сонголт байгаа үед); засвар, бусад төрөлд заавал биш.
 * • «Сэжим» гэдэг үг өөр газар лид, prospect хүснэгтийг хэлдэг тул талбарыг үргэлж «Сэжим (хаанаас ирсэн)» гэнэ.
 *   Чөлөөт «Тэмдэглэл» (agent_notes) тусдаа хэвээр.
 */

export const REFERRAL_FIELD_LABEL = 'Сэжим (хаанаас ирсэн)';
export const REFERRAL_SOURCE_NAME_MAX = 80;
/** Төсөлд нэгэн зэрэг идэвхтэй байж болох сонголтын тоо (архивласан нь тоологдохгүй). */
export const REFERRAL_SOURCE_ACTIVE_LIMIT = 40;
/** Төслийн бүх сонголтын (архивласан орно) уншилтын дээд хязгаар. */
export const REFERRAL_SOURCE_READ_LIMIT = 200;

/** W12-ын анхны жагсаалт (дарааллаараа). Тайланд Facebook + Инстаграм-ыг «Сошиал медиа» гэж нийлүүлж болно. */
export const DEFAULT_REFERRAL_SOURCES = [
    'Facebook', 'Инстаграм', 'Ойрхон амьдардаг', 'Монкон', 'Мандала Гарден ОС', 'Бармаш түрээслэгч', 'Ажилтан', 'Танил', 'Бусад',
] as const;

export interface ReferralSource {
    id: string;
    name: string;
    sort_order: number;
    /** null = идэвхтэй. */
    archived_at: string | null;
}

export const REFERRAL_REQUIRED_ERROR = `Шинэ харилцагчийн уулзалтад «${REFERRAL_FIELD_LABEL}»-ийг сонгоно уу`;

/** Нэр: trim + давхар зайг нэг болгоно; хоосон бол null. */
export function normalizeReferralName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().replace(/\s+/g, ' ');
    return value || null;
}

/** Давхардлын түлхүүр (DB `referral_source_name_key`-тэй ижил): том/жижиг үсэг, давхар зай ялгахгүй. */
export function referralNameKey(raw: unknown): string {
    return (normalizeReferralName(raw) ?? '').toLowerCase();
}

export const isActiveReferral = (source: Pick<ReferralSource, 'archived_at'>) => !source.archived_at;

/** Сонгогчийн нэр: архивласан бол «(архив)» нэмнэ. */
export function referralOptionLabel(source: Pick<ReferralSource, 'name' | 'archived_at'>): string {
    return source.archived_at ? `${source.name} (архив)` : source.name;
}

/** id → нэр (архивласан орно) — жагсаалт, илтгэл, AI-ийн хариунд. */
export function referralNameMap(sources: readonly Pick<ReferralSource, 'id' | 'name'>[]): Map<string, string> {
    return new Map(sources.map((source) => [source.id, source.name]));
}

/** Санал болгосон жагсаалтаас төсөлд байхгүй нэрс (архивласан ижил нэр байвал нэмэхгүй — админ санаатай хассан). */
export function missingDefaultReferralSources(sources: readonly Pick<ReferralSource, 'name'>[]): string[] {
    const keys = new Set(sources.map((source) => referralNameKey(source.name)));
    return DEFAULT_REFERRAL_SOURCES.filter((name) => !keys.has(referralNameKey(name)));
}

/**
 * Шинэ уулзалтад «Сэжим» заавал эсэх: шинэ харилцагчийн уулзалт ба төсөлд идэвхтэй сонголт байгаа үед.
 * Жагсаалтгүй төсөл (эсвэл migration ороогүй) уулзалт бүртгэхийг хаахгүй.
 */
export function referralRequired(meetingType: string | null | undefined, activeCount: number): boolean {
    return (meetingType ?? 'new_customer') === 'new_customer' && activeCount > 0;
}

/** Идэвхтэй сонголтын нэрсийн жагсаалт (алдааны мессеж, AI-д). */
export function availableReferralText(sources: readonly ReferralSource[]): string {
    const names = sources.filter(isActiveReferral).map((source) => source.name);
    return names.length
        ? `Боломжтой: ${names.join(', ')}.`
        : `Энэ төсөлд «${REFERRAL_FIELD_LABEL}»-ийн идэвхтэй сонголт алга (Тохиргоо → ${REFERRAL_FIELD_LABEL}).`;
}
