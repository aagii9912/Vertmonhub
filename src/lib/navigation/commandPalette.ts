/**
 * ⌘K командын самбарыг хаанаас ч нээх жижиг гүүр.
 *
 * Sidebar-ийн хайлтын товч, гар утасны толгой, хоосон төлөвийн CTA бүгд
 * үүнийг дуудна. CommandPalette өөрөө сонсогч болно — context нэмэхгүйгээр,
 * server component-ийн хилээр дамжуулахгүйгээр ажиллана.
 */

const OPEN_EVENT = 'vertmon:command-palette:open';
const NEW_EVENT = 'vertmon:quick-create:open';

/** ⌘K самбарыг нээх. */
export function openCommandPalette(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function onCommandPaletteOpen(handler: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const fn = () => handler();
    window.addEventListener(OPEN_EVENT, fn);
    return () => window.removeEventListener(OPEN_EVENT, fn);
}

/** Түргэн үүсгэх цонхыг нээх («Шинэ» товч / N товчлуур / гар утасны «+»). */
export type QuickCreateKind = 'lead' | 'meeting' | 'contract' | 'task';

/**
 * Түргэн бүртгэлийн төрлийг санал болгох эрх — «+ Шинэ», ⌘K, Түргэн бүртгэлийн солигч нэг дүрмээр
 * (`useModuleAccess`-ийн `can`/`canWrite`). Зөвхөн UI-г нууна; сервер хүсэлт бүрийг дахин шалгана.
 */
export function canQuickCreate(kind: QuickCreateKind, access: { can: (module: string) => boolean; canWrite: (module: string) => boolean }): boolean {
    if (kind === 'lead') return access.canWrite('leads');
    if (kind === 'meeting') return access.canWrite('viewings');
    if (kind === 'task') return access.can('dashboard');
    return false;
}

export function openQuickCreate(kind: QuickCreateKind = 'lead'): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<QuickCreateKind>(NEW_EVENT, { detail: kind }));
}

export function onQuickCreate(handler: (kind: QuickCreateKind) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const fn = (e: Event) => handler((e as CustomEvent<QuickCreateKind>).detail ?? 'lead');
    window.addEventListener(NEW_EVENT, fn);
    return () => window.removeEventListener(NEW_EVENT, fn);
}
