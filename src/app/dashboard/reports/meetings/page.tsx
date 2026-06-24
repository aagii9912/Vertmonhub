'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, UserPlus, Repeat, KeyRound, CheckCircle2, Landmark, Banknote, Home, Receipt, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';

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
            <Card className="mb-5">
                <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-brand-strong" /> Санхүүжилтийн суваг
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {FIN.map((f) => (
                            <div key={f.key} className="p-3 rounded-lg border border-border bg-surface-2/40">
                                <div className="flex items-center gap-1.5 text-muted-foreground text-[12px] mb-1">{f.icon}{f.label}</div>
                                <div className="text-xl font-semibold text-foreground tabular-nums">{t ? (t as unknown as Record<string, number>)[f.key] : 0}</div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Monthly table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
                    ) : months.length === 0 ? (
                        <div className="py-12">
                            <EmptyState
                                icon={<CalendarDays className="w-7 h-7" />}
                                title="Уулзалтын бүртгэл алга"
                                description="Менежерүүд уулзалт товлоход (лийдийн санхүүжилт, уулзалтын төрөл бүртгэснээр) сар бүрийн задаргаа энд хуримтлагдана."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                        <th className="px-4 py-3 font-medium">Сар</th>
                                        <th className="px-4 py-3 font-medium text-right">Нийт</th>
                                        <th className="px-4 py-3 font-medium text-right">Шинэ</th>
                                        <th className="px-4 py-3 font-medium text-right">Давтан</th>
                                        <th className="px-4 py-3 font-medium text-right">Худ. авагч</th>
                                        <th className="px-4 py-3 font-medium text-right">Дуусгасан</th>
                                        <th className="px-4 py-3 font-medium text-right">Банк</th>
                                        <th className="px-4 py-3 font-medium text-right">Бэлэн</th>
                                        <th className="px-4 py-3 font-medium text-right">Ипотек</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {months.map((m) => (
                                        <tr key={m.month} className="border-b border-border/40 hover:bg-surface-2/40 transition-colors">
                                            <td className="px-4 py-3 text-foreground">{monthLabel(m.month)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{m.total_meetings}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-status-success">{m.new_customer}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{m.repeat_customer}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{m.existing_buyer}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.completed}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.fin_bank_loan}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.fin_cash}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.fin_mortgage}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
