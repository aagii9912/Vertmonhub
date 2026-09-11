'use client';

/**
 * "Энэ session-д үргэлж зөвшөөрөх" — sessionStorage-д хадгалсан allow-set.
 *
 * sessionStorage учир зөвхөн тухайн browser session-д амьдарна (таб хаагдмагц арилна) —
 * Claude Desktop-ийн "this session" утгатай яг тохирно. Multi-tenant тул shop бүрд,
 * мөн ХЭРЭГЛЭГЧ бүрд тусдаа (нэг таб дээр өөр хүн нэвтэрсэн ч өмнөх зөвшөөрөл дамжихгүй —
 * 2026-09 review M20).
 * Аюулгүй байдал: энэ нь зөвхөн попапыг алгасна; /api/ai-assistant/action бүх дуудалтад
 * RBAC + shop scope-ыг сервер талд ДАХИН шалгах тул spoof хийсэн ч эрх нэмэгдэхгүй.
 */

import { canRememberTool } from './riskTiers';

const keyFor = (shopId: string, userId?: string | null) => `vertmonhub_ai_allowed_tools:${shopId}:${userId || 'anon'}`;

function read(shopId: string, userId?: string | null): string[] {
    if (typeof window === 'undefined' || !shopId) return [];
    try {
        const raw = window.sessionStorage.getItem(keyFor(shopId, userId));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function write(shopId: string, userId: string | null | undefined, tools: string[]): void {
    if (typeof window === 'undefined' || !shopId) return;
    try {
        window.sessionStorage.setItem(keyFor(shopId, userId), JSON.stringify([...new Set(tools)]));
    } catch {
        /* sessionStorage бичих боломжгүй (private mode гэх мэт) — чимээгүй өнгөрнө */
    }
}

export function getAllowedTools(shopId: string, userId?: string | null): string[] {
    return read(shopId, userId);
}

/** Tool-ыг allow-set-д нэмнэ. canRememberTool биш бол татгалзана (устгах/админ хэзээ ч биш). */
export function addAllowedTool(shopId: string, tool: string, userId?: string | null): void {
    if (!canRememberTool(tool)) return;
    const cur = read(shopId, userId);
    if (!cur.includes(tool)) write(shopId, userId, [...cur, tool]);
}

/** Auto-fire шалгалт: цээжилсэн бөгөөд цээжлэхийг зөвшөөрсөн tool мөн эсэх. */
export function isToolAllowed(shopId: string, tool: string, userId?: string | null): boolean {
    return canRememberTool(tool) && read(shopId, userId).includes(tool);
}

export function clearAllowedTools(shopId: string, userId?: string | null): void {
    if (typeof window === 'undefined' || !shopId) return;
    try {
        window.sessionStorage.removeItem(keyFor(shopId, userId));
    } catch {
        /* no-op */
    }
}
