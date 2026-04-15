'use client';

import Link from 'next/link';
import { Building2, MessageSquare, BarChart3, Shield, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

const FEATURES = [
    {
        icon: <MessageSquare className="w-6 h-6" />,
        title: 'AI Борлуулагч',
        desc: 'Facebook Messenger-ээр 24/7 автомат хариу өгч, лийд цуглуулна.',
        color: 'from-violet-500 to-purple-600',
    },
    {
        icon: <Building2 className="w-6 h-6" />,
        title: 'Үл хөдлөх удирдлага',
        desc: 'Орон сууц, лийд, үзлэг, гэрээг нэг дороос удирдана.',
        color: 'from-emerald-500 to-teal-600',
    },
    {
        icon: <BarChart3 className="w-6 h-6" />,
        title: 'Борлуулалтын тайлан',
        desc: 'KPI, төлбөрийн хяналт, менежерийн гүйцэтгэл — бодит цагаар.',
        color: 'from-amber-500 to-orange-600',
    },
    {
        icon: <Shield className="w-6 h-6" />,
        title: 'Гэрээний хяналт',
        desc: 'Төлбөрийн хуваарь, хоцрогдол, хүлээлгэн өгөх ажлыг автоматжуулна.',
        color: 'from-sky-500 to-blue-600',
    },
];

const STATS = [
    { value: '10+', label: 'AI Tool' },
    { value: '24/7', label: 'Messenger AI' },
    { value: '100%', label: 'Монгол хэлтэй' },
    { value: '< 3с', label: 'Хариу өгөх хугацаа' },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-lg font-bold tracking-tight">Vertmon Hub</span>
                    </div>
                    <Link
                        href="/auth/login"
                        className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
                    >
                        Нэвтрэх
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative pt-32 pb-20 px-6">
                {/* Glow effects */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute top-40 left-1/3 w-[300px] h-[300px] bg-purple-600/8 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-4xl mx-auto text-center relative">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-6">
                        <Sparkles className="w-3.5 h-3.5" /> Moncon Construction Group
                    </div>

                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                        Үл хөдлөхийн
                        <br />
                        <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-violet-400 bg-clip-text text-transparent">
                            AI Борлуулалтын Платформ
                        </span>
                    </h1>

                    <p className="text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
                        Facebook Messenger-ээр үл хөдлөхийн лавлагаа өгч, лийд цуглуулж, гэрээ хүртэл
                        хянах — бүгдийг нэг системээр.
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <Link
                            href="/auth/login"
                            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2"
                        >
                            Эхлэх <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>

                {/* Stats */}
                <div className="max-w-3xl mx-auto mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {STATS.map((s, i) => (
                        <div key={i} className="text-center p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                                {s.value}
                            </div>
                            <div className="text-xs text-white/40 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
                        Бүрэн <span className="text-violet-400">CRM</span> систем
                    </h2>
                    <p className="text-white/40 text-center mb-14 max-w-lg mx-auto">
                        Борлуулалтын бүх үе шатыг нэг платформоос удирдана
                    </p>

                    <div className="grid sm:grid-cols-2 gap-5">
                        {FEATURES.map((f, i) => (
                            <div
                                key={i}
                                className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all"
                            >
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg shadow-${f.color.split(' ')[0].replace('from-', '')}/20`}>
                                    {f.icon}
                                </div>
                                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                                <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* What you get */}
            <section className="py-20 px-6 border-t border-white/[0.04]">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-center mb-10">Юу хийж чадах вэ?</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {[
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
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                <span className="text-sm text-white/60">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 px-6">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="p-10 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 border border-violet-500/20">
                        <h2 className="text-2xl font-bold mb-3">Эхлэхэд бэлэн үү?</h2>
                        <p className="text-white/40 text-sm mb-6">
                            Монголын анхны үл хөдлөхийн AI борлуулалтын платформ
                        </p>
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold transition-colors"
                        >
                            Нэвтрэх <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] py-8 px-6">
                <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-white/30">
                    <span>© 2026 Vertmon Hub — Moncon Construction Group</span>
                    <span>Бүтээсэн: AI + Хүн</span>
                </div>
            </footer>
        </div>
    );
}
