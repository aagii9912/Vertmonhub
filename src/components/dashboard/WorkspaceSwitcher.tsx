'use client';

import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import {
    WORKSPACES,
    WORKSPACE_ORDER,
    type WorkspaceId,
} from '@/lib/navigation/workspaces';
import {
    useActiveWorkspace,
    getSwitchTarget,
} from '@/lib/navigation/useActiveWorkspace';

const byId = (id: WorkspaceId) => WORKSPACES.find((w) => w.id === id)!;

/**
 * Гурван талт workspace switcher — header-ийн төвд хөвмөл segmented pill.
 * [ Борлуулалт ] [ ✦ AI Туслах ] [ Маркетинг ] — AI төв нь голлох (terracotta) hero.
 *
 * Дарж солино (hover биш). Гулсдаг indicator нь тэнцүү 3 хэсэгт тулгуурлах тул
 * хэмжилт хийхгүй — анхны зурагнаас зөв байрлана. prefers-reduced-motion-д globals.css
 * автоматаар хүндрэлгүй (агшина).
 */
export function WorkspaceSwitcher() {
    const router = useRouter();
    const active = useActiveWorkspace();
    const { user } = useAuth();
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const canAccessWs = (id: WorkspaceId): boolean => {
        const ws = byId(id);
        if (ws.accessModules.length === 0) return true; // эрхгүй (үргэлж нээлттэй)
        return ws.accessModules.some((m) =>
            user?.permissions
                ? canAccessModuleDynamic(user.permissions, m)
                : canAccessModule(user?.role || 'viewer', m),
        );
    };

    const order = WORKSPACE_ORDER;
    const activeIndex = order.indexOf(active.id);

    const go = (id: WorkspaceId) => {
        if (!canAccessWs(id)) return;
        const ws = byId(id);
        // AI төв нь үргэлж бүтэн хуудас руу (бүтээгдэхүүний шийдвэр).
        router.push(ws.id === 'ai' ? ws.home : getSwitchTarget(ws));
    };

    const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const enabled = order.filter(canAccessWs);
        if (enabled.length === 0) return;
        const cur = enabled.indexOf(order[idx]);
        let next: WorkspaceId;
        if (e.key === 'ArrowRight') next = enabled[(cur + 1) % enabled.length];
        else if (e.key === 'ArrowLeft') next = enabled[(cur - 1 + enabled.length) % enabled.length];
        else if (e.key === 'Home') next = enabled[0];
        else next = enabled[enabled.length - 1];
        tabRefs.current[next]?.focus();
        go(next);
    };

    const aiActive = active.id === 'ai';

    return (
        <div
            role="tablist"
            aria-label="Ажлын талбар"
            aria-orientation="horizontal"
            className="relative inline-grid grid-cols-3 gap-0 rounded-full bg-surface-2 p-1 border border-border/60 shadow-xs"
        >
            {/* Гулсдаг indicator — тэнцүү 3 хэсэг */}
            <span
                aria-hidden
                className={cn(
                    'absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-out',
                    aiActive ? 'bg-brand shadow-sm' : 'bg-surface shadow-sm',
                )}
                style={{
                    width: 'calc((100% - 0.5rem) / 3)',
                    transform: `translateX(calc(${activeIndex} * 100%))`,
                }}
            />

            {order.map((id, idx) => {
                const ws = byId(id);
                const isActive = active.id === id;
                const enabled = canAccessWs(id);
                const isAi = id === 'ai';
                const Icon = ws.icon;
                return (
                    <button
                        key={id}
                        ref={(el) => { tabRefs.current[id] = el; }}
                        role="tab"
                        id={`ws-tab-${id}`}
                        type="button"
                        aria-selected={isActive}
                        aria-label={ws.label}
                        aria-disabled={!enabled || undefined}
                        tabIndex={isActive ? 0 : -1}
                        disabled={!enabled}
                        onClick={() => go(id)}
                        onKeyDown={(e) => onKeyDown(e, idx)}
                        className={cn(
                            'relative z-10 flex items-center justify-center gap-1.5 rounded-full h-8 px-3 md:px-4 text-sm font-medium transition-colors min-w-0 whitespace-nowrap',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            isActive && isAi && 'text-brand-fg',
                            isActive && !isAi && 'text-foreground',
                            !isActive && isAi && 'text-brand hover:text-brand-strong',
                            !isActive && !isAi && 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon
                            className={cn('shrink-0', isAi ? 'w-[18px] h-[18px]' : 'w-4 h-4')}
                            strokeWidth={isActive ? 2.25 : 1.75}
                        />
                        {/* AI нэрээ үргэлж харуулна; бусад нь жижиг дэлгэцэд богино нэр */}
                        <span className={cn('truncate', !isAi && 'hidden sm:inline')}>
                            <span className="sm:hidden">{ws.shortLabel}</span>
                            <span className="hidden sm:inline">{ws.label}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
