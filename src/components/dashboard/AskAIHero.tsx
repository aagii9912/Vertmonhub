'use client';

/**
 * Dashboard нүүрэн дээрх AI Orchestrator launcher (hero).
 * Асуултыг /dashboard/ai-assistant?q=... руу аваачиж, assistant автоматаар хариулна.
 * Зөвхөн ai-assistant модулийн эрхтэй хэрэглэгчид харагдана (Sidebar-тай ижил gating).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';
import { Sparkles, ArrowRight, BarChart3, Home, FileSignature, Megaphone } from 'lucide-react';

const CHIPS: { icon: React.ElementType; label: string; prompt: string }[] = [
    { icon: BarChart3, label: 'Энэ сарын дүр зураг', prompt: 'Энэ сарын борлуулалт ба шинэ лийдийн дүр зураг' },
    { icon: Home, label: 'Боломжтой байрууд', prompt: 'Боломжтой байруудыг жагсааж харуул' },
    { icon: FileSignature, label: 'Хугацаа хэтэрсэн гэрээ', prompt: 'Хугацаа хэтэрсэн гэрээнүүдийг харуул' },
    { icon: Megaphone, label: 'Маркетинг төлөвлөгөө', prompt: 'Энэ улирлын маркетинг төлөвлөгөө гаргаж өгөөч' },
];

export function AskAIHero() {
    const router = useRouter();
    const { user } = useAuth();
    const [q, setQ] = useState('');

    // Sidebar-тай ижил RBAC шалгалт — эрхгүй бол огт харуулахгүй
    const role = user?.role || 'viewer';
    const canUseAI = user?.permissions
        ? canAccessModuleDynamic(user.permissions, 'ai-assistant')
        : canAccessModule(role, 'ai-assistant');
    if (!canUseAI) return null;

    const go = (prompt: string) => {
        const text = prompt.trim();
        router.push(text ? `/dashboard/ai-assistant?q=${encodeURIComponent(text)}` : '/dashboard/ai-assistant');
    };

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-strong p-5 md:p-6 shadow-sm">
            <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-white font-bold text-base md:text-lg leading-tight">AI Orchestrator-оос асууя</h2>
                        <p className="text-white/80 text-xs">Ажлаа байгалийн хэлээр асууж эхлүүлээрэй — дата, тайлан, үйлдэл</p>
                    </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="flex items-center gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Жишээ: Энэ сарын борлуулалт ямар байна?"
                        aria-label="AI-аас асуух"
                        className="flex-1 min-w-0 rounded-xl bg-white/95 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-white/60"
                    />
                    <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 md:px-4 py-2.5 text-sm font-semibold text-brand-strong hover:bg-white/90 transition flex-shrink-0"
                    >
                        Асуух <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                <div className="mt-3 flex flex-wrap gap-2">
                    {CHIPS.map((c) => (
                        <button
                            key={c.label}
                            onClick={() => go(c.prompt)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-medium text-white transition"
                        >
                            <c.icon className="w-3.5 h-3.5" /> {c.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
