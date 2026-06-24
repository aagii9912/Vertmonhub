'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';

// Нийтийн харилцагчийн анкет — Мандала Гарден "СГЕҮЙ BOOK"-ийн дижитал хувилбар.
// Нэвтрэхгүйгээр POST /api/leads руу илгээнэ.

const PHASES = ['I — Zoo Garden', 'II — Water Garden', 'III — Forest Garden'];
const ROOMS = [
    { label: '1 өрөө', value: 1 },
    { label: '2 өрөө', value: 2 },
    { label: '3 өрөө', value: 3 },
    { label: '4 өрөө', value: 4 },
    { label: 'Үйлчилгээний талбай', value: 0 },
];
const FINANCING = [
    { label: 'Хувь лизинг', value: 'leasing' },
    { label: 'Банкны зээл', value: 'bank_loan' },
    { label: 'Бэлэн төлөлт', value: 'cash' },
    { label: 'Ипотек', value: 'mortgage' },
    { label: 'Бартер', value: 'barter' },
];
const ADVANCE = [0, 10, 30, 50, 100];
const SOURCES = [
    { label: 'Телевиз', value: 'tv' },
    { label: 'Instagram', value: 'instagram' },
    { label: 'Вэбсайт', value: 'website' },
    { label: 'Мессеж', value: 'message' },
    { label: 'Самбар', value: 'board' },
    { label: 'Facebook', value: 'facebook' },
    { label: 'Утас', value: 'phone' },
    { label: 'Танил', value: 'referral' },
];

export default function ContactPage() {
    const [form, setForm] = useState({
        name: '', phone: '', email: '',
        interested_phase: '', preferred_rooms: '' as number | '',
        financing_intent: '', advance_percent: '' as number | '',
        source: '', message: '', website: '', // website = honeypot
    });
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [reply, setReply] = useState('');
    const [errMsg, setErrMsg] = useState('');

    const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim() || !form.phone.trim()) {
            setErrMsg('Нэр болон утсаа оруулна уу.');
            return;
        }
        setStatus('loading');
        setErrMsg('');
        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name.trim(),
                    phone: form.phone.trim(),
                    email: form.email.trim() || null,
                    interested_phase: form.interested_phase || null,
                    preferred_rooms: form.preferred_rooms === '' ? null : Number(form.preferred_rooms),
                    preferred_type: form.preferred_rooms === 0 ? 'commercial' : 'apartment',
                    financing_intent: form.financing_intent || null,
                    advance_percent: form.advance_percent === '' ? null : Number(form.advance_percent),
                    source: form.source || 'website',
                    message: form.message.trim() || null,
                    website: form.website, // honeypot — хоосон байх ёстой
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setReply(data.aiResponse || '');
                setStatus('done');
            } else {
                setErrMsg(data.error || 'Илгээхэд алдаа гарлаа. Дахин оролдоно уу.');
                setStatus('error');
            }
        } catch {
            setErrMsg('Сүлжээний алдаа. Дахин оролдоно уу.');
            setStatus('error');
        }
    }

    if (status === 'done') {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="max-w-md w-full text-center">
                    <div className="w-14 h-14 rounded-full bg-status-success-soft text-status-success flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h1 className="heading-section text-2xl text-foreground mb-2">Баярлалаа, {form.name}!</h1>
                    <p className="text-muted-foreground mb-4">Таны хүсэлтийг хүлээн авлаа. Манай борлуулалтын менежер тантай удахгүй холбогдоно.</p>
                    {reply && (
                        <div className="text-sm text-foreground bg-surface border border-border rounded-xl p-4 text-left whitespace-pre-line">{reply}</div>
                    )}
                </div>
            </div>
        );
    }

    const labelCls = 'block text-sm font-medium text-foreground mb-1.5';
    const inputCls = 'w-full px-3 py-2.5 rounded-md border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand';
    const chip = (active: boolean) =>
        `px-3 py-1.5 rounded-md text-sm border transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-surface border-border text-muted-foreground hover:bg-surface-2'}`;

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="border-b border-border bg-surface/80 backdrop-blur-xl">
                <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-brand-strong" />
                    <span className="font-semibold">Мандала Гарден</span>
                    <span className="text-muted-foreground text-sm ml-auto">Сонирхлын анкет</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 py-10">
                <h1 className="heading-display text-3xl text-foreground mb-1.5">Бидэнтэй холбогдоно уу</h1>
                <p className="text-muted-foreground mb-8">Анкетаа бөглөхөд менежер тань руу холбогдож, тохирох сонголтуудыг танилцуулна.</p>

                <form onSubmit={submit} className="space-y-7">
                    {/* Contact */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Овог, нэр <span className="text-status-danger">*</span></label>
                            <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Бат-Эрдэнэ" />
                        </div>
                        <div>
                            <label className={labelCls}>Утас <span className="text-status-danger">*</span></label>
                            <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="9911-2233" inputMode="tel" />
                        </div>
                        <div>
                            <label className={labelCls}>И-мэйл</label>
                            <input className={inputCls} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" />
                        </div>
                    </div>

                    {/* Phase */}
                    <div>
                        <label className={labelCls}>Сонирхож буй ээлж</label>
                        <div className="flex flex-wrap gap-2">
                            {PHASES.map((p) => (
                                <button type="button" key={p} className={chip(form.interested_phase === p)} onClick={() => set('interested_phase', form.interested_phase === p ? '' : p)}>{p}</button>
                            ))}
                        </div>
                    </div>

                    {/* Rooms */}
                    <div>
                        <label className={labelCls}>Сонирхож буй өрөөний тоо</label>
                        <div className="flex flex-wrap gap-2">
                            {ROOMS.map((r) => (
                                <button type="button" key={r.label} className={chip(form.preferred_rooms === r.value)} onClick={() => set('preferred_rooms', form.preferred_rooms === r.value ? '' : r.value)}>{r.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Financing */}
                    <div>
                        <label className={labelCls}>Төлбөрийн нөхцөл</label>
                        <div className="flex flex-wrap gap-2">
                            {FINANCING.map((f) => (
                                <button type="button" key={f.value} className={chip(form.financing_intent === f.value)} onClick={() => set('financing_intent', form.financing_intent === f.value ? '' : f.value)}>{f.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Advance */}
                    <div>
                        <label className={labelCls}>Урьдчилгаа төлбөрийн хэмжээ</label>
                        <div className="flex flex-wrap gap-2">
                            {ADVANCE.map((a) => (
                                <button type="button" key={a} className={chip(form.advance_percent === a)} onClick={() => set('advance_percent', form.advance_percent === a ? '' : a)}>{a}%</button>
                            ))}
                        </div>
                    </div>

                    {/* Source */}
                    <div>
                        <label className={labelCls}>Мэдээллийг анх хаанаас авсан бэ?</label>
                        <div className="flex flex-wrap gap-2">
                            {SOURCES.map((s) => (
                                <button type="button" key={s.value} className={chip(form.source === s.value)} onClick={() => set('source', form.source === s.value ? '' : s.value)}>{s.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Message */}
                    <div>
                        <label className={labelCls}>Нэмэлт</label>
                        <textarea className={inputCls} rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Нэмэлт хүсэлт, асуулт..." />
                    </div>

                    {/* Honeypot (hidden from users) */}
                    <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} className="hidden" aria-hidden="true" />

                    {errMsg && <p className="text-sm text-status-danger">{errMsg}</p>}

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-md bg-brand text-white font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
                    >
                        {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                        {status === 'loading' ? 'Илгээж байна...' : 'Хүсэлт илгээх'}
                    </button>
                </form>
            </main>
        </div>
    );
}
