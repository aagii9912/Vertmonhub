/**
 * Хайлтын үгийг PostgREST `.or()` / `ilike` шүүлтүүрт аюулгүй болгоно: таслал, хаалт `.or()`-ийн
 * бүтцийг эвддэг, `%` `_` `*` нь LIKE-ийн тусгай тэмдэгт, `\` нь escape. Тэдгээрийг зайгаар сольж,
 * давхар зайг нэгтгэнэ. Хоосон үр дүн = шүүлтүүргүй.
 */
export function orSearchTerm(term: string): string {
    return term.replace(/[%_,()\\*]/g, ' ').replace(/\s+/g, ' ').trim();
}
