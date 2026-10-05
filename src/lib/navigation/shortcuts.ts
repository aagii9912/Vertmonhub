/**
 * Гарын товчлолууд — ганц жагсаалт (товчлолын цонх) ба «G → үсэг» шилжилт.
 *
 * Монгол кирилл байрлалтай гар дээр ч ажиллахын тулд `KeyboardEvent.code`-оор (физик
 * товч) таньдаг: «G → L» нь кирилл байрлалд «Г → Д» дарсантай ижил.
 */

const OPEN_EVENT = 'vertmon:shortcuts:open';

/** Товчлолын жагсаалтын цонхыг нээх. */
export function openShortcuts(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function onShortcutsOpen(handler: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const fn = () => handler();
    window.addEventListener(OPEN_EVENT, fn);
    return () => window.removeEventListener(OPEN_EVENT, fn);
}

export interface GoShortcut {
    /** KeyboardEvent.code — физик товч. */
    code: string;
    /** Цонхонд харуулах үсэг. */
    key: string;
    href: string;
    name: string;
    /** RBAC модуль ('' = хүн бүр). */
    module: string;
}

/** «G» дараад дарах товч → хуудас. */
export const GO_SHORTCUTS: GoShortcut[] = [
    { code: 'KeyD', key: 'D', href: '/dashboard', name: 'Өнөөдөр', module: 'dashboard' },
    { code: 'KeyL', key: 'L', href: '/dashboard/leads', name: 'Лид', module: 'leads' },
    { code: 'KeyV', key: 'V', href: '/dashboard/viewings', name: 'Уулзалт', module: 'viewings' },
    { code: 'KeyC', key: 'C', href: '/dashboard/contracts', name: 'Гэрээ', module: 'contracts' },
    { code: 'KeyM', key: 'M', href: '/dashboard/inbox', name: 'Мессеж', module: 'inbox' },
    { code: 'KeyR', key: 'R', href: '/dashboard/reports', name: 'Тайлан', module: 'reports' },
    { code: 'KeyS', key: 'S', href: '/dashboard/settings', name: 'Тохиргоо', module: 'settings' },
];

export interface ShortcutRow {
    keys: string[];
    label: string;
}

/** Товчлолын цонхны ерөнхий жагсаалт («G →» мөрүүдийг тусад нь эрхээр шүүж харуулна). */
export const GENERAL_SHORTCUTS: ShortcutRow[] = [
    { keys: ['⌘', 'K'], label: 'Хайх — хуудас, лид, гэрээ' },
    { keys: ['⌘', 'J'], label: 'AI туслах' },
    { keys: ['N'], label: 'Шинэ лид' },
    { keys: ['?'], label: 'Товчлолын жагсаалт' },
    { keys: ['Esc'], label: 'Цонх хаах' },
];

/** Бичиж буй талбарт товчлол ажиллахгүй. */
export function isTypingTarget(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node || typeof node.tagName !== 'string') return false;
    return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable;
}
