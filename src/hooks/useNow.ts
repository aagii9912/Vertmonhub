'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Одоогийн мөч — минут тутам, мөн таб руу буцахад шинэчлэгдэнэ: хуудас шөнөжин нээлттэй байсан ч
 * «өнөөдөр» солигдож, цаг нь өнгөрсөн уулзалт хоцорсон болно. `Date.now()` render-ээс гадуур.
 */
export function useNow(intervalMs = 60_000): Date {
    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
        const tick = () => setClock(Date.now());
        const timer = setInterval(tick, intervalMs);
        const refresh = () => { if (!document.hidden) tick(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [intervalMs]);
    return useMemo(() => new Date(clock), [clock]);
}
