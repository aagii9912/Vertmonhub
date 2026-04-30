'use client';

import Link from 'next/link';
import { Building2, MessageSquare, BarChart3, Shield, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

const FEATURES = [
    {
        icon: <MessageSquare className="w-6 h-6" />,
        title: 'AI Борлуулагч',
        desc: 'Facebook Messenger-ээр 24/7 автомат хариу өгч, лийд цуглуулна.',
        accent: 'bg-brand-soft text-brand-strong',
    },
    {
        icon: <Building2 className="w-6 h-6" />,
        title: 'Үл хөдлөх удирдлага',
        desc: 'Орон сууц, лийд, үзлэг, гэрээг нэг дороос удирдана.',
        accent: 'bg-status-success-soft text-status-success',
    },
    {
        icon: <BarChart3 className="w-6 h-6" />,
        title: 'Борлуулалтын тайлан',
        desc: 'KPI, төлбөрийн хяналт, менежерийн гүйцэтгэл — бодит цагаар.',
        accent: 'bg-status-pending-soft text-status-pending',
    },
    {
        icon: <Shield className="w-6 h-6" />,
        title: 'Гэрээний хяналт',
        desc: 'Төлбөрийн хуваарь, хоцрогдол, хүлээлгэн өгөх ажлыг автоматжуулна.',
        accent: 'bg-status-info-soft text-status-info',
    },
];

const STATS = [
    { value: '10+', label: 'AI Tool' },
    { value: '24/7', label: 'Messenger AI' },
    { value: '100%', label: 'Монгол хэлтэй' },
    { value: '< 3с', label: 'Хариу өгөх хугацаа' },
];

const CAPABILITIES = [
    'Messenger-ээр орон сууц хайх, үнэ мэдэх',
    'Зээлийн тооцоолол автоматаар',
    'Үзлэг товлох, менежерт мэдэгдэл',
    'Лийд автомат үүсгэх',
    'Гэрээний төлбөрийн хяналт',
    'Хоцорсон төлбөрийн сонордуулга',
    'Excel файлаас гэрээ импортлох',
    'Менежерийн борлуулалтын тайлан',
    'Харилцагчийн гомдол бүртгэх',
    'Хүлээлгэн өгөх акт + checklist',
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background text-foreground overflow-hidden">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="heading-display text-lg text-foreground">Vertmon</span>
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">
                                Hub
                            </span>
                        </div>
                    </div>
                    <Link
                        href="/auth/login"
                        className="px-5 py-2 rounded-md bg-brand text-brand-fg hover:bg-brand-strong text-sm font-medium transition-colors"
                    >
                        Нэвтрэх
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto text-center relative">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand/30 bg-brand-soft text-brand-strong text-xs font-medium mb-6">
                        <Sparkles className="w-3.5 h-3.5" /> Moncon Construction Group
                    </div>

                    <h1 className="heading-display text-4xl sm:text-5xl md:text-6xl text-foreground leading-[1.1] mb-6">
                        Үл хөдлөхийн
                        <br />
                        <span className="text-brand">AI Борлуулалтын Платформ</span>
                    </h1>

                    <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
                        Facebook Messenger-ээр үл хөдлөхийн лавлагаа өгч, лийд цуглуулж, гэрээ хүртэл хянах — бүгдийг нэг
                        системээр.
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <Link
                            href="/auth/login"
                            className="px-8 py-3.5 rounded-md bg-foreground text-background hover:bg-fg-2 text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                            Эхлэх <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>

                {/* Stats */}
                <div className="max-w-3xl mx-auto mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {STATS.map((s, i) => (
                        <div key={i} className="text-center p-4 rounded-xl bg-surface border border-border">
                            <div className="heading-display text-2xl text-foreground tabular-nums">{s.value}</div>
                            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <h2 className="heading-display text-2xl sm:text-3xl text-center text-foreground mb-3">
                        Бүрэн <span className="text-brand">CRM</span> систем
                    </h2>
                    <p className="text-muted-foreground text-center mb-14 max-w-lg mx-auto">
                        Борлуулалтын бүх үе шатыг нэг платформоос удирдана
                    </p>

                    <div className="grid sm:grid-cols-2 gap-5">
                        {FEATURES.map((f, i) => (
                            <div
                                key={i}
                                className="group p-6 rounded-xl bg-surface border border-border hover:border-border-strong transition-colors"
                            >
                                <div className={`w-12 h-12 rounded-md ${f.accent} flex items-center justify-center mb-4`}>
                                    {f.icon}
                                </div>
                                <h3 className="heading-section text-lg text-foreground mb-2">{f.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* What you get */}
            <section className="py-20 px-6 border-t border-border">
                <div className="max-w-3xl mx-auto">
                    <h2 className="heading-display text-2xl text-center text-foreground mb-10">Юу хийж чадах вэ?</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {CAPABILITIES.map((item, i) => (
                            <div
                                key={i}
                                className="flex items-start gap-3 p-3 rounded-md hover:bg-surface-2/60 transition-colors"
                            >
                                <CheckCircle2 className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
                                <span className="text-sm text-foreground">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 px-6">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="p-10 rounded-2xl bg-brand-soft border border-brand/20">
                        <h2 className="heading-display text-2xl text-foreground mb-3">Эхлэхэд бэлэн үү?</h2>
                        <p className="text-muted-foreground text-sm mb-6">
                            Монголын анхны үл хөдлөхийн AI борлуулалтын платформ
                        </p>
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md bg-foreground text-background hover:bg-fg-2 text-sm font-semibold transition-colors"
                        >
                            Нэвтрэх <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border py-8 px-6">
                <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span>© 2026 Vertmon Hub — Moncon Construction Group</span>
                    <span>Бүтээсэн: AI + Хүн</span>
                </div>
            </footer>
        </div>
    );
}
