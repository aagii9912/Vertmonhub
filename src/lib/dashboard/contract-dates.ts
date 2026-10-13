/**
 * Огноогүй гэрээ (жишээ нь Elysium-ийн ERP байрны экспортоос үүссэн, гэрээ байгуулсан огноогүй гэрээ) байвал
 * долоо хоног, сарын гэрээний тоо, дүн бүрэн биш. Хугацаанд нэг ч гэрээ олдоогүй бол «—» (тодорхойгүй),
 * олдсон бол «N+» гэж харуулна — хэзээ ч 0 гэж бичихгүй. Хурлын хуудас, слайд, текст, AI бүгд ашиглана.
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
    return `Огноогүй ${undated.toLocaleString('en-US')} гэрээ · ERP гэрээний экспорт хэрэгтэй`;
}

/** Бүтэн тайлбар (хоосон хүснэгт, текст тайлан, AI). */
export function undatedContractsHint(undated: number): string {
    return `${undated.toLocaleString('en-US')} гэрээ байгуулсан огноогүй тул долоо хоног, сарын гэрээний тоо бүрэн биш. ERP-ийн гэрээний экспортыг оруулбал гэрээ, орсон мөнгө тооцогдоно.`;
}
