'use client';

import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Zap, ClipboardList, Clock } from 'lucide-react';

// Нийтийн харилцагчийн анкет — Мандала Гарден "СГЕҮЙ BOOK"-ийн дижитал хувилбар.
// Нэвтрэхгүйгээр POST /api/leads руу илгээнэ.
//
// Хоёр горимтой:
//   • Бүрэн анкет — харилцагч өөрөө бөглөх дэлгэрэнгүй хувилбар
//   • Түргэн бүртгэл — борлуулалтын менежер таблет дээр газар дээр нь
//     нэр + утас + эх үүсвэрийг том товчлууртай, дараалан бүртгэх хувилбар.
//     Менежер dashboard-д нэвтэрсэн байвал rate limit-гүй бөгөөд лидэд
//     менежерийн нэр автоматаар тэмдэглэгдэнэ.

const QUICK_KEY = 'vertmon_contact_quick';

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
// Стандарт эх үүсвэрүүд — dashboard-ын шүүлтүүр/тайлантай ижил утгууд
const SOURCES = [
    { label: 'Facebook', value: 'facebook' },
    { label: 'Instagram', value: 'instagram' },
    { label: 'Телевиз', value: 'tv' },
    { label: 'Уулзалт', value: 'meeting' },
    { label: 'Өдөрлөг', value: 'event' },
    { label: 'Вэбсайт', value: 'website' },
    { label: 'Мессенжер', value: 'messenger' },
    { label: 'Самбар', value: 'board' },
    { label: 'Утас', value: 'phone' },
    { label: 'Танил', value: 'referral' },
];

const EMPTY_FORM = {
    name: '', phone: '', email: '',
    interested_phase: '', preferred_rooms: '' as number | '',
    financing_intent: '', advance_percent: '' as number | '',
    source: '', message: '', website: '', // website = honeypot
};

export default function ContactPage() {
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [quick, setQuick] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [reply, setReply] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const [registeredAt, setRegisteredAt] = useState<string | null>(null);

    // ?quick=1 эсвэл өмнө нь сонгосон горимыг сэргээнэ (таблет дээр тогтмол үлдэнэ)
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const fromUrl = params.get('quick') === '1';
            const fromStorage = localStorage.getItem(QUICK_KEY) === '1';
            if (fromUrl || fromStorage) {
                setQuick(true);
                setForm((p) => ({ ...p, source: p.source || 'meeting' }));
                if (fromUrl) localStorage.setItem(QUICK_KEY, '1');
            }
        } catch {
            /* localStorage хаагдсан орчинд алгасна */
        }
    }, []);

    const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

    function toggleQuick() {
        setQuick((q) => {
            const next = !q;
            try {
                localStorage.setItem(QUICK_KEY, next ? '1' : '0');
            } catch { /* ignore */ }
            if (next) setForm((p) => ({ ...p, source: p.source || 'meeting' }));
            return next;
        });
    }

    /** Түргэн горимд дараагийн харилцагчийг шууд бүртгэхэд формыг цэвэрлэнэ
     *  (эх үүсвэрийг хадгална — нэг өдөрлөг/уулзалт дээр дараалан бүртгэдэг). */
    function registerNext() {
        setForm((p) => ({ ...EMPTY_FORM, source: p.source }));
        setReply('');
        setRegisteredAt(null);
        setErrMsg('');
        setStatus('idle');
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim() || !form.phone.trim()) {
            setErrMsg('Нэр болон утсаа оруулна уу.');
            return;
        }
        setStatus('loading');
        setErrMsg('');
        try {
            const payload = quick
                ? {
                    // Түргэн бүртгэл — зөвхөн гол талбарууд
                    name: form.name.trim(),
                    phone: form.phone.trim(),
                    email: null,
                    source: form.source || 'meeting',
                    website: form.website,
                }
                : {
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
                };

            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // нэвтэрсэн менежерийн session-ийг дамжуулна
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setReply(data.aiResponse || '');
                setRegisteredAt(data.data?.created_at || new Date().toISOString());
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

    const timeStr = registeredAt
        ? new Date(registeredAt).toLocaleString('mn-MN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        })
        : '';

    if (status === 'done') {
        const sourceLabel = SOURCES.find((s) => s.value === form.source)?.label;
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="max-w-md w-full text-center">
                    <div className="w-14 h-14 rounded-full bg-status-success-soft text-status-success flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h1 className="heading-section text-2xl text-foreground mb-2">
                        {quick ? 'Бүртгэгдлээ!' : `Баярлалаа, ${form.name}!`}
                    </h1>
                    {quick ? (
                        <div className="text-sm text-foreground bg-surface border border-border rounded-xl p-4 mb-5 space-y-1 text-left">
                            <p><span className="text-muted-foreground">Нэр:</span> <span className="font-medium">{form.name}</span></p>
                            <p><span className="text-muted-foreground">Утас:</span> <span className="font-medium tabular-nums">{form.phone}</span></p>
                            {sourceLabel && <p><span className="text-muted-foreground">Эх үүсвэр:</span> {sourceLabel}</p>}
                            {timeStr && (
                                <p className="flex items-center gap-1.5 text-muted-foreground pt-1">
                                    <Clock className="w-3.5 h-3.5" /> Бүртгэсэн: {timeStr}
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="text-muted-foreground mb-2">Таны хүсэлтийг хүлээн авлаа. Манай борлуулалтын менежер тантай удахгүй холбогдоно.</p>
                            {timeStr && (
                                <p className="text-xs text-muted-foreground/80 mb-4 flex items-center justify-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Бүртгэсэн огноо: {timeStr}
                                </p>
                            )}
                        </>
                    )}
                    {reply && !quick && (
                        <div className="text-sm text-foreground bg-surface border border-border rounded-xl p-4 text-left whitespace-pre-line">{reply}</div>
                    )}
                    {quick && (
                        <button
                            onClick={registerNext}
                            className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-md bg-brand text-white text-lg font-medium hover:opacity-90 transition-opacity"
                        >
                            <Zap className="w-5 h-5" />
                            Дараагийн харилцагч бүртгэх
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const labelCls = 'block text-sm font-medium text-foreground mb-1.5';
    const inputCls = 'w-full px-3 py-2.5 rounded-md border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand';
    // Таблетад ээлтэй томруулсан хувилбарууд (түргэн горим)
    const bigInputCls = 'w-full px-4 py-4 text-lg rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand';
    const chip = (active: boolean) =>
        `px-3 py-1.5 rounded-md text-sm border transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-surface border-border text-muted-foreground hover:bg-surface-2'}`;
    const bigChip = (active: boolean) =>
        `px-4 py-3 rounded-lg text-base border transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-surface border-border text-muted-foreground hover:bg-surface-2'}`;

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="border-b border-border bg-surface/80 backdrop-blur-xl">
                <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-brand-strong" />
                    <span className="font-semibold">Мандала Гарден</span>
                    <button
                        type="button"
                        onClick={toggleQuick}
                        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-surface text-muted-foreground hover:bg-surface-2 transition-colors"
                        title={quick ? 'Бүрэн анкет руу шилжих' : 'Менежерийн түргэн бүртгэл рүү шилжих'}
                    >
                        {quick ? <ClipboardList className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                        {quick ? 'Бүрэн анкет' : 'Түргэн бүртгэл'}
                    </button>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 py-10">
                {quick ? (
                    <>
                        <h1 className="heading-display text-3xl text-foreground mb-1.5">Түргэн бүртгэл</h1>
                        <p className="text-muted-foreground mb-8">
                            Харилцагчийн нэр, утсыг газар дээр нь бүртгэнэ. Бүртгэсэн цаг автоматаар хадгалагдана.
                        </p>

                        <form onSubmit={submit} className="space-y-7">
                            <div>
                                <label className={labelCls}>Овог, нэр <span className="text-status-danger">*</span></label>
                                <input className={bigInputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Бат-Эрдэнэ" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>Утас <span className="text-status-danger">*</span></label>
                                <input className={bigInputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="9911-2233" inputMode="tel" />
                            </div>
                            <div>
                                <label className={labelCls}>Эх үүсвэр</label>
                                <div className="flex flex-wrap gap-2">
                                    {SOURCES.map((s) => (
                                        <button type="button" key={s.value} className={bigChip(form.source === s.value)} onClick={() => set('source', s.value)}>{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Honeypot (hidden from users) */}
                            <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} className="hidden" aria-hidden="true" />

                            {errMsg && <p className="text-sm text-status-danger">{errMsg}</p>}

                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg bg-brand text-white text-lg font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
                            >
                                {status === 'loading' && <Loader2 className="w-5 h-5 animate-spin" />}
                                {status === 'loading' ? 'Бүртгэж байна...' : 'Бүртгэх'}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
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
                    </>
                )}
            </main>
        </div>
    );
}
