import { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, SearchX, type LucideIcon } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { deletionRequestStatus, type DeletionRequestStatus } from '@/lib/facebook/data-deletion';

export const metadata: Metadata = {
    title: 'Өгөгдөл устгах хүсэлтийн төлөв | Vertmon Hub',
    description: 'Vertmon Hub өгөгдөл устгах хүсэлтийн төлөв',
    robots: { index: false, follow: false },
};

interface PageProps {
    searchParams: Promise<{ id?: string | string[] }>;
}

const STATES: Record<DeletionRequestStatus, { label: string; title: string; body: string; icon: LucideIcon; tone: string }> = {
    completed: {
        label: 'Устгасан',
        title: 'Өгөгдөл устгагдсан',
        body: 'Таны хүсэлтийн дагуу Facebook, Instagram-аар бидэнтэй харилцсан мэдээллийг Vertmon Hub-аас устгасан.',
        icon: Check,
        tone: 'bg-status-success-soft text-status-success',
    },
    pending: {
        label: 'Хүлээн авсан',
        title: 'Хүсэлтийг хүлээн авлаа',
        body: 'Таны өгөгдөл устгах хүсэлтийг хүлээн авсан бөгөөд устгал хараахан дуусаагүй байна.',
        icon: Clock,
        tone: 'bg-status-pending-soft text-status-pending',
    },
    not_found: {
        label: 'Олдсонгүй',
        title: 'Хүсэлт олдсонгүй',
        body: 'Энэ баталгаажуулах кодтой өгөгдөл устгах хүсэлт бүртгэгдээгүй байна. Facebook-оос ирсэн холбоосыг бүтнээр нь нээнэ үү.',
        icon: SearchX,
        tone: 'bg-status-neutral-soft text-status-neutral',
    },
    unavailable: {
        label: 'Тодорхойгүй',
        title: 'Төлөвийг шалгаж чадсангүй',
        body: 'Түр алдаа гарлаа. Хэсэг хугацааны дараа дахин оролдоно уу.',
        icon: AlertTriangle,
        tone: 'bg-status-pending-soft text-status-pending',
    },
};

async function loadStatus(code: string): Promise<DeletionRequestStatus> {
    try {
        return await deletionRequestStatus(supabaseAdmin(), code);
    } catch {
        return 'unavailable';
    }
}

export default async function DeletionStatusPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const confirmationCode = (typeof params.id === 'string' ? params.id : params.id?.[0] ?? '').trim();
    const status = await loadStatus(confirmationCode);
    const state = STATES[status];
    const Icon = state.icon;

    return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
            <div className="mx-auto max-w-lg px-6 py-16 text-center">
                <div className="mb-8">
                    <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${state.tone}`}>
                        <Icon className="w-8 h-8" aria-hidden="true" />
                    </div>
                </div>

                <p className="text-sm font-medium text-muted-foreground mb-2">
                    Төлөв: <span className="text-foreground">{state.label}</span>
                </p>

                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4">
                    {state.title}
                </h1>

                <p className="text-lg text-muted-foreground mb-6">
                    {state.body}
                </p>

                {confirmationCode && (
                    <div className="mb-8 p-4 bg-surface-2/40 rounded-lg border border-border">
                        <p className="text-sm text-muted-foreground mb-2">
                            Баталгаажуулах код:
                        </p>
                        <p className="font-mono text-sm text-foreground break-all">
                            {confirmationCode}
                        </p>
                    </div>
                )}

                <div className="space-y-4 text-left bg-status-info-soft p-4 rounded-lg mb-8">
                    <h2 className="font-semibold text-foreground">
                        Устгалд хамрагдах мэдээлэл:
                    </h2>
                    <ul className="text-sm text-muted-foreground space-y-2">
                        <li>• Facebook Messenger, Instagram-аар бидэнд бичсэн мессежүүд</li>
                        <li>• Холбоо барих мэдээлэл (нэр, утас, имэйл зэрэг харилцагчийн бүртгэл)</li>
                    </ul>
                </div>

                <p className="text-sm text-muted-foreground mb-8">
                    Хэрэв танд асуулт байвал{' '}
                    <Link href="/" className="text-status-info hover:text-status-info">
                        Vertmon Hub
                    </Link>
                    -тай холбогдоно уу.
                </p>

                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background hover:bg-fg-2 transition-colors"
                >
                    Нүүр хуудас руу буцах
                </Link>
            </div>
        </div>
    );
}
