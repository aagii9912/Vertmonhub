'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        logger.error('[Dashboard Error Boundary]', { message: error.message, digest: error.digest });
    }, [error]);

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-status-danger-soft flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-status-danger" />
            </div>
            <div>
                <h2 className="text-xl font-semibold text-foreground">Энэ хуудсыг ачаалж чадсангүй</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                    Мэдээлэл татах явцад алдаа гарлаа. Сүлжээгээ шалгаад дахин оролдоно уу.
                </p>
            </div>
            <button
                onClick={() => reset()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-fg text-sm font-medium hover:bg-brand-strong transition-colors"
            >
                <RefreshCw className="w-4 h-4" />
                Дахин оролдох
            </button>
        </div>
    );
}
