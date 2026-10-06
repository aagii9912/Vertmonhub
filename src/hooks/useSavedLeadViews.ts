'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Лидийн хадгалсан харагдац — хэрэглэгч бүрийн өөрийн шүүлтүүрийн хослол (URL query), энэ төхөөрөмж ба
 * төсөлд. Хувийн тохиргоо тул browser-д хадгална; уншиж/бичиж чадахгүй (private горим) бол хоосон.
 */
export interface SavedLeadView {
    id: string;
    name: string;
    /** `serializeLeadFilters`-ийн query (хуудасгүй). */
    query: string;
}

export const SAVED_LEAD_VIEWS_MAX = 8;
const CHANGE_EVENT = 'vh:lead-views';
const EMPTY: SavedLeadView[] = [];
let cache: { key: string; raw: string | null; views: SavedLeadView[] } | null = null;

function parse(raw: string | null): SavedLeadView[] {
    try {
        const value: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(value)) return EMPTY;
        return value.filter((v): v is SavedLeadView =>
            !!v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.query === 'string').slice(0, SAVED_LEAD_VIEWS_MAX);
    } catch {
        return EMPTY;
    }
}

function snapshot(key: string | null): SavedLeadView[] {
    if (!key) return EMPTY;
    let raw: string | null;
    try { raw = localStorage.getItem(key); } catch { return EMPTY; }
    if (cache?.key === key && cache.raw === raw) return cache.views;
    cache = { key, raw, views: parse(raw) };
    return cache.views;
}

function subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

export function useSavedLeadViews() {
    const { user, shop } = useAuth();
    const key = user?.id && shop?.id ? `vh:lead-views:${user.id}:${shop.id}` : null;
    const views = useSyncExternalStore(subscribe, () => snapshot(key), () => EMPTY);

    const write = useCallback((next: SavedLeadView[]) => {
        if (!key) return false;
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            return false;
        }
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return true;
    }, [key]);

    /** Ижил нэртэйг солино; хамгийн шинэ нь эхэнд. Хадгалж чадсан эсэхийг буцаана. */
    const save = useCallback((name: string, query: string) => {
        const clean = name.trim().slice(0, 40);
        if (!clean) return false;
        const current = snapshot(key);
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
        return write([{ id, name: clean, query }, ...current.filter((v) => v.name !== clean)].slice(0, SAVED_LEAD_VIEWS_MAX));
    }, [key, write]);

    const remove = useCallback((id: string) => write(snapshot(key).filter((v) => v.id !== id)), [key, write]);

    return { views, save, remove, available: !!key };
}
