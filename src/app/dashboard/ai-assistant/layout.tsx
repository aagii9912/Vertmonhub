'use client';

export default function AIAssistantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="-m-4 md:-m-6 h-[calc(100dvh-var(--header-h)-4.5rem-env(safe-area-inset-bottom))] overflow-hidden md:h-[calc(100dvh-var(--header-h))]">
            {children}
        </div>
    );
}
