import { timingSafeEqual } from 'crypto';

/**
 * Тогтмол хугацааны (timing-safe) тэмдэгт мөрийн харьцуулалт — нууц/гарын үсэг шалгахад.
 * Урт зөрвөл шууд false (уртыг задруулахаас өөр мэдээлэл алдагдахгүй).
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}
