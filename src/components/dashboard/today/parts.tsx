'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, CalendarDays, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { openAiPanel } from '@/lib/ai/context';
import { nextMeetingDate } from '@/lib/dashboard/weekly-review';
import { formatWorkdayDate, ubDateStr } from '@/lib/utils/date';
import { Button } from '@/components/ui/Button';

/**
 * «Өнөөдөр»-ийн гурван нүүрт (менежер, захирал, маркетинг) нийтлэг хэсгүүд:
 * мэндчилгээтэй толгой, AI даалгаврын карт, Лхагвын хурлын карт, KPI хавтан, «Анхаарах» мөр.
 */

export function TodayHeader({ sub, actions }: { sub?: ReactNode; actions?: ReactNode }) {
    const { user } = useAuth();
    const [now] = useState(() => new Date());
    const name = user?.fullName?.trim();
    return (
        <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{formatWorkdayDate(now)}</p>
                <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-foreground">
                    {name ? `Сайн байна уу, ${name}.` : 'Өнөөдрийн ажлаа цэгцэлье.'}
                </h1>
                {sub && <p className="mt-1.5 text-[13px] text-muted-foreground">{sub}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}

/** AI туслахад даалгавар өгөх карт — эрхгүй хэрэглэгчид харагдахгүй. */
export function AiPromptCard({ suggestions }: { suggestions: [label: string, prompt: string][] }) {
    const { user } = useAuth();
    const [prompt, setPrompt] = useState('');
    const canAI = user?.role === 'super_admin' || !!user?.permissions?.modules?.includes('ai-assistant');
    if (!canAI) return null;
    const ask = (text: string) => { if (text.trim()) { openAiPanel(text.trim()); setPrompt(''); } };
    return (
        <section aria-label="AI туслах" className="rounded-2xl border border-border bg-surface p-4">
            <form onSubmit={(event) => { event.preventDefault(); ask(prompt); }} className="ai-composer rounded-xl border border-border-strong bg-surface-2/50 p-3 transition-colors focus-within:border-muted">
                <label htmlFor="workspace-prompt" className="sr-only">AI туслахад өгөх даалгавар</label>
                <textarea
                    id="workspace-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(prompt); } }}
                    rows={2}
                    maxLength={8000}
                    placeholder="AI-аас асуух эсвэл ажил даалгах…"
                    className="block w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5" aria-hidden />Vertmon AI · ⌘J</span>
                    <button type="submit" disabled={!prompt.trim()} aria-label="AI туслахад нээх" className="flex size-8 items-center justify-center rounded-full bg-brand text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-30">
                        <ArrowUp className="size-4" />
                    </button>
                </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map(([label, text]) => (
                    <button key={label} type="button" onClick={() => ask(text)} className="h-8 rounded-full border border-border px-3 text-xs text-fg-2 transition-colors hover:border-border-strong hover:text-foreground">
                        {label}
                    </button>
                ))}
            </div>
        </section>
    );
}

/** Дараагийн Лхагвын хурал хүртэлх хугацаа ба бэлтгэлийн алхам. */
export function WeeklyMeetingCard() {
    const [now] = useState(() => new Date());
    const meeting = nextMeetingDate(now);
    const days = Math.round((Date.parse(meeting) - Date.parse(ubDateStr(now))) / 86_400_000);
    return (
        <section aria-label="Дараагийн хурал" className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />Дараагийн хурал</span>
                <span>{days === 0 ? 'Өнөөдөр' : `${days} хоногийн дараа`}</span>
            </div>
            <h2 className="mt-2 text-base font-semibold text-foreground">
                Лхагва гараг <span className="num font-normal text-muted-foreground">{Number(meeting.slice(5, 7))}.{meeting.slice(8)}</span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Борлуулалт + маркетинг · тоо, хийсэн ажил, саадаа бэлдэнэ</p>
            <Link href="/dashboard/weekly" className="mt-3 flex h-9 items-center justify-between rounded-lg bg-surface-2 px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-3">
                Хурлын бэлтгэл нээх<ArrowRight className="size-4" aria-hidden />
            </Link>
        </section>
    );
}

/**
 * KPI хавтан (загварын «kpi»): нэр, тоо, хэмжүүр, харьцуулалт, эх сурвалж.
 * Мэдээлэлгүй бол тоо биш «—» ба шалтгаан (`unavailable`).
 */
export function KpiTile({ label, value, unit, meter, detail, source, unavailable, className }: {
    label: string;
    value: ReactNode;
    unit?: string;
    /** 0–100+; 100-аас дээш бол бүтэн, «gold» өнгөтэй (зорилт биелсэн). */
    meter?: number | null;
    detail?: ReactNode;
    source?: ReactNode;
    unavailable?: string | null;
    className?: string;
}) {
    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3.5', className)}>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {unavailable ? (
                <>
                    <span className="num text-[26px] font-semibold leading-tight tracking-tight text-muted-foreground">—</span>
                    <span className="text-xs font-medium text-status-pending">{unavailable}</span>
                </>
            ) : (
                <span className="num text-[26px] font-semibold leading-tight tracking-tight text-foreground">
                    {value}{unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
                </span>
            )}
            {!unavailable && meter != null && <Meter pct={meter} />}
            {detail && <span className="text-xs leading-relaxed text-muted-foreground">{detail}</span>}
            {source && <span className="mt-auto border-t border-dashed border-border pt-1.5 text-xs text-muted-foreground">{source}</span>}
        </div>
    );
}

/** Зорилтын биелэлтийн шугам: 100%-д хүрвэл бүтэн, «gold» (амжилт). */
export function Meter({ pct, className }: { pct: number; className?: string }) {
    return (
        <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-2', className)} role="presentation">
            <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-gold' : 'bg-brand')} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
    );
}

export type AttentionTone = 'danger' | 'pending' | 'neutral';

/** «Анхаарах» жагсаалтын мөр — юу, хэр их, нэг үйлдэл. */
export function AttentionRow({ icon: Icon, tone, title, detail, action }: {
    icon: LucideIcon;
    tone: AttentionTone;
    title: ReactNode;
    detail?: ReactNode;
    action: { label: string; href: string; primary?: boolean };
}) {
    const tones: Record<AttentionTone, string> = {
        danger: 'bg-status-danger-soft text-status-danger',
        pending: 'bg-status-pending-soft text-status-pending',
        neutral: 'bg-surface-2 text-fg-2',
    };
    return (
        <li className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}><Icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{title}</div>
                {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
            </div>
            <Button size="sm" variant={action.primary ? 'primary' : 'secondary'} href={action.href}>{action.label}</Button>
        </li>
    );
}
