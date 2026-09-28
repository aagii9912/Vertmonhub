'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, CalendarDays, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { openAiPanel } from '@/lib/ai/context';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { nextMeetingDate } from '@/lib/dashboard/weekly-review';
import { formatWorkdayDate, ubDateStr } from '@/lib/utils/date';

export function WorkspaceIntro() {
    const { user } = useAuth();
    const [prompt, setPrompt] = useState('');
    const [now] = useState(() => new Date());
    const meeting = nextMeetingDate(now);
    const days = Math.round((Date.parse(meeting) - Date.parse(ubDateStr(now))) / 86_400_000);
    const canAI = user?.role === 'super_admin' || user?.permissions.modules.includes('ai-assistant');
    const name = user?.fullName?.trim();
    const ask = (text: string) => { if (text.trim()) { openAiPanel(text.trim()); setPrompt(''); } };

    return <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-w-0 py-1">
            <p className="text-xs text-muted-foreground">{formatWorkdayDate(now)}</p>
            <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{name ? `Сайн байна уу, ${name}.` : 'Өнөөдрийн ажлаа цэгцэлье.'}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Өнөөдрийн ажилдаа төвлөр. Тайлангийн бэлтгэлээ эндээс эхэл.</p>
            {canAI && <>
                <form onSubmit={event => { event.preventDefault(); ask(prompt); }} className="ai-composer mt-5 grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2 rounded-[24px] border border-border-strong bg-surface p-3 shadow-xs transition-shadow focus-within:border-muted sm:mt-6 sm:block sm:p-4">
                    <label htmlFor="workspace-prompt" className="sr-only">AI туслахад өгөх даалгавар</label>
                    <textarea id="workspace-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(prompt); } }} rows={2} maxLength={8000} placeholder="Юунаас эхлэх вэ? Асуух эсвэл ажил даалгаарай…" className="block w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground" />
                    <div className="flex items-center justify-between gap-3 sm:mt-2"><span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Sparkles className="size-4" />Vertmon AI</span><button type="submit" disabled={!prompt.trim()} aria-label="AI туслахад нээх" className="flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 disabled:opacity-30 focus-ring"><ArrowUp className="size-5" /></button></div>
                </form>
                <div className="mt-3 hidden flex-wrap gap-2 sm:flex">{[
                    ['Өдрийн ажлаа эрэмбэлэх', 'Миний өнөөдрийн ажлыг шалгаад хамгийн чухал 3 ажлыг эрэмбэлж өг.'],
                    ['Дуудлага бүртгэх', 'Лидтэй ярьсан дуудлага, үр дүн, дараагийн холбогдох хугацааг бүртгэхэд туслаач.'],
                ].map(([label, text]) => <button key={label} type="button" onClick={() => ask(text)} className="min-h-10 rounded-full border border-border px-3.5 text-xs text-fg-2 transition-colors hover:bg-surface-2 focus-ring">{label}</button>)}</div>
            </>}
        </div>
        <aside className="flex flex-col rounded-2xl bg-surface-2 p-4 lg:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-2"><CalendarDays className="size-4" /><span className="lg:hidden">Лхагва · {meeting.slice(5).replace('-', '.')}</span><span className="hidden lg:inline">Дараагийн хурал</span></span><span>{days === 0 ? 'Өнөөдөр' : `${days} хоногийн дараа`}</span></div>
            <h2 className="mb-3 mt-3 hidden text-lg font-semibold tracking-tight lg:mb-0 lg:mt-4 lg:block lg:text-xl">Лхагва гараг <span className="ml-1 text-muted-foreground">{Number(meeting.slice(5, 7))}.{meeting.slice(8)}</span></h2>
            <p className="mt-1 hidden text-xs text-muted-foreground lg:block">Борлуулалт + маркетинг</p>
            <ol className="my-5 hidden space-y-3 text-sm text-fg-2 lg:block">{['Тоон үзүүлэлтээ шалгах', 'Хийсэн ажил, саадаа нэмэх', 'Хурлын тайлангаа бэлдэх'].map((step, index) => <li key={step} className="flex items-center gap-2.5"><span className="flex size-5 items-center justify-center rounded-full border border-border-strong text-[10px]">{index + 1}</span>{step}</li>)}</ol>
            <Link href="/dashboard/weekly" className="mt-3 flex min-h-11 items-center justify-between rounded-xl bg-surface px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 focus-ring lg:mt-auto">Хурлын бэлтгэл нээх<ArrowRight className="size-4" /></Link>
        </aside>
        <div className="col-span-full flex items-center gap-3 border-b border-border sm:gap-5">
            <span className="whitespace-nowrap border-b-2 border-foreground py-3 text-xs font-medium sm:text-sm">Өнөөдрийн тойм</span>
            <Link href="/dashboard/tasks" className="whitespace-nowrap py-3 text-xs text-muted-foreground hover:text-foreground focus-ring sm:text-sm">Миний ажлууд</Link>
            <button type="button" onClick={() => openQuickCreate('task')} className="ml-auto flex min-h-11 items-center gap-1.5 whitespace-nowrap text-xs text-fg-2 hover:text-foreground focus-ring sm:text-sm"><Plus className="size-4" />Ажил нэмэх</button>
        </div>
    </section>;
}
