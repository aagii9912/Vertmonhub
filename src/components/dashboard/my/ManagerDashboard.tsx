'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { AskAIHero } from '@/components/dashboard/AskAIHero';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { useMyStats, type MyStatsPeriod } from '@/hooks/useMyStats';
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { mergeWidgetPrefs, MANAGER_WIDGETS } from '@/lib/dashboard/widget-prefs';
import { cn } from '@/lib/utils';
import { MyKpiCards } from './MyKpiCards';
import { MyTasksWidget } from './MyTasksWidget';
import { MyTargetWidget } from './MyTargetWidget';
import { MyLeadsWidget } from './MyLeadsWidget';
import { MyViewingsWidget } from './MyViewingsWidget';
import { MyRevenueTrendWidget } from './MyRevenueTrendWidget';
import { WidgetCustomizer } from './WidgetCustomizer';
import { RefreshCw, Calendar, UserRound, Info } from 'lucide-react';

const TIME_FILTER_OPTIONS = [
    { value: 'today', label: 'Өнөөдөр' },
    { value: 'week', label: '7 хоног' },
    { value: 'month', label: 'Сар' },
] as const;

/**
 * Виджет бүрийн grid эзлэхүүн — container query (@4xl = 56rem контейнер).
 * Viewport биш КОНТЕЙНЕРИЙН өргөнөөс хамаардаг тул Sheet (админы drill-in)
 * дотор автоматаар нэг баганад эвхэгдэнэ.
 */
const WIDGET_SPAN: Record<string, string> = {
    kpis: '@4xl:col-span-3',
    tasks: '@4xl:col-span-2',
    target: '@4xl:col-span-1',
    leads: '@4xl:col-span-2',
    viewings: '@4xl:col-span-1',
    revenueTrend: '@4xl:col-span-3',
};

interface ManagerDashboardProps {
    /** Өгвөл — админы drill-in: тухайн менежерийн самбарыг харна (тохируулга идэвхгүй). */
    managerName?: string;
    /** Sheet/Dialog дотор суулгасан горим (AskAIHero, PullToRefresh-гүй). */
    embedded?: boolean;
}

/**
 * «Миний самбар» — борлуулалтын менежерийн хувийн дашбоард.
 * Өгөгдөл: /api/dashboard/my-stats (нэг дуудалт). Виджетүүд хэрэглэгчийн
 * тохиргоогоор (useDashboardPrefs) эрэмбэлэгдэж/нуугдана — зөвхөн өөрийн
 * самбарт; админы drill-in default дараалалтай.
 */
export function ManagerDashboard({ managerName, embedded = false }: ManagerDashboardProps) {
    const isSelf = !managerName;
    const reduced = useReducedMotion();
    const [period, setPeriod] = useState<MyStatsPeriod>('today');

    const { data, isLoading, isError, refetch, isRefetching } = useMyStats(period, managerName);
    const { prefs, save } = useDashboardPrefs(isSelf);

    if (isLoading) {
        return <KpiGridSkeleton />;
    }

    if (isError || !data) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="w-12 h-12 rounded-full bg-status-danger-soft flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-status-danger" />
                </div>
                <div>
                    <p className="font-medium text-foreground">Мэдээлэл ачаалахад алдаа гарлаа</p>
                    <p className="text-sm text-muted-foreground mt-1">Сүлжээгээ шалгаад дахин оролдоно уу</p>
                </div>
                <Button onClick={() => refetch()} variant="secondary" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" /> Дахин оролдох
                </Button>
            </div>
        );
    }

    const activePrefs = isSelf ? prefs : mergeWidgetPrefs([], MANAGER_WIDGETS);
    const year = data.target?.year ?? new Date().getFullYear();

    const widgetRender: Record<string, React.ReactNode> = {
        kpis: <MyKpiCards kpis={data.kpis} period={period} />,
        tasks: <MyTasksWidget tasks={data.tasks} />,
        target: <MyTargetWidget target={data.target} />,
        leads: <MyLeadsWidget leads={data.recentLeads} leadsByStatus={data.kpis.leadsByStatus} />,
        viewings: <MyViewingsWidget viewings={data.upcomingViewings} />,
        revenueTrend: <MyRevenueTrendWidget trend={data.revenueTrend} year={year} />,
    };

    const content = (
        <div className={cn('@container w-full space-y-6', !embedded && 'mx-auto max-w-[1440px] md:space-y-8')}>
            {/* AI Orchestrator — зөвхөн өөрийн бүтэн самбарт */}
            {isSelf && !embedded && <AskAIHero />}

            {/* Гарчиг + хэрэгслүүд (embedded үед Sheet-ийн толгой нэрийг үзүүлдэг тул давхардуулахгүй) */}
            <div className={cn('flex flex-wrap items-center gap-2', embedded ? 'justify-end' : 'justify-between')}>
                {!embedded && (
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-brand-soft flex items-center justify-center flex-shrink-0">
                            <UserRound className="w-5 h-5 text-brand-strong" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="heading-section text-lg md:text-xl text-foreground truncate">
                                {isSelf ? 'Миний самбар' : data.manager.name}
                            </h1>
                            <p className="text-xs text-muted-foreground truncate">
                                {isSelf
                                    ? data.manager.name || 'Борлуулалтын менежер'
                                    : 'Менежерийн хувийн самбар'}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Select value={period} onValueChange={(v) => setPeriod(v as MyStatsPeriod)}>
                        <SelectTrigger className="h-9 w-36" aria-label="Хугацааны шүүлтүүр">
                            <span className="flex items-center gap-2">
                                <Calendar className="size-4 text-muted-foreground/70" />
                                <SelectValue />
                            </span>
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_FILTER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        variant="secondary"
                        size="sm"
                        className="h-9 w-9 p-0"
                        title="Шинэчлэх"
                    >
                        <RefreshCw className={cn('w-4 h-4', isRefetching && 'animate-spin')} />
                    </Button>

                    {isSelf && <WidgetCustomizer prefs={prefs} onChange={save} />}
                </div>
            </div>

            {/* Бүртгэлд таараагүй менежерийн онбординг зөвлөмж */}
            {data.onboarding && (
                <Card className="border-status-info/40 bg-status-info-soft/30">
                    <CardContent className="flex items-start gap-3 py-4">
                        <Info className="w-5 h-5 text-status-info flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Таны нэр менежерийн бүртгэлд алга
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Хувийн үзүүлэлтүүд харагдахын тулд админ таныг борлуулалтын менежерийн
                                бүртгэлд (нэр + акаунт холбоос) нэмэх шаардлагатай.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Виджетүүд — хэрэглэгчийн дараалал/харагдацаар (контейнерийн өргөнд тохирно) */}
            <div className="grid grid-cols-1 @4xl:grid-cols-3 gap-4 @4xl:gap-6 items-start">
                {activePrefs
                    .filter((p) => !p.hidden && widgetRender[p.id])
                    .map((p, i) => (
                        <motion.div
                            key={p.id}
                            className={cn('min-w-0', WIDGET_SPAN[p.id] || '@4xl:col-span-3')}
                            initial={reduced ? false : { opacity: 0, y: 8 }}
                            animate={reduced ? undefined : { opacity: 1, y: 0 }}
                            transition={reduced ? undefined : { duration: 0.26, delay: i * 0.04, ease: 'easeOut' }}
                        >
                            {widgetRender[p.id]}
                        </motion.div>
                    ))}
            </div>
        </div>
    );

    if (embedded) return content;

    return <PullToRefresh onRefresh={async () => { await refetch(); }}>{content}</PullToRefresh>;
}
