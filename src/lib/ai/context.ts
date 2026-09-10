'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { AssistantUiContext } from '@/lib/ai/orchestrator/http';

/**
 * AI туслахын «харж буй бичлэг» контекст + панелийн нээх/хаах дохио.
 *
 * Хуудас/панел (лидийн панел, гэрээний хуудас, Өнөөдөр, Самбар) өөрийгөө
 * бүртгэнэ → AI панел тухайн бичлэгт зориулсан нэг товчны саналууд харуулж,
 * серверт lead_id/contract_id-г дамжуулна. Context provider биш — window
 * дээрх жижиг store, ингэснээр аль ч client component-оос дуудаж болно.
 */

export type AiContext = AssistantUiContext;

let current: AiContext | null = null;
const listeners = new Set<() => void>();
const PANEL_EVENT = 'vertmon:ai-panel';

function emit() {
    for (const l of listeners) l();
}

export function setAiContext(ctx: AiContext | null): void {
    if (JSON.stringify(ctx) === JSON.stringify(current)) return;
    current = ctx;
    emit();
}

export function getAiContext(): AiContext | null {
    return current;
}

export function useAiContext(): AiContext | null {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
        () => current,
        () => null,
    );
}

/** Компонент mount байх зуур контекст болно; unmount-д (эсвэл id солигдоход) цэвэрлэнэ. */
export function useRegisterAiContext(ctx: AiContext | null): void {
    const key = ctx ? `${ctx.type}:${ctx.id ?? ''}:${ctx.label ?? ''}` : '';
    useEffect(() => {
        if (!ctx) return;
        setAiContext(ctx);
        return () => { if (getAiContext() && `${getAiContext()!.type}:${getAiContext()!.id ?? ''}:${getAiContext()!.label ?? ''}` === key) setAiContext(null); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
}

/* ------------------------------------------------------------------ */
/* Панел нээх / хаах                                                    */
/* ------------------------------------------------------------------ */

export interface AiPanelCommand {
    action: 'open' | 'close' | 'toggle';
    /** Нээгээд шууд илгээх асуулт (заавал биш) */
    prompt?: string;
}

export function openAiPanel(prompt?: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<AiPanelCommand>(PANEL_EVENT, { detail: { action: 'open', prompt } }));
}
export function toggleAiPanel(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<AiPanelCommand>(PANEL_EVENT, { detail: { action: 'toggle' } }));
}
export function closeAiPanel(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<AiPanelCommand>(PANEL_EVENT, { detail: { action: 'close' } }));
}
export function onAiPanel(handler: (cmd: AiPanelCommand) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const fn = (e: Event) => handler((e as CustomEvent<AiPanelCommand>).detail);
    window.addEventListener(PANEL_EVENT, fn);
    return () => window.removeEventListener(PANEL_EVENT, fn);
}

/* ------------------------------------------------------------------ */
/* Контекстээс хамаарсан нэг товчны саналууд                            */
/* ------------------------------------------------------------------ */

export interface AiSuggestion {
    label: string;
    prompt: string;
}

export function suggestionsFor(ctx: AiContext | null): AiSuggestion[] {
    switch (ctx?.type) {
        case 'lead': {
            const n = ctx.label ? `«${ctx.label}»` : 'энэ лид';
            return [
                { label: 'Дүгнэлт', prompt: `${n} лидийн бүх мэдээлэл, түүхийг уншаад 3–5 мөрөөр дүгнэ: хэн, юу сонирхож байна, хаана хүрсэн, эрсдэл.` },
                { label: 'Дараагийн алхам', prompt: `${n} лидийн одоогийн байдлаас хамааран хамгийн зөв дараагийн 1 алхмыг санал болго (залгах/уулзалт/санал/хүлээх) — яагаад гэдгийг нэг өгүүлбэрээр.` },
                { label: 'Мессеж бичих', prompt: `${n} лидэд Facebook/утсаар илгээх богино, найрсаг, монгол мессеж бич — түүний сонирхсон байр, сүүлийн яриа дээр үндэслэ. 2 хувилбар.` },
                { label: 'Тэмдэглэл нэмэх', prompt: `${n} лидэд дараах тэмдэглэлийг нэм: ` },
            ];
        }
        case 'contract': {
            const n = ctx.label ? `«${ctx.label}»` : 'энэ гэрээ';
            return [
                { label: 'Төлбөрийн байдал', prompt: `${n} гэрээний төлбөрийн байдлыг дүгнэ: төлсөн, үлдэгдэл, хоцролт, дараагийн төлөлт.` },
                { label: 'Хоцролтын мэдэгдэл', prompt: `${n} гэрээний харилцагчид төлбөрийн хоцролт/дараагийн төлөлтийг сануулах эелдэг, албан ёсны монгол мессеж бич.` },
                { label: 'Эрсдэл', prompt: `${n} гэрээнд төлбөрийн эрсдэл бий юу? Түүхийг нь харгалзан үнэл.` },
            ];
        }
        case 'today':
            return [
                { label: 'Өнөөдрийн тойм', prompt: 'Миний өнөөдрийн уулзалт, залгах лид, сануулгыг эрэмбэлж, хамгийн чухал 3-ыг нь онцолж товч тойм бич.' },
                { label: 'Хэнд эхлээд залгах вэ?', prompt: 'Миний идэвхтэй лидүүдээс өнөөдөр хамгийн түрүүнд хэнд залгах ёстойг 3 хүртэл нэрлэж, шалтгааныг нэг өгүүлбэрээр хэл.' },
                { label: 'Хоцорсон ажил', prompt: 'Дараагийн холбоо барих хугацаа нь хэтэрсэн лидүүдийг жагсаа.' },
            ];
        case 'dashboard':
            return [
                { label: 'Энэ сарын дүр зураг', prompt: 'Энэ сарын борлуулалт, зорилтын биелэлт, менежерийн гүйцэтгэлийг тоогоор дүгнэж, 3 гол ажиглалт хэл.' },
                { label: 'Хамгийн үр дүнтэй эх үүсвэр', prompt: 'Лидийн эх үүсвэр бүрийн хөрвөлтийг харьцуулж, төсвийг хаашаа шилжүүлэх саналаа хэл.' },
                { label: 'Авлагын эрсдэл', prompt: 'Хугацаа хэтэрсэн төлбөртэй гэрээнүүдийг дүнгээр нь эрэмбэлж, эхний 5-д юу хийхийг санал болго.' },
            ];
        default:
            return [
                { label: 'Энэ сарын борлуулалт', prompt: 'Энэ сарын борлуулалт, гэрээний тоо, зорилтын биелэлтийг товч хэл.' },
                { label: 'Шинэ лидүүд', prompt: 'Сүүлийн 7 хоногт ирсэн шинэ лидүүдийг эх үүсвэрээр нь тоолж, холбогдоогүй байгааг нь онцол.' },
                { label: 'Боломжтой байрууд', prompt: 'Одоо худалдаанд байгаа байруудыг өрөөний тоо, үнээр нь бүлэглэн харуул.' },
            ];
    }
}

export function contextLabel(ctx: AiContext | null): string {
    if (!ctx) return '';
    const t = { lead: 'Лид', contract: 'Гэрээ', viewing: 'Уулзалт', property: 'Байр', today: 'Өнөөдөр', dashboard: 'Самбар' }[ctx.type];
    return ctx.label ? `${t}: ${ctx.label}` : t;
}
