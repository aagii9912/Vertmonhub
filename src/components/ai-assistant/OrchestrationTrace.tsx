'use client';

/**
 * AI туслах v3-ийн ил тод байдлын UI (collapsible trace):
 * модель, раунд, tool дуудлага бүр (агент/latency/товч), дэд агентын алхмууд,
 * токен (input/output/cache) ба нийт хугацаа.
 */

import React from 'react';
import { Clock, Cpu, Wrench, AlertTriangle, Users, Database } from 'lucide-react';

export interface AgentBadge { id: string; name: string; emoji: string; color: string }

interface TraceTool { tool: string; agentId: string; ok: boolean; latencyMs: number; summary: string }
interface TraceStep { agentId: string; agentName: string; emoji: string; color: string; task: string; toolsUsed: string[]; latencyMs: number; tokens: number; ok: boolean; error?: string }
interface Trace {
    model: string;
    rounds: number;
    tools: TraceTool[];
    steps: TraceStep[];
    totalLatencyMs: number;
    totalTokens: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    summaryUsed?: boolean;
}

const COLOR_MAP: Record<string, string> = {
    emerald: 'bg-status-success-soft text-status-success border-status-success/30',
    violet: 'bg-brand-soft text-brand border-brand/30',
    sky: 'bg-status-info-soft text-status-info border-status-info/30',
    amber: 'bg-status-pending-soft text-status-pending border-status-pending/30',
    rose: 'bg-status-danger-soft text-status-danger border-status-danger/30',
};
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

export function AgentBadges({ agents }: { agents: AgentBadge[] }) {
    if (!agents?.length) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {agents.map((a) => (
                <span key={a.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${COLOR_MAP[a.color] || COLOR_MAP.violet}`}>{a.emoji} {a.name}</span>
            ))}
        </div>
    );
}

export function OrchestrationTrace({ trace }: { trace: Trace | null | undefined }) {
    if (!trace) return null;
    // v2 (planner) trace-тэй хуучин мессежүүд: tools байхгүй → зөвхөн алхам харуулна.
    const tools = trace.tools || [];
    const steps = trace.steps || [];
    return (
        <div className="rounded-md border border-border bg-surface-2/50 px-3 py-2 text-[11.5px] text-fg-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Cpu className="h-3 w-3" /> {trace.model}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {ms(trace.totalLatencyMs)}</span>
                {trace.rounds ? <span>{trace.rounds} раунд</span> : null}
                <span className="mono-label">{trace.totalTokens.toLocaleString()} токен{trace.cacheReadTokens ? ` · cache ${trace.cacheReadTokens.toLocaleString()}` : ''}</span>
                {trace.summaryUsed && <span className="inline-flex items-center gap-1"><Database className="h-3 w-3" /> ярианы хураангуй</span>}
            </div>
            {tools.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                    {tools.map((t, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                            <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="mono-label text-foreground">{t.tool}</span>
                            {t.agentId !== 'main' && <span className="text-muted-foreground">({t.agentId})</span>}
                            <span className="truncate text-muted-foreground">— {t.summary}</span>
                            {!t.ok && <AlertTriangle className="h-3 w-3 text-status-danger" />}
                            <span className="mono-label ml-auto pl-2 text-muted-foreground">{ms(t.latencyMs)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {steps.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1 border-t border-border pt-1.5">
                    {steps.map((s, i) => (
                        <li key={i} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                                <Users className="h-3 w-3 text-muted-foreground" />
                                <span className={`rounded-full border px-1.5 text-[10.5px] ${COLOR_MAP[s.color] || COLOR_MAP.violet}`}>{s.emoji} {s.agentName}</span>
                                <span className="truncate text-muted-foreground">{s.task}</span>
                                {!s.ok && <AlertTriangle className="h-3 w-3 text-status-danger" />}
                                <span className="mono-label ml-auto pl-2 text-muted-foreground">{ms(s.latencyMs)}</span>
                            </div>
                            {s.error && <div className="pl-5 text-status-danger">{s.error}</div>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
