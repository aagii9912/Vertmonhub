'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Sparkles, Users, FileText, Plus, X, Loader2, Globe, ClipboardList, AlertCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

type QuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'rating';

interface SurveyQuestion {
    id: string;
    type: QuestionType;
    text: string;
    options?: string[];
    required?: boolean;
}

interface SurveyMeta {
    id: string;
    title: string;
    description: string | null;
    questions: SurveyQuestion[];
}

interface SurveyResponse {
    id: string;
    answers: Record<string, unknown>;
    created_at: string;
    source?: 'online' | 'offline';
    respondent_name?: string | null;
    respondent_phone?: string | null;
    notes?: string | null;
}

type AnswerValue = string | string[] | number | null;

export default function SurveyReportPage() {
    const params = useParams();
    const router = useRouter();
    const surveyId = params.id as string;

    const [summary, setSummary] = useState<string>('');
    const [responseCount, setResponseCount] = useState<number>(0);
    const [onlineCount, setOnlineCount] = useState<number>(0);
    const [offlineCount, setOfflineCount] = useState<number>(0);
    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [survey, setSurvey] = useState<SurveyMeta | null>(null);
    const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
    const [isLoading, setIsLoading] = useState(true);

    // Offline entry modal state
    const [isOfflineOpen, setIsOfflineOpen] = useState(false);
    const [offlineAnswers, setOfflineAnswers] = useState<Record<string, AnswerValue>>({});
    const [offlineMeta, setOfflineMeta] = useState({ name: '', phone: '', notes: '' });
    const [offlineSubmitting, setOfflineSubmitting] = useState(false);
    const [offlineError, setOfflineError] = useState<string | null>(null);

    const loadSummary = async () => {
        try {
            const res = await fetch(`/api/surveys/${surveyId}`);
            if (!res.ok) throw new Error('Failed to fetch summary');
            const data = await res.json();
            setSummary(data.summary || '');
            setResponseCount(data.responseCount || 0);
            setOnlineCount(data.onlineCount || 0);
            setOfflineCount(data.offlineCount || 0);
            setResponses(data.responses || []);
            setSurvey(data.survey || null);
        } catch (error) {
            console.error(error);
            setSummary('Тайлан татахад алдаа гарлаа.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (surveyId) loadSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId]);

    const openOfflineModal = () => {
        setOfflineAnswers({});
        setOfflineMeta({ name: '', phone: '', notes: '' });
        setOfflineError(null);
        setIsOfflineOpen(true);
    };

    const submitOffline = async () => {
        if (!survey) return;
        // Validate required questions
        for (const q of survey.questions) {
            if (!q.required) continue;
            const val = offlineAnswers[q.id];
            const empty =
                val === undefined ||
                val === null ||
                (typeof val === 'string' && val.trim() === '') ||
                (Array.isArray(val) && val.length === 0);
            if (empty) {
                setOfflineError(`"${q.text}" асуултанд хариулт өгөх шаардлагатай`);
                return;
            }
        }
        setOfflineSubmitting(true);
        setOfflineError(null);
        try {
            const res = await fetch(`/api/surveys/${surveyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    answers: offlineAnswers,
                    source: 'offline',
                    respondent_name: offlineMeta.name.trim() || undefined,
                    respondent_phone: offlineMeta.phone.trim() || undefined,
                    notes: offlineMeta.notes.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Илгээхэд алдаа гарлаа');
            }
            setIsOfflineOpen(false);
            setIsLoading(true);
            await loadSummary();
        } catch (err) {
            setOfflineError(err instanceof Error ? err.message : 'Илгээхэд алдаа гарлаа');
        } finally {
            setOfflineSubmitting(false);
        }
    };

    const filteredResponses =
        filter === 'all' ? responses : responses.filter(r => (r.source ?? 'online') === filter);

    const renderQuestionInput = (q: SurveyQuestion) => {
        const value = offlineAnswers[q.id];
        const setVal = (v: AnswerValue) => setOfflineAnswers(prev => ({ ...prev, [q.id]: v }));
        switch (q.type) {
            case 'short_text':
                return (
                    <input
                        type="text"
                        value={(value as string) ?? ''}
                        onChange={e => setVal(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                );
            case 'long_text':
                return (
                    <textarea
                        value={(value as string) ?? ''}
                        onChange={e => setVal(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                );
            case 'single_choice':
                return (
                    <div className="space-y-1.5">
                        {(q.options || []).map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name={q.id}
                                    checked={value === opt}
                                    onChange={() => setVal(opt)}
                                />
                                {opt}
                            </label>
                        ))}
                    </div>
                );
            case 'multiple_choice': {
                const arr = Array.isArray(value) ? (value as string[]) : [];
                return (
                    <div className="space-y-1.5">
                        {(q.options || []).map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={arr.includes(opt)}
                                    onChange={e => {
                                        if (e.target.checked) setVal([...arr, opt]);
                                        else setVal(arr.filter(o => o !== opt));
                                    }}
                                />
                                {opt}
                            </label>
                        ))}
                    </div>
                );
            }
            case 'rating':
                return (
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setVal(n)}
                                className={`w-10 h-10 rounded-full border-2 text-sm font-semibold transition-colors ${
                                    value === n
                                        ? 'bg-brand border-violet-600 text-white'
                                        : 'border-border text-muted-foreground hover:border-violet-400'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-5 h-5 mr-1" /> Буцах
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Судалгааны Тайлан</h1>
                        <p className="text-muted-foreground text-sm">Online + биеэр (offline) бүх хариултын нэгдсэн дүр зураг</p>
                    </div>
                </div>
                <Button onClick={openOfflineModal} disabled={!survey}>
                    <Plus className="w-4 h-4 mr-2" /> Биеэр хариулт оруулах
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-muted-foreground">Нийт хариулт</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold flex items-center gap-2">
                            <Users className="w-6 h-6 text-primary" />
                            {isLoading ? '...' : responseCount}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-info-soft text-status-info">
                                <Globe className="w-3 h-3" /> Online {onlineCount}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-pending-soft text-status-pending">
                                <ClipboardList className="w-3 h-3" /> Биеэр {offlineCount}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center gap-2">
                        <Sparkles className="w-5 h-5 text-brand" />
                        <div>
                            <CardTitle>AI Нэгтгэл</CardTitle>
                            <CardDescription>Online + биеэр бүх хариултыг нэгтгэн Gemini-ээр шинжилсэн</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-4 bg-surface-3 rounded w-3/4"></div>
                                <div className="h-4 bg-surface-3 rounded w-full"></div>
                                <div className="h-4 bg-surface-3 rounded w-5/6"></div>
                            </div>
                        ) : (
                            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">{summary}</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground/70" /> Сүүлийн хариултууд
                        </CardTitle>
                        <div className="flex gap-1 text-xs">
                            {(['all', 'online', 'offline'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1 rounded-full font-medium transition-colors ${
                                        filter === f
                                            ? 'bg-brand text-white'
                                            : 'bg-surface-2 text-muted-foreground hover:bg-surface-3'
                                    }`}
                                >
                                    {f === 'all' ? 'Бүгд' : f === 'online' ? 'Online' : 'Биеэр'}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-muted-foreground">
                                <thead className="text-xs text-foreground uppercase bg-surface-2/40">
                                    <tr>
                                        <th className="px-4 py-3">Огноо</th>
                                        <th className="px-4 py-3">Эх үүсвэр</th>
                                        <th className="px-4 py-3">Хариулагч</th>
                                        <th className="px-4 py-3">Хариултууд</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr><td colSpan={4} className="text-center py-4">Уншиж байна...</td></tr>
                                    ) : filteredResponses.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-4 text-muted-foreground/70">Өгөгдөл алга байна</td></tr>
                                    ) : (
                                        filteredResponses.map(resp => {
                                            const src = resp.source ?? 'online';
                                            return (
                                                <tr key={resp.id} className="bg-surface border-b">
                                                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap align-top">
                                                        {new Date(resp.created_at).toLocaleString('mn-MN')}
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                src === 'online'
                                                                    ? 'bg-status-info-soft text-status-info'
                                                                    : 'bg-status-pending-soft text-status-pending'
                                                            }`}
                                                        >
                                                            {src === 'online' ? <Globe className="w-3 h-3" /> : <ClipboardList className="w-3 h-3" />}
                                                            {src === 'online' ? 'Online' : 'Биеэр'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-foreground">
                                                        {resp.respondent_name || resp.respondent_phone || '—'}
                                                        {resp.respondent_name && resp.respondent_phone && (
                                                            <div className="text-xs text-muted-foreground/70">{resp.respondent_phone}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <pre className="text-xs bg-surface-2/40 p-2 rounded max-w-md overflow-x-auto whitespace-pre-wrap">
                                                            {JSON.stringify(resp.answers, null, 2)}
                                                        </pre>
                                                        {resp.notes && (
                                                            <p className="mt-1 text-xs text-muted-foreground italic">Тэмдэглэл: {resp.notes}</p>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Offline entry modal */}
            {isOfflineOpen && survey && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-border/60 sticky top-0 bg-surface">
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Биеэр хариулт оруулах</h2>
                                <p className="text-sm text-muted-foreground">{survey.title}</p>
                            </div>
                            <button onClick={() => setIsOfflineOpen(false)} className="p-2 hover:bg-surface-2 rounded-xl">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Хариулагчийн нэр</label>
                                    <input
                                        type="text"
                                        value={offlineMeta.name}
                                        onChange={e => setOfflineMeta(m => ({ ...m, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Утас</label>
                                    <input
                                        type="text"
                                        value={offlineMeta.phone}
                                        onChange={e => setOfflineMeta(m => ({ ...m, phone: e.target.value }))}
                                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                {survey.questions.map(q => (
                                    <div key={q.id}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {q.text}
                                            {q.required && <span className="text-status-danger"> *</span>}
                                        </label>
                                        {renderQuestionInput(q)}
                                    </div>
                                ))}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Тэмдэглэл (заавал биш)</label>
                                <textarea
                                    rows={2}
                                    value={offlineMeta.notes}
                                    onChange={e => setOfflineMeta(m => ({ ...m, notes: e.target.value }))}
                                    placeholder="Жишээ нь: албан байгууллагад очиж асуусан, мини сурвалжлага г.м."
                                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>

                            {offlineError && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-status-danger-soft border border-status-danger/30 rounded-lg text-sm text-status-danger">
                                    <AlertCircle className="w-4 h-4" /> {offlineError}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                                <Button variant="outline" onClick={() => setIsOfflineOpen(false)}>Цуцлах</Button>
                                <Button onClick={submitOffline} disabled={offlineSubmitting}>
                                    {offlineSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Хадгалах
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
