'use client';

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        // Аливаа query алдааг чимээгүй залгилгүйгээр хэрэглэгчид мэдэгдэнэ. `meta.inlineError`
        // query-ийн анхны ачаалалтын алдааг хуудас өөрөө (Alert + «Дахин оролдох») харуулдаг тул
        // давхар toast гаргахгүй; өгөгдөл харагдаж байхад дэвсгэрт шинэчлэл унавал toast гарна.
        queryCache: new QueryCache({
            onError: (error, query) => {
                if (query.meta?.inlineError && query.state.data === undefined) return;
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
