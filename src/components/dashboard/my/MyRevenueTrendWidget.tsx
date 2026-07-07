'use client';

import { ChartCard } from '@/components/ui/ChartCard';
import { LineChart } from '@/components/charts/LineChart';
import { formatMNT } from '@/lib/utils/currency';

/** «Орлогын тренд» — миний 12 сарын борлуулалт (manager_monthly_sales). */
export function MyRevenueTrendWidget({ trend, year }: { trend: number[]; year: number }) {
    const data = trend.map((value, i) => ({
        month: `${i + 1}-р сар`,
        sales: value,
    }));

    return (
        <ChartCard
            title={`Миний борлуулалт (${year})`}
            subtitle="Гэрээний дүнгээр, сар тутам"
            height={260}
        >
            <LineChart
                data={data}
                xKey="month"
                series={[{ key: 'sales', name: 'Борлуулалт' }]}
                valueFormatter={(v) => formatMNT(v, { compact: true })}
            />
        </ChartCard>
    );
}
