'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Save,
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    GripVertical,
    Loader2,
    CheckCircle2,
    AlertCircle,
    RotateCcw,
    Globe,
    Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LandingContent } from '@/lib/landing/types';
import { defaultLandingContent } from '@/lib/landing/defaults';

// ─── Section Panel ───
function SectionPanel({
    title,
    description,
    children,
    onSave,
    saving,
    dirty,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
    onSave: () => void;
    saving: boolean;
    dirty: boolean;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm mb-4 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-6 py-5 hover:bg-gray-50/50 transition-colors"
            >
                {open ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <div className="flex-1 text-left">
                    <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{description}</p>
                </div>
                {dirty && (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-2.5 py-1 rounded-full">
                        Өөрчлөгдсөн
                    </span>
                )}
            </button>

            {open && (
                <div className="border-t border-gray-100 px-6 py-6 space-y-5">
                    {children}
                    <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-gray-100">
                        <button
                            onClick={onSave}
                            disabled={saving || !dirty}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold shadow-sm shadow-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-700 transition-all"
                        >
                            {saving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5" />
                            )}
                            Хадгалах
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Input Field ───
function Field({
    label,
    value,
    onChange,
    multiline,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    multiline?: boolean;
    placeholder?: string;
}) {
    const cls =
        'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all';

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
            {multiline ? (
                <textarea
                    className={cls + ' min-h-[100px] resize-y'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            ) : (
                <input
                    type="text"
                    className={cls}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            )}
        </div>
    );
}

// ─── Main Page ───
export default function LandingCMSPage() {
    const [content, setContent] = useState<LandingContent>(defaultLandingContent);
    const [original, setOriginal] = useState<LandingContent>(defaultLandingContent);
    const [loading, setLoading] = useState(true);
    const [savingSection, setSavingSection] = useState<string | null>(null);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    // Load content
    useEffect(() => {
        fetch('/api/dashboard/landing-content')
            .then((r) => r.json())
            .then((data) => {
                setContent(data);
                setOriginal(data);
            })
            .catch(() => toast.error('Контент ачааллахад алдаа гарлаа'))
            .finally(() => setLoading(false));
    }, []);

    const isDirty = useCallback(
        (section: keyof LandingContent) => {
            return JSON.stringify(content[section]) !== JSON.stringify(original[section]);
        },
        [content, original]
    );

    const saveSection = async (section: keyof LandingContent) => {
        setSavingSection(section);
        try {
            const res = await fetch('/api/dashboard/landing-content', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section, data: content[section] }),
            });
            if (!res.ok) throw new Error('Failed');
            setOriginal((prev) => ({ ...prev, [section]: content[section] }));
            setLastSaved(section);
            toast.success(`${section} хадгалагдлаа`);
            setTimeout(() => setLastSaved(null), 2000);
        } catch {
            toast.error('Хадгалахад алдаа гарлаа');
        } finally {
            setSavingSection(null);
        }
    };

    const updateContent = <K extends keyof LandingContent>(section: K, value: LandingContent[K]) => {
        setContent((prev) => ({ ...prev, [section]: value }));
    };

    const resetSection = (section: keyof LandingContent) => {
        setContent((prev) => ({ ...prev, [section]: defaultLandingContent[section] }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center p-3">
                            <Globe className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Landing Page</h1>
                            <p className="text-sm text-gray-500 mt-0.5">Контент удирдлага</p>
                        </div>
                    </div>
                </div>
                <a
                    href="/"
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm bg-white"
                >
                    <Globe className="w-3.5 h-3.5" />
                    Үзэх
                </a>
            </div>

            {/* ═══ HERO ═══ */}
            <SectionPanel
                title="Hero"
                description="Нүүр хуудасны гол хэсэг — гарчиг, тайлбар, товч"
                onSave={() => saveSection('hero')}
                saving={savingSection === 'hero'}
                dirty={isDirty('hero')}
            >
                <Field
                    label="Badge текст"
                    value={content.hero.badge}
                    onChange={(v) => updateContent('hero', { ...content.hero, badge: v })}
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Гарчиг — 1-р мөр"
                        value={content.hero.headingLine1}
                        onChange={(v) => updateContent('hero', { ...content.hero, headingLine1: v })}
                    />
                    <Field
                        label="Гарчиг — Тодруулсан"
                        value={content.hero.headingHighlight}
                        onChange={(v) => updateContent('hero', { ...content.hero, headingHighlight: v })}
                    />
                </div>
                <Field
                    label="Тайлбар текст"
                    value={content.hero.sub}
                    onChange={(v) => updateContent('hero', { ...content.hero, sub: v })}
                    multiline
                />
                <Field
                    label="CTA товчны текст"
                    value={content.hero.ctaText}
                    onChange={(v) => updateContent('hero', { ...content.hero, ctaText: v })}
                />
            </SectionPanel>

            {/* ═══ METRICS ═══ */}
            <SectionPanel
                title="Тоон үзүүлэлт"
                description="Hero-ийн доорх 4 статистик тоо"
                onSave={() => saveSection('metrics')}
                saving={savingSection === 'metrics'}
                dirty={isDirty('metrics')}
            >
                {content.metrics.map((m, i) => (
                    <div key={i} className="flex items-end gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex-1">
                            <Field
                                label={`#${i + 1} Утга`}
                                value={m.value}
                                onChange={(v) => {
                                    const updated = [...content.metrics];
                                    updated[i] = { ...updated[i], value: v };
                                    updateContent('metrics', updated);
                                }}
                            />
                        </div>
                        <div className="flex-1">
                            <Field
                                label="Нэр"
                                value={m.label}
                                onChange={(v) => {
                                    const updated = [...content.metrics];
                                    updated[i] = { ...updated[i], label: v };
                                    updateContent('metrics', updated);
                                }}
                            />
                        </div>
                        <button
                            onClick={() => {
                                const updated = content.metrics.filter((_, idx) => idx !== i);
                                updateContent('metrics', updated);
                            }}
                            className="p-2.5 text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-lg p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => updateContent('metrics', [...content.metrics, { value: '', label: '' }])}
                    className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-indigo-300 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" /> Нэмэх
                </button>
            </SectionPanel>

            {/* ═══ FEATURES ═══ */}
            <SectionPanel
                title="Боломжууд"
                description="Platform-ийн үндсэн боломжуудын жагсаалт"
                onSave={() => saveSection('features')}
                saving={savingSection === 'features'}
                dirty={isDirty('features')}
            >
                <Field
                    label="Секцийн нэр"
                    value={content.features.sectionLabel}
                    onChange={(v) => updateContent('features', { ...content.features, sectionLabel: v })}
                />
                <Field
                    label="Гарчиг"
                    value={content.features.sectionTitle}
                    onChange={(v) => updateContent('features', { ...content.features, sectionTitle: v })}
                />
                <Field
                    label="Тайлбар"
                    value={content.features.sectionDesc}
                    onChange={(v) => updateContent('features', { ...content.features, sectionDesc: v })}
                    multiline
                />

                <div className="space-y-3 mt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Боломжуудын жагсаалт</p>
                    {content.features.items.map((item, i) => (
                        <div key={i} className="p-5 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">#{i + 1}</span>
                                <button
                                    onClick={() => {
                                        const updated = { ...content.features, items: content.features.items.filter((_, idx) => idx !== i) };
                                        updateContent('features', updated);
                                    }}
                                    className="text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-lg p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <Field
                                label="Нэр"
                                value={item.title}
                                onChange={(v) => {
                                    const items = [...content.features.items];
                                    items[i] = { ...items[i], title: v };
                                    updateContent('features', { ...content.features, items });
                                }}
                            />
                            <Field
                                label="Тайлбар"
                                value={item.desc}
                                onChange={(v) => {
                                    const items = [...content.features.items];
                                    items[i] = { ...items[i], desc: v };
                                    updateContent('features', { ...content.features, items });
                                }}
                                multiline
                            />
                        </div>
                    ))}
                    <button
                        onClick={() => {
                            updateContent('features', {
                                ...content.features,
                                items: [...content.features.items, { title: '', desc: '' }],
                            });
                        }}
                        className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-indigo-300 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Боломж нэмэх
                    </button>
                </div>
            </SectionPanel>

            {/* ═══ HOW IT WORKS ═══ */}
            <SectionPanel
                title="Хэрхэн ажиллах"
                description="3 алхамт зааварчилгаа"
                onSave={() => saveSection('how_it_works')}
                saving={savingSection === 'how_it_works'}
                dirty={isDirty('how_it_works')}
            >
                <Field
                    label="Секцийн нэр"
                    value={content.how_it_works.sectionLabel}
                    onChange={(v) => updateContent('how_it_works', { ...content.how_it_works, sectionLabel: v })}
                />
                <Field
                    label="Гарчиг"
                    value={content.how_it_works.sectionTitle}
                    onChange={(v) => updateContent('how_it_works', { ...content.how_it_works, sectionTitle: v })}
                />
                {content.how_it_works.items.map((item, i) => (
                    <div key={i} className="p-5 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-violet-600">Алхам {item.step}</span>
                        </div>
                        <Field
                            label="Гарчиг"
                            value={item.title}
                            onChange={(v) => {
                                const items = [...content.how_it_works.items];
                                items[i] = { ...items[i], title: v };
                                updateContent('how_it_works', { ...content.how_it_works, items });
                            }}
                        />
                        <Field
                            label="Тайлбар"
                            value={item.desc}
                            onChange={(v) => {
                                const items = [...content.how_it_works.items];
                                items[i] = { ...items[i], desc: v };
                                updateContent('how_it_works', { ...content.how_it_works, items });
                            }}
                            multiline
                        />
                    </div>
                ))}
            </SectionPanel>

            {/* ═══ SOCIAL PROOF ═══ */}
            <SectionPanel
                title="Тоон харьцуулалт"
                description="Цаг хэмнэлт, орлого өсөлт, бүтээмж нэмэлт"
                onSave={() => saveSection('social_proof')}
                saving={savingSection === 'social_proof'}
                dirty={isDirty('social_proof')}
            >
                <Field
                    label="Секцийн нэр"
                    value={content.social_proof.sectionLabel}
                    onChange={(v) => updateContent('social_proof', { ...content.social_proof, sectionLabel: v })}
                />
                <Field
                    label="Гарчиг"
                    value={content.social_proof.sectionTitle}
                    onChange={(v) => updateContent('social_proof', { ...content.social_proof, sectionTitle: v })}
                />
                {content.social_proof.items.map((item, i) => (
                    <div key={i} className="p-5 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                            <Field
                                label="Категори"
                                value={item.category}
                                onChange={(v) => {
                                    const items = [...content.social_proof.items];
                                    items[i] = { ...items[i], category: v };
                                    updateContent('social_proof', { ...content.social_proof, items });
                                }}
                            />
                            <Field
                                label="Үр дүн"
                                value={item.result}
                                onChange={(v) => {
                                    const items = [...content.social_proof.items];
                                    items[i] = { ...items[i], result: v };
                                    updateContent('social_proof', { ...content.social_proof, items });
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field
                                label="Тоо"
                                value={item.stat}
                                onChange={(v) => {
                                    const items = [...content.social_proof.items];
                                    items[i] = { ...items[i], stat: v };
                                    updateContent('social_proof', { ...content.social_proof, items });
                                }}
                            />
                            <Field
                                label="Нэгж"
                                value={item.statSuffix}
                                onChange={(v) => {
                                    const items = [...content.social_proof.items];
                                    items[i] = { ...items[i], statSuffix: v };
                                    updateContent('social_proof', { ...content.social_proof, items });
                                }}
                            />
                        </div>
                    </div>
                ))}
            </SectionPanel>

            {/* ═══ PRICING ═══ */}
            <SectionPanel
                title="Үнийн санал"
                description="Starter, Pro, Enterprise төлөвлөгөө"
                onSave={() => saveSection('pricing')}
                saving={savingSection === 'pricing'}
                dirty={isDirty('pricing')}
            >
                <Field
                    label="Секцийн нэр"
                    value={content.pricing.sectionLabel}
                    onChange={(v) => updateContent('pricing', { ...content.pricing, sectionLabel: v })}
                />
                <Field
                    label="Гарчиг"
                    value={content.pricing.sectionTitle}
                    onChange={(v) => updateContent('pricing', { ...content.pricing, sectionTitle: v })}
                />

                {/* Starter */}
                {(['starter', 'pro', 'enterprise'] as const).map((plan) => (
                    <div key={plan} className="p-5 rounded-xl border border-gray-100 bg-gray-50 space-y-2 mt-3">
                        <p className="text-sm font-bold text-gray-900 capitalize mb-2 block">{content.pricing[plan].label}</p>
                        <Field
                            label="Тайлбар"
                            value={content.pricing[plan].desc}
                            onChange={(v) => updateContent('pricing', {
                                ...content.pricing,
                                [plan]: { ...content.pricing[plan], desc: v },
                            })}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <Field
                                label="Сарын үнэ"
                                value={content.pricing[plan].monthly.price}
                                onChange={(v) => updateContent('pricing', {
                                    ...content.pricing,
                                    [plan]: { ...content.pricing[plan], monthly: { ...content.pricing[plan].monthly, price: v } },
                                })}
                            />
                            <Field
                                label="Жилийн үнэ"
                                value={content.pricing[plan].yearly.price}
                                onChange={(v) => updateContent('pricing', {
                                    ...content.pricing,
                                    [plan]: { ...content.pricing[plan], yearly: { ...content.pricing[plan].yearly, price: v } },
                                })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Боломжууд (мөр бүр нэг)</label>
                            <textarea
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 min-h-[100px] resize-y transition-all"
                                value={content.pricing[plan].features.join('\n')}
                                onChange={(e) => updateContent('pricing', {
                                    ...content.pricing,
                                    [plan]: { ...content.pricing[plan], features: e.target.value.split('\n') },
                                })}
                            />
                        </div>
                    </div>
                ))}
            </SectionPanel>

            {/* ═══ COMPARISON TABLE ═══ */}
            <SectionPanel
                title="Харьцуулалтын хүснэгт"
                description="Plan бүрийн боломжуудын харьцуулалт"
                onSave={() => saveSection('comparison')}
                saving={savingSection === 'comparison'}
                dirty={isDirty('comparison')}
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                                <th className="text-left py-2 px-2 font-medium">Нэр</th>
                                <th className="text-center py-2 px-2 font-medium">Starter</th>
                                <th className="text-center py-2 px-2 font-medium">Pro</th>
                                <th className="text-center py-2 px-2 font-medium">Enterprise</th>
                                <th className="w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {content.comparison.map((row, i) => (
                                <tr key={i} className="border-t border-gray-100">
                                    <td className="py-1.5 px-1">
                                        <input
                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                                            value={row.name}
                                            onChange={(e) => {
                                                const updated = [...content.comparison];
                                                updated[i] = { ...updated[i], name: e.target.value };
                                                updateContent('comparison', updated);
                                            }}
                                        />
                                    </td>
                                    {(['starter', 'pro', 'enterprise'] as const).map((plan) => (
                                        <td key={plan} className="py-1.5 px-1 text-center">
                                            {typeof row[plan] === 'boolean' ? (
                                                <button
                                                    onClick={() => {
                                                        const updated = [...content.comparison];
                                                        updated[i] = { ...updated[i], [plan]: !row[plan] };
                                                        updateContent('comparison', updated);
                                                    }}
                                                    className={`mx-auto w-6 h-6 rounded flex items-center justify-center ${row[plan] ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400 border border-gray-200 text-transparent'}`}
                                                >
                                                    {row[plan] ? '✓' : '—'}
                                                </button>
                                            ) : (
                                                <input
                                                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-[12px] text-white text-center focus:outline-none focus:border-indigo-500/50"
                                                    value={row[plan] as string}
                                                    onChange={(e) => {
                                                        const updated = [...content.comparison];
                                                        updated[i] = { ...updated[i], [plan]: e.target.value };
                                                        updateContent('comparison', updated);
                                                    }}
                                                />
                                            )}
                                        </td>
                                    ))}
                                    <td className="py-1.5 px-1">
                                        <button
                                            onClick={() => updateContent('comparison', content.comparison.filter((_, idx) => idx !== i))}
                                            className="text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-lg p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button
                    onClick={() => updateContent('comparison', [...content.comparison, { name: '', starter: '', pro: '', enterprise: '' }])}
                    className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-indigo-300 transition-colors mt-2"
                >
                    <Plus className="w-3.5 h-3.5" /> Мөр нэмэх
                </button>
            </SectionPanel>

            {/* ═══ FAQ ═══ */}
            <SectionPanel
                title="Түгээмэл асуулт"
                description="FAQ хэсгийн асуулт, хариултууд"
                onSave={() => saveSection('faq')}
                saving={savingSection === 'faq'}
                dirty={isDirty('faq')}
            >
                <Field
                    label="Секцийн нэр"
                    value={content.faq.sectionLabel}
                    onChange={(v) => updateContent('faq', { ...content.faq, sectionLabel: v })}
                />
                <Field
                    label="Гарчиг"
                    value={content.faq.sectionTitle}
                    onChange={(v) => updateContent('faq', { ...content.faq, sectionTitle: v })}
                />
                {content.faq.items.map((item, i) => (
                    <div key={i} className="p-5 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">#{i + 1}</span>
                            <button
                                onClick={() => {
                                    updateContent('faq', { ...content.faq, items: content.faq.items.filter((_, idx) => idx !== i) });
                                }}
                                className="text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-lg p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <Field
                            label="Асуулт"
                            value={item.q}
                            onChange={(v) => {
                                const items = [...content.faq.items];
                                items[i] = { ...items[i], q: v };
                                updateContent('faq', { ...content.faq, items });
                            }}
                        />
                        <Field
                            label="Хариулт"
                            value={item.a}
                            onChange={(v) => {
                                const items = [...content.faq.items];
                                items[i] = { ...items[i], a: v };
                                updateContent('faq', { ...content.faq, items });
                            }}
                            multiline
                        />
                    </div>
                ))}
                <button
                    onClick={() => updateContent('faq', { ...content.faq, items: [...content.faq.items, { q: '', a: '' }] })}
                    className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-indigo-300 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" /> Асуулт нэмэх
                </button>
            </SectionPanel>

            {/* ═══ CTA ═══ */}
            <SectionPanel
                title="CTA (Дуудлага)"
                description="Хуудасны доод хэсгийн дуудлагын текст"
                onSave={() => saveSection('cta')}
                saving={savingSection === 'cta'}
                dirty={isDirty('cta')}
            >
                <Field
                    label="Гарчиг"
                    value={content.cta.heading}
                    onChange={(v) => updateContent('cta', { ...content.cta, heading: v })}
                />
                <Field
                    label="Тайлбар"
                    value={content.cta.sub}
                    onChange={(v) => updateContent('cta', { ...content.cta, sub: v })}
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Товчны текст"
                        value={content.cta.buttonText}
                        onChange={(v) => updateContent('cta', { ...content.cta, buttonText: v })}
                    />
                    <Field
                        label="Линкний текст"
                        value={content.cta.linkText}
                        onChange={(v) => updateContent('cta', { ...content.cta, linkText: v })}
                    />
                </div>
            </SectionPanel>

            {/* Reset to defaults */}
            <div className="flex justify-center pt-4 pb-8">
                <button
                    onClick={() => {
                        if (confirm('Бүх өөрчлөлтийг анхны байдалд нь буцаах уу?')) {
                            setContent(defaultLandingContent);
                            toast.info('Анхны утга руу буцлаа. Хадгалахыг мартуузай.');
                        }
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Бүгдийг анхны байдалд буцаах
                </button>
            </div>
        </div>
    );
}
