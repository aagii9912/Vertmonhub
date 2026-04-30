import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Data Deletion Status | Vertmon Hub',
    description: 'Vertmon Hub өгөгдөл устгалтын байдал',
};

interface PageProps {
    searchParams: Promise<{ id?: string }>;
}

export default async function DeletionStatusPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const confirmationCode = params.id;

    return (
        <div className="min-h-screen bg-surface dark:bg-surface flex items-center justify-center">
            <div className="mx-auto max-w-lg px-6 py-16 text-center">
                <div className="mb-8">
                    <div className="mx-auto w-16 h-16 bg-status-success-soft dark:bg-status-success-soft rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-status-success dark:text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-foreground  mb-4">
                    Өгөгдөл устгагдлаа
                </h1>

                <p className="text-lg text-muted-foreground dark:text-muted-foreground/70 mb-6">
                    Таны хүсэлтийн дагуу Vertmon Hub дахь таны өгөгдөл устгагдлаа.
                </p>

                {confirmationCode && (
                    <div className="mb-8 p-4 bg-surface-2/40 dark:bg-foreground rounded-lg border border-border dark:border-border">
                        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70 mb-2">
                            Баталгаажуулах код:
                        </p>
                        <p className="font-mono text-sm text-foreground  break-all">
                            {confirmationCode}
                        </p>
                    </div>
                )}

                <div className="space-y-4 text-left bg-status-info-soft dark:bg-status-info-soft p-4 rounded-lg mb-8">
                    <h2 className="font-semibold text-foreground ">
                        Устгагдсан мэдээлэл:
                    </h2>
                    <ul className="text-sm text-muted-foreground dark:text-muted-foreground/70 space-y-2">
                        <li>✓ Чат түүх болон мессежүүд</li>
                        <li>✓ Захиалгын түүх</li>
                        <li>✓ Хэрэглэгчийн профайл мэдээлэл</li>
                        <li>✓ AI-тай харилцсан түүх</li>
                    </ul>
                </div>

                <p className="text-sm text-muted-foreground dark:text-muted-foreground/70 mb-8">
                    Хэрэв танд асуулт байвал{' '}
                    <Link href="/" className="text-status-info hover:text-status-info">
                        Vertmon Hub
                    </Link>
                    -тай холбогдоно уу.
                </p>

                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-white hover:bg-fg-2 transition-colors"
                >
                    Нүүр хуудас руу буцах
                </Link>
            </div>
        </div>
    );
}
