/**
 * Огноогүй гэрээ (жишээ нь Elysium-ийн ERP байрны экспортоос үүссэн, захиалга өгсөн огноогүй гэрээ) байвал
 * долоо хоног, сарын гэрээний тоо, дүн бүрэн биш. Хугацаанд нэг ч гэрээ олдоогүй бол «—» (тодорхойгүй),
 * олдсон бол «N+» гэж харуулна — хэзээ ч 0 гэж бичихгүй. Хурлын хуудас, слайд, текст, AI бүгд ашиглана.
 * Огноог гэрээний дэлгэрэнгүйн «Огноо оруулах» эсвэл HUB файлын «Excel импорт» л бөглөнө (ERP-ийн
 * борлуулалтын snapshot `contract_date`-ийг бөглөхгүй); огноо оруулах нь орсон мөнгийг мэдэгдэх болгохгүй.
 */
export function periodContractCount(count: number, undated: number): string {
    if (!undated) return count.toLocaleString('en-US');
    return count ? `${count.toLocaleString('en-US')}+` : '—';
}

export function periodContractAmount(amount: number, count: number, undated: number, format: (value: number) => string): string {
    if (!undated) return format(amount);
    return count ? `${format(amount)}+` : '—';
}

/** Хугацааны дүн мэдэгдэх эсэх: огноогүй гэрээтэй, хугацаанд нэг ч олдоогүй бол null. */
export function knownPeriodAmount(amount: number, count: number, undated: number): number | null {
    return undated && !count ? null : amount;
}

/** Картын доорх товч тайлбар. */
export function undatedContractsShort(undated: number): string {
    return `Огноогүй ${undated.toLocaleString('en-US')} гэрээ · «Захиалга өгсөн огноо» оруулах`;
}

/** Бүтэн тайлбар (хоосон хүснэгт, текст тайлан, AI). */
export function undatedContractsHint(undated: number): string {
    return `${undated.toLocaleString('en-US')} гэрээ захиалга өгсөн огноогүй тул долоо хоног, сарын гэрээний тоо бүрэн биш. Гэрээний дэлгэрэнгүйд «Огноо оруулах»-аар эсвэл «Гэрээ» → «Excel импорт»-оор HUB файл оруулбал тооцогдоно.`;
}
