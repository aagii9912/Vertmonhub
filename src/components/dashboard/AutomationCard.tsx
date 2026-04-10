'use client';

import {
    ToggleLeft,
    ToggleRight,
    Save,
    Trash2,
    Zap,
    TrendingUp,
    Clock,
} from 'lucide-react';

export interface Automation {
    id: string;
    name: string;
    is_active: boolean;
    post_id: string | null;
    post_url: string | null;
    trigger_keywords: string[];
    match_type: 'contains' | 'exact';
    action_type: 'send_dm' | 'reply_comment' | 'both';
    dm_message: string;
    reply_message: string | null;
    platform: 'facebook' | 'instagram' | 'both';
    trigger_count: number;
    last_triggered_at: string | null;
    created_at: string;
}

interface AutomationCardProps {
    automation: Automation;
    onToggle: (id: string, currentState: boolean) => void;
    onEdit: (automation: Automation) => void;
    onDelete: (id: string) => void;
}

export function AutomationCard({ automation: a, onToggle, onEdit, onDelete }: AutomationCardProps) {
    return (
        <div
            className={`bg-[#0F0B2E] rounded-xl border p-5 transition-colors ${a.is_active ? 'border-white/[0.08]' : 'border-white/[0.04] opacity-60'
                }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    {/* Name & Status */}
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            onClick={() => onToggle(a.id, a.is_active)}
                            className="shrink-0"
                            aria-label={a.is_active ? 'Зогсоох' : 'Идэвхжүүлэх'}
                        >
                            {a.is_active ? (
                                <ToggleRight className="w-6 h-6 text-emerald-400" />
                            ) : (
                                <ToggleLeft className="w-6 h-6 text-white/20" />
                            )}
                        </button>
                        <h3 className="text-[14px] font-semibold text-foreground truncate">
                            {a.name}
                        </h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.platform === 'facebook' ? 'bg-blue-500/10 text-blue-400' :
                            a.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400' :
                                'bg-violet-500/10 text-violet-400'
                            }`}>
                            {a.platform === 'both' ? 'FB+IG' : a.platform === 'facebook' ? 'FB' : 'IG'}
                        </span>
                    </div>

                    {/* Keywords */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {a.trigger_keywords.map((kw, i) => (
                            <span
                                key={i}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] text-white/50 border border-white/[0.06]"
                            >
                                {kw}
                            </span>
                        ))}
                        <span className="text-[10px] text-white/20 self-center ml-1">
                            ({a.match_type === 'contains' ? 'агуулсан' : 'яг таарах'})
                        </span>
                    </div>

                    {/* DM Preview */}
                    <p className="text-[12px] text-white/40 truncate max-w-lg">
                        💬 {a.dm_message}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-white/30">
                        <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {a.trigger_count} удаа
                        </span>
                        <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {a.action_type === 'send_dm' ? 'DM' : a.action_type === 'reply_comment' ? 'Reply' : 'DM+Reply'}
                        </span>
                        {a.last_triggered_at && (
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(a.last_triggered_at).toLocaleDateString('mn-MN')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => onEdit(a)}
                        className="p-2 text-white/20 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                        aria-label="Засах"
                    >
                        <Save className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(a.id)}
                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        aria-label="Устгах"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
