'use client';

import { motion } from 'motion/react';
import { Building2, MessageSquare, TrendingUp, Users, CheckCircle2 } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

const KPIS = [
    { label: 'Идэвхтэй лийд', value: '128', icon: Users, trend: '+12%' },
    { label: 'Энэ сарын гэрээ', value: '34', icon: CheckCircle2, trend: '+8%' },
    { label: 'Орлого (сая₮)', value: '4,210', icon: TrendingUp, trend: '+19%' },
];

// Bar chart-ийн өндрүүд (харьцангуй %)
const BARS = [42, 58, 49, 71, 63, 88, 76];

/**
 * Hero-д харагдах "бүтээгдэхүүний" дүрслэл — гадаад зураг биш, бүхэлдээ
 * CSS/SVG + design token-оор бүтээсэн борлуулалтын самбарын макет.
 */
export function DashboardMock() {
    const reduced = useReducedMotion();

    return (
        <div className="relative" aria-hidden="true">
            {/* Гэрэлтүүлэг — brand glow */}
            <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-brand-soft/60 blur-3xl" />

            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
                {/* Цонхны толгой */}
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                    <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                    <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
                    <div className="ml-3 flex items-center gap-2 rounded-full bg-surface px-3 py-1">
                        <Building2 className="h-3 w-3 text-brand" />
                        <span className="font-mono text-2xs text-muted-foreground">vertmonhub.mn/dashboard</span>
                    </div>
                </div>

                <div className="grid gap-px bg-border sm:grid-cols-[1fr_1.4fr]">
                    {/* Зүүн талын самбар */}
                    <div className="space-y-3 bg-surface p-4">
                        <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted-foreground">
                            Борлуулалтын самбар
                        </p>
                        {KPIS.map((kpi, i) => {
                            const Icon = kpi.icon;
                            return (
                                <motion.div
                                    key={kpi.label}
                                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
                                    initial={reduced ? false : { opacity: 0, y: 8 }}
                                    animate={reduced ? undefined : { opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-strong">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-2xs text-muted-foreground">{kpi.label}</p>
                                        <p className="heading-display text-lg leading-tight text-foreground tabular-nums">
                                            {kpi.value}
                                        </p>
                                    </div>
                                    <span className="ml-auto rounded-full bg-status-success-soft px-1.5 py-0.5 text-2xs font-medium text-status-success tabular-nums">
                                        {kpi.trend}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Баруун талын график + pipeline */}
                    <div className="space-y-4 bg-surface p-4">
                        <div className="flex items-center justify-between">
                            <p className="heading-section text-sm text-foreground">7 хоногийн борлуулалт</p>
                            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong">
                                Бодит цаг
                            </span>
                        </div>

                        {/* Bar chart */}
                        <div className="flex h-28 items-end gap-2">
                            {BARS.map((h, i) => (
                                <motion.div
                                    key={i}
                                    className={cn(
                                        'flex-1 rounded-t-md',
                                        i === BARS.length - 2 ? 'bg-brand' : 'bg-brand/30',
                                    )}
                                    style={{ height: `${h}%` }}
                                    initial={reduced ? false : { scaleY: 0 }}
                                    animate={reduced ? undefined : { scaleY: 1 }}
                                    transition={{ delay: 0.5 + i * 0.07, duration: 0.5, ease: 'easeOut' }}
                                    // scale-ийг доороос дээш
                                    transformTemplate={(_, generated) => `${generated}`}
                                />
                            ))}
                        </div>

                        {/* Pipeline жижиг мөрүүд */}
                        <div className="space-y-2 border-t border-border pt-3">
                            {[
                                { name: 'Б. Ариунаа · 2 өрөө', stage: 'Уулзалт', tone: 'pending' as const },
                                { name: 'Г. Тэмүүлэн · 3 өрөө', stage: 'Гэрээ', tone: 'success' as const },
                            ].map((row) => (
                                <div key={row.name} className="flex items-center gap-2">
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-2xs text-foreground">{row.name}</span>
                                    <span
                                        className={cn(
                                            'ml-auto rounded-full px-2 py-0.5 text-2xs font-medium',
                                            row.tone === 'pending'
                                                ? 'bg-status-pending-soft text-status-pending'
                                                : 'bg-status-success-soft text-status-success',
                                        )}
                                    >
                                        {row.stage}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Хөвж буй "AI хариулав" карт */}
            <motion.div
                className="absolute -bottom-5 -left-4 hidden items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg sm:flex"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6 }}
            >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-fg">
                    <MessageSquare className="h-3.5 w-3.5" />
                </span>
                <div>
                    <p className="text-2xs font-medium text-foreground">AI шинэ лийд бүртгэв</p>
                    <p className="font-mono text-2xs text-muted-foreground">Messenger · одоо</p>
                </div>
            </motion.div>
        </div>
    );
}
