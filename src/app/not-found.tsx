import type { Metadata } from 'next';
import { BrandLogo } from '@/components/auth/BrandLogo';
import { NotFoundPanel } from '@/components/navigation/NotFoundPanel';

export const metadata: Metadata = { title: 'Хуудас олдсонгүй · Vertmon Hub' };

/** Нийтийн 404 — монгол хэлээр, брэндтэй. Ажлын shell доторх 404-ийг dashboard/not-found.tsx харуулна. */
export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            <BrandLogo size="md" variant="stacked" />
            <NotFoundPanel />
        </main>
    );
}
