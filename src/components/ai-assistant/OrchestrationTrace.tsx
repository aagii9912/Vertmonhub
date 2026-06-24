'use client';

/**
 * Orchestrator-ийн ил тод байдлын UI:
 * - AgentBadges: хариуг бэлдсэн agent-уудын тэмдэг
 * - OrchestrationTrace: замчилагч + agent бүрийн алхам, latency, токен, tool-уудыг
 *   задлан харуулах буфэр (collapsible)
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Workflow, Clock, Cpu, Wrench, AlertTriangle } from 'lucide-react';

export interface AgentBadge {
    id: string;
    name: string;
    emoji: string;
    color: string;
}

interface TraceStep {
    agentId: string;
    agentName: string;
    emoji: string;
    color: string;
    task: string;
    toolsUsed: string[];
    latencyMs: number;
    tokens: number;
    ok: boolean;
    error?: string;
}

interface Trace {
    plannerReasoning: string;
    plannerLatencyMs: number;
    plannerModel: string;
    steps: TraceStep[];
    synthesisUsed: boolean;
    synthesisLatencyMs: number;
    totalLatencyMs: number;
    totalTokens: number;
}

// Agent өнгөний түлхүүр → Tailwind классууд (theme tokens)
const COLOR_MAP: Record<string, { chip: string; dot: string }> = {
    emerald: { chip: 'bg-status-success-soft text-status-success border-status-success/30', dot: 'bg-status-success' },
    violet: { chip: 'bg-brand-soft text-brand-strong border-brand/30', dot: 'bg-brand' },
    sky: { chip: 'bg-status-info-soft text-status-info border-status-info/30', dot: 'bg-status-info' },
    amber: { chip: 'bg-status-pending-soft text-status-pending border-status-pending/30', dot: 'bg-status-pending' },
    rose: { chip: 'bg-status-danger-soft text-status-danger border-status-danger/30', dot: 'bg-status-danger' },
};

function colorOf(color: string) {
    return COLOR_MAP[color] || COLOR_MAP.violet;
}

function ms(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`;
}

export function AgentBadges({ agents }: { agents: AgentBadge[] }) {
    return (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
            {agents.map((a) => {
                const c = colorOf(a.color);
                return (
                    <span
                        key={a.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.chip}`}
                    >
                        <span>{a.emoji}</span>
                        {a.name}
                    </span>
                );
            })}
        </div>
    );
}

export function OrchestrationTrace({ trace }: { trace: Trace }) {
    const [open, setOpen] = useState(false);

    if (!trace || !Array.isArray(trace.steps)) return null;

    return (
        <div className="mt-2">
            <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Workflow className="w-3.5 h-3.5" />
                Орчестрацийн алхмууд
                <span className="text-muted-foreground/70">
                    · {trace.steps.length} agent · {ms(trace.totalLatencyMs)}
                    {trace.totalTokens ? ` · ${trace.totalTokens} tok` : ''}
                </span>
            </button>

            {open && (
                <div className="mt-2 rounded-xl border border-border/60 bg-surface-2/40 p-3 space-y-3">
                    {/* Planner */}
                    {trace.plannerReasoning && (
                        <div className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">🧠 Замчилагч:</span> {trace.plannerReasoning}
                            <span className="text-muted-foreground/70"> ({ms(trace.plannerLatencyMs)})</span>
                        </div>
                    )}

                    {/* Steps */}
                    <ol className="space-y-2">
                        {trace.steps.map((s, i) => {
                            const c = colorOf(s.color);
                            return (
                                <li key={i} className="relative pl-4">
                                    <span className={`absolute left-0 top-1.5 w-2 h-2 rounded-full ${c.dot}`} />
                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                                        <span className="text-xs font-semibold text-foreground">{s.emoji} {s.agentName}</span>
                                        {!s.ok && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] text-status-danger">
                                                <AlertTriangle className="w-3 h-3" /> алдаа
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                            <Clock className="w-3 h-3" />{ms(s.latencyMs)}
                                        </span>
                                        {s.tokens > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                <Cpu className="w-3 h-3" />{s.tokens} tok
                                            </span>
                                        )}
                                    </div>
                                    {s.task && <p className="text-[11px] text-muted-foreground mt-0.5">{s.task}</p>}
                                    {s.toolsUsed && s.toolsUsed.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 mt-1">
                                            <Wrench className="w-3 h-3 text-muted-foreground/70" />
                                            {s.toolsUsed.map((t, j) => (
                                                <code key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border/60 text-muted-foreground">
                                                    {t}
                                                </code>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    {/* Synthesis */}
                    {trace.synthesisUsed && (
                        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                            🔗 Нэгтгэл: {trace.steps.length} agent-ийн хариуг нэгтгэв ({ms(trace.synthesisLatencyMs)})
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
