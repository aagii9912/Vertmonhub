'use client';

/**
 * AI Orchestrator-ийн "Энэ session-д үргэлж зөвшөөрсөн" tool-уудыг цэвэрлэх жижиг хяналт.
 * sessionStorage таб хаагдмагц өөрөө арилдаг ч, хэрэглэгч гараар цуцлах боломжтой байх ёстой.
 * Идэвхтэй shop-ийн id-г localStorage-оос (vertmonhub_active_shop_id) уншина.
 */

import React, { useEffect, useState } from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { getAllowedTools, clearAllowedTools } from '@/lib/ai/allowedTools';

export function SessionApprovalsReset() {
    const [info, setInfo] = useState<{ shopId: string | null; count: number }>({ shopId: null, count: 0 });
    const [cleared, setCleared] = useState(false);
    const count = info.count;

    useEffect(() => {
        const id = typeof window !== 'undefined' ? localStorage.getItem('vertmonhub_active_shop_id') : null;
        // localStorage зөвхөн client дээр байдаг тул mount дээр л уншина (SSR hydration-д аюулгүй).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInfo({ shopId: id, count: id ? getAllowedTools(id).length : 0 });
    }, []);

    const handleClear = () => {
        if (info.shopId) clearAllowedTools(info.shopId);
        setInfo(prev => ({ ...prev, count: 0 }));
        setCleared(true);
    };

    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-2 text-brand-strong flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">Автоматаар зөвшөөрсөн үйлдлүүд</h3>
                    <p className="text-sm text-muted-foreground">
                        {cleared
                            ? 'Цэвэрлэгдлээ. Дараагийн үйлдэл бүрд дахин баталгаажуулна.'
                            : count > 0
                                ? `Энэ session-д ${count} төрлийн үйлдэл попапгүйгээр гүйцэтгэгдэнэ.`
                                : 'Одоогоор автоматаар зөвшөөрсөн үйлдэл алга.'}
                    </p>
                </div>
            </div>
            <button
                onClick={handleClear}
                disabled={count === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-medium text-muted-foreground hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
            >
                <RotateCcw className="w-4 h-4" /> Цэвэрлэх
            </button>
        </div>
    );
}
