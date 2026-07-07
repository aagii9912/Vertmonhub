'use client';

import { motion } from 'motion/react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatMNT } from '@/lib/utils/currency';
import type { MyStatsData, MyStatsPeriod } from '@/hooks/useMyStats';
import { Users, UserPlus, Eye, FileText, AlertTriangle, Banknote } from 'lucide-react';

const PERIOD_LABEL: Record<MyStatsPeriod, string> = {
    today: 'өнөөдөр',
    week: '7 хоног',
    month: 'сар',
};

/** Менежерийн гол KPI картууд. */
export function MyKpiCards({ kpis, period }: { kpis: MyStatsData['kpis']; period: MyStatsPeriod }) {
    const reduced = useReducedMotion();

    const cards = [
        { title: 'Идэвхтэй лид', value: String(kpis.activeLeads), icon: Users, iconColor: 'brand' as const },
        {
            title: `Шинэ лид (${PERIOD_LABEL[period]})`,
            value: String(kpis.newLeads),
            icon: UserPlus,
            iconColor: 'success' as const,
        },
        { title: 'Уулзалт (өнөөдөр)', value: String(kpis.viewingsToday), icon: Eye, iconColor: 'info' as const },
        { title: 'Идэвхтэй гэрээ', value: String(kpis.activeContracts), icon: FileText, iconColor: 'warning' as const },
        {
            title: 'Хугацаа хэтэрсэн',
            value: String(kpis.overdueContracts),
            icon: AlertTriangle,
            iconColor: (kpis.overdueContracts > 0 ? 'danger' : 'neutral') as 'danger' | 'neutral',
        },
        {
            title: 'Энэ сарын борлуулалт',
            value: formatMNT(kpis.salesThisMonth, { compact: true }),
            icon: Banknote,
            iconColor: 'brand' as const,
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            {cards.map((card, i) => (
                <motion.div
                    key={card.title}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={reduced ? undefined : { opacity: 1, y: 0 }}
                    transition={reduced ? undefined : { duration: 0.26, delay: i * 0.03, ease: 'easeOut' }}
                >
                    <StatsCard title={card.title} value={card.value} icon={card.icon} iconColor={card.iconColor} />
                </motion.div>
            ))}
        </div>
    );
}
