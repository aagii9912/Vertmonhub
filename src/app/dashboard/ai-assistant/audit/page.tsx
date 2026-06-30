'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface AuditEntry {
    id: string;
    tool: string;
    success: boolean;
    created_at: string;
    user: string;
    args: Record<string, unknown>;
}

const TOOL_LABEL: Record<string, string> = {
    create_property: 'Байр нэмэх', update_property_status: 'Байрны статус', update_property_price: 'Байрны үнэ', delete_property: 'Байр устгах',
    create_lead: 'Лийд үүсгэх', update_lead_status: 'Лийдийн статус', add_lead_note: 'Лийд тэмдэглэл', delete_lead: 'Лийд устгах', bulk_update_leads: 'Бөөнөөр лийд шинэчлэх',
    create_customer: 'Харилцагч үүсгэх', delete_customer: 'Харилцагч устгах',
    schedule_viewing: 'Уулзалт товлох', delete_viewing: 'Уулзалт устгах',
    create_contract: 'Гэрээ үүсгэх', delete_contract: 'Гэрээ устгах', process_contract_action: 'Гэрээний процесс',
    invite_user: 'Хэрэглэгч урих', assign_role: 'Дүр оноох', create_role: 'Дүр үүсгэх', attach_file: 'Файл хавсаргах',
};

export default function AiAuditPage() {
    const { shop } = useAuth();
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!shop?.id) return;
        (async () => {
            setLoading(true); setError(null);
            try {
                const res = await fetch('/api/dashboard/ai-audit', { headers: { 'x-shop-id': shop.id } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Алдаа');
                setEntries(data.entries || []);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
            } finally {
                setLoading(false);
            }
        })();
    }, [shop?.id]);

    const fmt = (d: string) => new Date(d).toLocaleString('mn-MN');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-brand-strong" /> AI Аудит
                </h1>
                <p className="text-sm text-muted-foreground mt-1">AI Orchestrator-ээр хийгдсэн бичих/устгах/админ үйлдлүүд (сүүлийн 100)</p>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Татаж байна...</div>
                    ) : error ? (
                        <div className="py-16 text-center text-status-danger text-sm">{error}</div>
                    ) : entries.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground text-sm">Одоогоор бүртгэл алга</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-2/50 border-b border-border">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">Огноо</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">Менежер</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">Үйлдэл</th>
                                        <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">Үр дүн</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {entries.map((e) => (
                                        <tr key={e.id} className="hover:bg-surface-2/40">
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(e.created_at)}</td>
                                            <td className="px-4 py-3 text-foreground">{e.user}</td>
                                            <td className="px-4 py-3 text-foreground">{TOOL_LABEL[e.tool] || e.tool}</td>
                                            <td className="px-4 py-3">
                                                {e.success
                                                    ? <span className="inline-flex items-center gap-1 text-status-success text-xs"><CheckCircle2 className="w-4 h-4" /> Амжилттай</span>
                                                    : <span className="inline-flex items-center gap-1 text-status-danger text-xs"><XCircle className="w-4 h-4" /> Алдаа</span>}
                                            </td>
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
