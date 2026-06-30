'use client';

import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type ServiceLogType = 'inquiry' | 'complaint' | 'maintenance' | 'handover' | 'payment' | 'other';

const SERVICE_LOG_TYPE_LABELS: Record<ServiceLogType, string> = {
    inquiry: 'Хүсэлт',
    complaint: 'Гомдол',
    maintenance: 'Засвар',
    handover: 'Хүлээлгэн өгөлт',
    payment: 'Төлбөр',
    other: 'Бичиг / Бусад',
};

interface ServiceLogFormProps {
    logForm: { type: ServiceLogType; subject: string; description: string };
    setLogForm: React.Dispatch<React.SetStateAction<{ type: ServiceLogType; subject: string; description: string }>>;
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
    return (
        <div className="bg-surface-2/40 border border-border rounded-md p-3 space-y-2 mb-3">
            <div className="flex flex-wrap gap-2">
                {(['complaint', 'inquiry', 'other'] as ServiceLogType[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setLogForm((f) => ({ ...f, type: t }))}
                        className={cn(
                            'px-3 py-1 rounded-md text-xs font-medium transition-colors border',
                            logForm.type === t
                                ? 'bg-brand text-brand-fg border-brand'
                                : 'bg-surface text-muted-foreground border-border hover:bg-surface-2',
                        )}
                    >
                        {SERVICE_LOG_TYPE_LABELS[t]}
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
