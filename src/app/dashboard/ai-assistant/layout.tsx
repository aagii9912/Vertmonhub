'use client';

export default function AIAssistantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-var(--header-h))] overflow-hidden">
            {children}
        </div>
    );
}
