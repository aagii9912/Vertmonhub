'use client';

import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { SERVICE_LOG_TYPE_META, type ServiceLogType } from '@/lib/service-logs/labels';

/** Харилцагчийн дэлгэрэнгүйгээс санал гомдол бүртгэх маягтын төлөв. */
export interface ServiceLogFormState {
    type: ServiceLogType;
    subject: string;
    description: string;
    /** Хоосон = сервер автоматаар (холбосон гэрээний / бүртгэсэн менежер). */
    manager_name: string;
}

export const EMPTY_SERVICE_LOG_FORM: ServiceLogFormState = { type: 'complaint', subject: '', description: '', manager_name: '' };

const QUICK_TYPES: ServiceLogType[] = ['complaint', 'suggestion', 'inquiry', 'other'];

interface ServiceLogFormProps {
    logForm: ServiceLogFormState;
    setLogForm: React.Dispatch<React.SetStateAction<ServiceLogFormState>>;
    logSubmitting: boolean;
    logError: string | null;
    onSubmit: () => void;
}

export function ServiceLogForm({
    logForm,
    setLogForm,
    logSubmitting,
    logError,
    onSubmit,
}: ServiceLogFormProps) {
    // Хариуцагч = борлуулалтын менежерийн бүртгэл (санал гомдлын хуудастай ижил кэш).
    const managersQuery = useDashboardQuery<{ managers?: Array<{ name: string }> }>(['service-logs', 'managers'], '/api/dashboard/managers', { staleTime: 300_000 });
    const managers = managersQuery.data?.managers ?? [];

    return (
        <div className="bg-surface-2/40 border border-border rounded-md p-3 space-y-2 mb-3">
            <div className="flex flex-wrap gap-2">
                {QUICK_TYPES.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setLogForm((f) => ({ ...f, type: t }))}
                        aria-pressed={logForm.type === t}
                        className={cn(
                            'px-3 py-1 rounded-md text-xs font-medium transition-colors border focus-ring',
                            logForm.type === t
                                ? 'bg-brand text-brand-fg border-brand'
                                : 'bg-surface text-muted-foreground border-border hover:bg-surface-2',
                        )}
                    >
                        {SERVICE_LOG_TYPE_META[t].label}
                    </button>
                ))}
            </div>
            <input
                type="text"
                value={logForm.subject}
                onChange={(e) => setLogForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Гарчиг (заавал)"
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
            />
            <textarea
                value={logForm.description}
                onChange={(e) => setLogForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Дэлгэрэнгүй текст (хүсэлт / гомдол / бичгийн агуулга)"
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
            />
            <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Хариуцагч менежер
                <select
                    aria-label="Хариуцагч менежер"
                    value={logForm.manager_name}
                    onChange={(e) => setLogForm((f) => ({ ...f, manager_name: e.target.value }))}
                    className="h-8 min-w-48 rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-ring"
                >
                    <option value="">Автоматаар (гэрээний / бүртгэсэн менежер)</option>
                    {managers.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                {managersQuery.error && (
                    <button type="button" onClick={() => void managersQuery.refetch()} disabled={managersQuery.isFetching} className="underline">
                        Менежерийн жагсаалтыг дахин татах
                    </button>
                )}
            </label>
            {logError && (
                <p className="flex items-center gap-1 text-xs text-status-danger">
                    <AlertCircle className="w-3 h-3" /> {logError}
                </p>
            )}
            <Button
                type="button"
                onClick={onSubmit}
                disabled={logSubmitting || !logForm.subject.trim()}
                isLoading={logSubmitting}
                variant="primary"
                size="sm"
            >
                {!logSubmitting && <Plus className="w-4 h-4" />}
                Бүртгэх
            </Button>
        </div>
    );
}
