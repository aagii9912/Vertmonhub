'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, BookOpen, Upload, Database, X, Save, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ImportTab from './components/ImportTab';
import { SessionApprovalsReset } from '@/components/ai-assistant/SessionApprovalsReset';
import { dashboardFetch } from '@/lib/api/dashboardFetch';

// ============================================
// TYPES
// ============================================
type Tab = 'knowledge' | 'faq' | 'import';

interface FAQ {
    id: string;
    question: string;
    answer: string;
    category: string;
    is_active: boolean;
    usage_count: number;
}

// ============================================
// MAIN PAGE
// ============================================
export default function AISettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('knowledge');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [canImport, setCanImport] = useState(false);

    // Knowledge
    const [customKnowledge, setCustomKnowledge] = useState<Array<{ key: string; value: string }>>([]);

    // FAQ
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [editingFaq, setEditingFaq] = useState<Partial<FAQ> | null>(null);

    // Error/Success
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => { fetchAllData(); }, []);

    async function fetchAllData() {
        try {
            const shopRes = await dashboardFetch('/api/shop');
            const shopData = await shopRes.json();
            if (shopData.shop?.custom_knowledge) {
                setCustomKnowledge(Object.entries(shopData.shop.custom_knowledge).map(([key, value]) => ({ key, value: String(value) })));
            }
            const aiRes = await dashboardFetch('/api/ai-settings');
            if (aiRes.ok) {
                const aiData = await aiRes.json();
                setFaqs(aiData.faqs || []);
            }
            // Check import permission
            try {
                const adminRes = await dashboardFetch('/api/admin/settings');
                if (adminRes.ok) {
                    const adminData = await adminRes.json();
                    const currentAdmin = adminData.admin;
                    if (currentAdmin?.role === 'super_admin' || currentAdmin?.permissions?.can_import_data) {
                        setCanImport(true);
                    }
                }
            } catch { }
        } catch (err) { console.error('Failed to fetch:', err); }
        finally { setLoading(false); }
    }

    // Tab definitions
    const tabs = [
        { id: 'knowledge' as Tab, label: 'AI Мэдээлэл', icon: Database },
        { id: 'faq' as Tab, label: 'FAQ', icon: HelpCircle },
        ...(canImport ? [{ id: 'import' as Tab, label: 'Өгөгдөл оруулах', icon: Upload }] : []),
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground mt-3">Ачааллаж байна...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl">
            <PageHeader
                title="AI Тохируулга"
                subtitle="AI туслахын ашиглах байгууллагын мэдээлэл, FAQ"
            />

            {/* AI туслахын session-ийн автомат зөвшөөрлүүд */}
            <SessionApprovalsReset />

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {tabs.map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors whitespace-nowrap text-sm',
                            'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            activeTab === tab.id
                                ? 'bg-brand text-brand-fg shadow-sm'
                                : 'bg-surface-2 text-muted-foreground hover:bg-surface-3'
                        )}>
                        <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                ))}
            </div>

            {/* Success / Error */}
            {success && (
                <Alert variant="success">
                    <AlertTitle>Амжилттай хадгалагдлаа!</AlertTitle>
                </Alert>
            )}
            {error && (
                <Alert variant="danger">
                    <div className="flex items-center justify-between gap-2">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} aria-label="Хаах"><X className="w-4 h-4" /></button>
                    </div>
                </Alert>
            )}

            {/* Tab Content */}
            {activeTab === 'knowledge' && (
                <KnowledgeSection
                    customKnowledge={customKnowledge} setCustomKnowledge={setCustomKnowledge}
                    saving={saving} setSaving={setSaving} setSuccess={setSuccess} setError={setError}
                />
            )}
            {activeTab === 'faq' && (
                <FAQSection faqs={faqs} setFaqs={setFaqs} editingFaq={editingFaq} setEditingFaq={setEditingFaq} setError={setError} />
            )}
            {activeTab === 'import' && canImport && <ImportTab />}
        </div>
    );
}

// ============================================
// KNOWLEDGE SECTION (AI Мэдээлэл)
// ============================================
function KnowledgeSection({ customKnowledge, setCustomKnowledge, saving, setSaving, setSuccess, setError }: {
    customKnowledge: Array<{ key: string; value: string }>;
    setCustomKnowledge: (v: Array<{ key: string; value: string }>) => void;
    saving: boolean; setSaving: (v: boolean) => void;
    setSuccess: (v: boolean) => void; setError: (v: string | null) => void;
}) {
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');

    async function handleSave() {
        setSaving(true);
        try {
            const obj = customKnowledge.reduce((acc, item) => {
                if (item.key && item.value) acc[item.key] = item.value;
                return acc;
            }, {} as Record<string, string>);
            const res = await dashboardFetch('/api/shop', {
                method: 'PATCH',
                body: JSON.stringify({ custom_knowledge: obj }),
            });
            if (res.ok) {
                setSuccess(true);
                toast.success('AI мэдээлэл хадгалагдлаа');
                setTimeout(() => setSuccess(false), 3000);
            } else throw new Error('Хадгалах алдаа');
        } catch (err: any) { setError(err.message); toast.error(err.message); }
        finally { setSaving(false); }
    }

    const suggestions = [
        { key: 'Борлуулалтын утас', value: '9911-2233' },
        { key: 'Ажлын цаг', value: 'Даваа-Баасан 09:00-18:00' },
        { key: 'Шоурүүм хаяг', value: 'УБ, Хан-Уул, Mandala Garden 1 давхар' },
        { key: 'Урьдчилгаа', value: '30%' },
    ];

    return (
        <div className="space-y-5">
            {/* Info banner */}
            <Alert variant="brand" icon={<Database className="size-5" />}>
                <AlertTitle>AI Мэдээллийн Сан</AlertTitle>
                <AlertDescription>
                    AI туслах хариулахдаа энд оруулсан байгууллагын мэдээллийг ашиглана.
                    Жишээ: утасны дугаар, ажлын цаг, урьдчилгаа гэх мэт.
                </AlertDescription>
            </Alert>

            {/* Add new */}
            <SectionCard title="Мэдээлэл нэмэх" icon={Plus}>
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label htmlFor="knowledge-key" className="text-xs font-medium text-muted-foreground mb-1 block">Гарчиг / Түлхүүр</label>
                        <Input id="knowledge-key" placeholder="Жишээ: Борлуулалтын утас" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                    </div>
                    <div className="flex-[2]">
                        <label htmlFor="knowledge-value" className="text-xs font-medium text-muted-foreground mb-1 block">Утга / Агуулга</label>
                        <Input id="knowledge-value" placeholder="Жишээ: 9911-2233, 8800-1122" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                    </div>
                    <Button onClick={() => {
                        if (newKey && newValue) {
                            setCustomKnowledge([...customKnowledge, { key: newKey, value: newValue }]);
                            setNewKey(''); setNewValue('');
                        }
                    }} disabled={!newKey || !newValue}>
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>

                {/* Quick suggestions */}
                {customKnowledge.length === 0 && (
                    <div className="mt-4">
                        <p className="text-xs text-muted-2 mb-2">Түгээмэл мэдээлэл:</p>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                                <button key={s.key} onClick={() => setCustomKnowledge([...customKnowledge, s])}
                                    className="px-3 py-1.5 bg-surface-2/40 border border-border rounded-lg text-xs text-muted-foreground hover:bg-brand-soft hover:border-brand/30 hover:text-brand-strong transition-colors">
                                    + {s.key}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </SectionCard>

            {/* Existing entries */}
            <div className="space-y-2">
                {customKnowledge.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-2" />
                            <p className="font-medium">Мэдээлэл байхгүй</p>
                            <p className="text-sm mt-1">Дээрх хэсгээс мэдээлэл нэмнэ үү</p>
                        </CardContent>
                    </Card>
                ) : (
                    customKnowledge.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-brand/30 transition-colors group">
                            <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-strong font-bold text-xs flex-shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm">{item.key}</p>
                                <p className="text-sm text-muted-foreground truncate">{item.value}</p>
                            </div>
                            <button onClick={() => setCustomKnowledge(customKnowledge.filter((_, i) => i !== idx))}
                                className="p-2 text-muted-2 hover:text-status-danger hover:bg-status-danger-soft rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {customKnowledge.length > 0 && (
                <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Нийт {customKnowledge.length} мэдээлэл</p>
                    <Button onClick={handleSave} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" /> {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ============================================
// FAQ SECTION
// ============================================
function FAQSection({ faqs, setFaqs, editingFaq, setEditingFaq, setError }: {
    faqs: FAQ[]; setFaqs: (v: FAQ[]) => void;
    editingFaq: Partial<FAQ> | null; setEditingFaq: (v: Partial<FAQ> | null) => void;
    setError: (v: string | null) => void;
}) {
    async function saveFaq() {
        if (!editingFaq?.question || !editingFaq?.answer) return;
        try {
            const isNew = !editingFaq.id;
            const res = await dashboardFetch('/api/ai-settings', {
                method: isNew ? 'POST' : 'PATCH',
                body: JSON.stringify({ type: 'faqs', ...editingFaq }),
            });
            if (!res.ok) throw new Error('FAQ хадгалах алдаа');
            const { data } = await res.json();
            if (isNew) setFaqs([...faqs, data]);
            else setFaqs(faqs.map(f => f.id === data.id ? data : f));
            setEditingFaq(null);
            toast.success('FAQ хадгалагдлаа');
        } catch (err: any) { setError(err.message); }
    }

    async function deleteFaq(id: string) {
        try {
            await dashboardFetch(`/api/ai-settings?type=faqs&id=${id}`, { method: 'DELETE' });
            setFaqs(faqs.filter(f => f.id !== id));
            toast.success('FAQ устгагдлаа');
        } catch (err: any) { setError(err.message); }
    }

    return (
        <div className="space-y-5">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="heading-section text-lg text-foreground">Түгээмэл асуултууд (FAQ)</h3>
                    <p className="text-sm text-muted-foreground">AI туслах эдгээр асуулт-хариултыг байгууллагын мэдлэг болгон ашиглана</p>
                </div>
                <Button onClick={() => setEditingFaq({ question: '', answer: '', category: 'general' })}>
                    <Plus className="w-4 h-4 mr-2" /> Нэмэх
                </Button>
            </div>

            {editingFaq && (
                <Card className="border-brand/30 bg-brand-soft/50">
                    <CardContent className="p-5 space-y-3">
                        <Input placeholder="Асуулт (жишээ: Урьдчилгаа хэд вэ?)" value={editingFaq.question || ''}
                            onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })} />
                        <Textarea placeholder="Хариулт (жишээ: Урьдчилгаа 30% бөгөөд бэлнээр төлвөл 5% хөнгөлөлт үзүүлнэ.)"
                            value={editingFaq.answer || ''}
                            onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })} rows={3} />
                        <div className="flex gap-2">
                            <Button onClick={saveFaq} size="sm"><Check className="w-4 h-4 mr-1" /> Хадгалах</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingFaq(null)}>
                                <X className="w-4 h-4 mr-1" /> Цуцлах
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {faqs.length === 0 && !editingFaq ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <HelpCircle className="w-12 h-12 mx-auto mb-3 text-muted-2" />
                        <p className="font-medium">FAQ байхгүй</p>
                        <p className="text-sm mt-1">Хэрэглэгчдийн түгээмэл асуултуудыг нэмнэ үү</p>
                        <Button className="mt-4" variant="secondary" onClick={() => setEditingFaq({ question: '', answer: '', category: 'general' })}>
                            <Plus className="w-4 h-4 mr-2" /> Эхний FAQ нэмэх
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {faqs.map((faq) => (
                        <Card key={faq.id} className="hover:shadow-sm transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground inline-flex items-start gap-1.5">
                                            <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-brand-strong" />
                                            {faq.question}
                                        </p>
                                        <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap">{faq.answer}</p>
                                        {faq.usage_count > 0 && (
                                            <p className="text-xs text-muted-2 mt-2">Ашиглагдсан: {faq.usage_count}x</p>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setEditingFaq(faq)} className="p-2 text-muted-2 hover:text-brand-strong hover:bg-brand-soft rounded-lg transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteFaq(faq.id)} className="p-2 text-muted-2 hover:text-status-danger hover:bg-status-danger-soft rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
