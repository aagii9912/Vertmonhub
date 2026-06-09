'use client';

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        // Аливаа query алдааг чимээгүй залгилгүйгээр хэрэглэгчид мэдэгдэнэ
        queryCache: new QueryCache({
            onError: (error) => {
                toast.error(error instanceof Error ? error.message : 'Мэдээлэл ачаалахад алдаа гарлаа');
            },
        }),
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000, // 1 minute
                retry: 1,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
