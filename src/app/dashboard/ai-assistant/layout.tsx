'use client';

export default function AIAssistantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="-m-8 h-[calc(100dvh-var(--header-h))] overflow-hidden">
            {children}
        </div>
    );
}
