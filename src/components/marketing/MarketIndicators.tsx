'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatShortDate } from '@/lib/utils/date';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { Landmark, Plus, Trash2 } from 'lucide-react';

/**
 * «Зах зээлийн үзүүлэлт» — ипотекийн хүү, банкны нөхцөл, макро мэдээллийг
 * гараар бүртгэж хянана (market_indicators). AI туслах get_market_indicators
 * tool-оор уншиж зөвлөгөөндөө ашиглана.
 */

interface Indicator {
    id: string;
    category: string;
    name: string;
    value: string;
    note: string | null;
    recorded_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    mortgage: 'Ипотекийн зээл',
    bank: 'Банкны нөхцөл',
    macro: 'Макро',
    other: 'Бусад',
};

const CATEGORY_VARIANT: Record<string, 'info' | 'success' | 'pending' | 'neutral'> = {
    mortgage: 'info',
    bank: 'success',
    macro: 'pending',
    other: 'neutral',
};

export function MarketIndicators() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const queryClient = useQueryClient();

    const [category, setCategory] = useState('mortgage');
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [note, setNote] = useState('');

    const headers = { 'Content-Type': 'application/json', 'x-shop-id': shopId || '' };

    const { data } = useQuery<{ indicators: Indicator[]; available: boolean }>({
        queryKey: ['market-indicators', shopId],
        queryFn: async () => {
            const res = await fetch('/api/marketing/indicators', { headers: { 'x-shop-id': shopId! } });
            if (!res.ok) throw new Error(`Indicators failed: ${res.status}`);
            return res.json();
        },
        enabled: !!shopId,
        staleTime: 60000,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['market-indicators'] });

    const addIndicator = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/marketing/indicators', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    category,
                    name: name.trim(),
                    value: value.trim(),
                    note: note.trim() || null,
                }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Алдаа');
        },
        onSuccess: () => {
            setName('');
            setValue('');
            setNote('');
            invalidate();
            toast.success('Үзүүлэлт нэмэгдлээ');
        },
        onError: (e) => toast.error(e.message),
    });

    const removeIndicator = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/marketing/indicators?id=${id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error('Устгах алдаа');
        },
        onSuccess: () => {
            invalidate();
            toast.success('Устгагдлаа');
        },
        onError: (e) => toast.error(e.message),
    });

    const indicators = data?.indicators || [];

    return (
        <Card className="mb-5">
            <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-brand" />
                    Зах зээлийн үзүүлэлт — ипотек, банкны нөхцөл
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 w-40" aria-label="Ангилал">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
                                <SelectItem key={v} value={v}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Нэр (ж: Хаан банк ипотек)"
                        className="w-52"
                        aria-label="Нэр"
                    />
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Утга (ж: 10.8% / 30 жил)"
                        className="w-44"
                        aria-label="Утга"
                    />
                    <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Нөхцөл, тайлбар (заавал биш)"
                        className="flex-1 min-w-40"
                        aria-label="Тайлбар"
                    />
                    <Button
                        onClick={() => addIndicator.mutate()}
                        isLoading={addIndicator.isPending}
                        disabled={!name.trim() || !value.trim()}
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>

                {indicators.length > 0 ? (
                    <div className="divide-y divide-border/60">
                        {indicators.map((ind) => (
                            <div key={ind.id} className="py-2.5 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <StatusPill variant={CATEGORY_VARIANT[ind.category] || 'neutral'}>
                                        {CATEGORY_LABELS[ind.category] || ind.category}
                                    </StatusPill>
                                    <div className="min-w-0">
                                        <p className="text-sm text-foreground truncate">
                                            <span className="font-medium">{ind.name}</span> — {ind.value}
                                        </p>
                                        {ind.note && (
                                            <p className="text-xs text-muted-foreground truncate">{ind.note}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {formatShortDate(ind.recorded_at)}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="iconSm"
                                        onClick={() => removeIndicator.mutate(ind.id)}
                                        title="Устгах"
                                    >
                                        <Trash2 className="w-4 h-4 text-status-danger" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Ипотекийн хүү, банкны нөхцөлөө бүртгэвэл AI туслах зөвлөгөөндөө ашиглана
                        (ж: «Хаан банк ипотек — 10.8% / 30 жил»).
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
