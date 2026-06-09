'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/utils/logger';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        logger.error('[Global Error Boundary]', { message: error.message, digest: error.digest });
    }, [error]);

    return (
        <html lang="mn">
            <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 16,
                        padding: 24,
                        textAlign: 'center',
                        background: '#FAFAF7',
                        color: '#1a1a1a',
                    }}
                >
                    <h2 style={{ fontSize: 20, fontWeight: 600 }}>Алдаа гарлаа</h2>
                    <p style={{ fontSize: 14, color: '#666', maxWidth: 420 }}>
                        Уучлаарай, системд гэнэтийн алдаа гарлаа. Дахин оролдоно уу.
                    </p>
                    <button
                        onClick={() => reset()}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#C2613F',
                            color: '#fff',
                            fontSize: 14,
                            cursor: 'pointer',
                        }}
                    >
                        Дахин оролдох
                    </button>
                </div>
            </body>
        </html>
    );
}
