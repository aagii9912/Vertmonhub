'use client';

import { AppShell } from '@/components/dashboard/AppShell';

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppShell>{children}</AppShell>;
}
