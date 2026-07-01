'use client';

/**
 * "Энэ session-д үргэлж зөвшөөрөх" — sessionStorage-д хадгалсан per-shop allow-set.
 *
 * sessionStorage учир зөвхөн тухайн browser session-д амьдарна (таб хаагдмагц арилна) —
 * Claude Desktop-ийн "this session" утгатай яг тохирно. Multi-tenant тул shop бүрд тусдаа.
 * Аюулгүй байдал: энэ нь зөвхөн попапыг алгасна; /api/ai-assistant/action бүх дуудалтад
 * RBAC + shop scope-ыг сервер талд ДАХИН шалгах тул spoof хийсэн ч эрх нэмэгдэхгүй.
 */

import { canRememberTool } from './riskTiers';

const keyFor = (shopId: string) => `vertmonhub_ai_allowed_tools:${shopId}`;

function read(shopId: string): string[] {
    if (typeof window === 'undefined' || !shopId) return [];
    try {
        const raw = window.sessionStorage.getItem(keyFor(shopId));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function write(shopId: string, tools: string[]): void {
    if (typeof window === 'undefined' || !shopId) return;
    try {
        window.sessionStorage.setItem(keyFor(shopId), JSON.stringify([...new Set(tools)]));
    } catch {
        /* sessionStorage бичих боломжгүй (private mode гэх мэт) — чимээгүй өнгөрнө */
    }
}

export function getAllowedTools(shopId: string): string[] {
    return read(shopId);
}

/** Tool-ыг allow-set-д нэмнэ. canRememberTool биш бол татгалзана (устгах/админ хэзээ ч биш). */
export function addAllowedTool(shopId: string, tool: string): void {
    if (!canRememberTool(tool)) return;
    const cur = read(shopId);
    if (!cur.includes(tool)) write(shopId, [...cur, tool]);
}

/** Auto-fire шалгалт: цээжилсэн бөгөөд цээжлэхийг зөвшөөрсөн tool мөн эсэх. */
export function isToolAllowed(shopId: string, tool: string): boolean {
    return canRememberTool(tool) && read(shopId).includes(tool);
}

export function clearAllowedTools(shopId: string): void {
    if (typeof window === 'undefined' || !shopId) return;
    try {
        window.sessionStorage.removeItem(keyFor(shopId));
    } catch {
        /* no-op */
    }
}
