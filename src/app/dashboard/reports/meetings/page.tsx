'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, UserPlus, Repeat, KeyRound, Landmark, Banknote, Home, Receipt, ArrowLeftRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface MonthRow {
    month: string;
    total_meetings: number;
    new_customer: number;
    repeat_customer: number;
    existing_buyer: number;
    completed: number;
    fin_bank_loan: number;
    fin_cash: number;
    fin_mortgage: number;
    fin_leasing: number;
    fin_barter: number;
}
interface Totals {
    total: number; new_customer: number; repeat_customer: number; existing_buyer: number; completed: number;
    bank_loan: number; cash: number; mortgage: number; leasing: number; barter: number;
}

function shopHeaders(): HeadersInit {
    return { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' };
}
function monthLabel(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getFullYear()} оны ${d.getMonth() + 1}-р сар`;
}

const FIN = [
    { key: 'bank_loan', label: 'Банкны зээл', icon: <Landmark className="w-4 h-4" /> },
    { key: 'cash', label: 'Бэлэн', icon: <Banknote className="w-4 h-4" /> },
    { key: 'mortgage', label: 'Ипотек', icon: <Home className="w-4 h-4" /> },
    { key: 'leasing', label: 'Лизинг', icon: <Receipt className="w-4 h-4" /> },
    { key: 'barter', label: 'Бартер', icon: <ArrowLeftRight className="w-4 h-4" /> },
] as const;

export default function MeetingsReportPage() {
    const [months, setMonths] = useState<MonthRow[]>([]);
    const [totals, setTotals] = useState<Totals | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/dashboard/reports/meetings', { headers: shopHeaders() });
                const data = await res.json();
                setMonths(data.months || []);
                setTotals(data.totals || null);
            } catch (e) {
                console.error('[Meetings] fetch error', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const t = totals;

    // Financing channel breakdown — same totals, rendered as a bar chart instead of tiles.
    const finData = FIN.map((f) => ({
        channel: f.label,
        value: t ? (t as unknown as Record<string, number>)[f.key] : 0,
    }));

    // Monthly breakdown — column renderers reuse the exact MonthRow numbers + monthLabel().
    const columns: DataTableColumn<MonthRow>[] = [
        { key: 'month', header: 'Сар', cell: (m) => <span className="text-foreground">{monthLabel(m.month)}</span> },
        { key: 'total_meetings', header: 'Нийт', align: 'right', cell: (m) => <span className="tabular-nums font-medium text-foreground">{m.total_meetings}</span> },
        { key: 'new_customer', header: 'Шинэ', align: 'right', cell: (m) => <span className="tabular-nums text-status-success">{m.new_customer}</span> },
        { key: 'repeat_customer', header: 'Давтан', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{m.repeat_customer}</span> },
        { key: 'existing_buyer', header: 'Худ. авагч', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{m.existing_buyer}</span> },
        { key: 'completed', header: 'Дуусгасан', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.completed}</span> },
        { key: 'fin_bank_loan', header: 'Банк', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.fin_bank_loan}</span> },
        { key: 'fin_cash', header: 'Бэлэн', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.fin_cash}</span> },
        { key: 'fin_mortgage', header: 'Ипотек', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.fin_mortgage}</span> },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Аналитик"
                title="Уулзалтын аналитик"
                subtitle="Сар бүрийн уулзалт: шинэ / давтан / худалдан авагч ба санхүүжилтийн суваг"
            />

            <StatBar columns={4}>
                <StatTile label="Нийт уулзалт" value={t?.total ?? 0} icon={<CalendarDays className="w-4 h-4" />} accent="info" helper={`${t?.completed ?? 0} дуусгасан`} />
                <StatTile label="Шинэ харилцагч" value={t?.new_customer ?? 0} icon={<UserPlus className="w-4 h-4" />} accent="success" />
                <StatTile label="Давтан" value={t?.repeat_customer ?? 0} icon={<Repeat className="w-4 h-4" />} accent="brand" />
                <StatTile label="Худалдан авагч" value={t?.existing_buyer ?? 0} icon={<KeyRound className="w-4 h-4" />} accent="warning" />
            </StatBar>

            {/* Financing channel breakdown */}
            <ChartCard
                eyebrow="Санхүүжилт"
                title="Санхүүжилтийн суваг"
                height={240}
                className="mb-5"
            >
                <BarChart
                    data={finData}
                    xKey="channel"
                    series={[{ key: 'value', name: 'Уулзалт' }]}
                    colorByPoint
                />
            </ChartCard>

            {/* Monthly table */}
            <Card>
                <div className="p-4 md:p-5">
                    <DataTable<MonthRow>
                        columns={columns}
                        data={months}
                        getRowId={(m) => m.month}
                        caption="Сар бүрийн уулзалтын задаргаа"
                        loading={loading}
                        emptyMessage="Менежерүүд уулзалт товлоход (лийдийн санхүүжилт, уулзалтын төрөл бүртгэснээр) сар бүрийн задаргаа энд хуримтлагдана."
                        showDensityToggle={false}
                        hidePagination
                    />
                </div>
            </Card>
        </div>
    );
}
