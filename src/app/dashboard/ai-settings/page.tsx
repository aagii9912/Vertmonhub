'use client';

import { useState, useEffect } from 'react';
import { Bot, HelpCircle, BookOpen, Bell, Upload, Database, X, Save, Zap, Plus, Trash2, Edit2, Check, MessageSquareHeart, Building2, FileText, BellRing } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { SectionCard } from '@/components/ui/SectionCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ImportTab from './components/ImportTab';

// ============================================
// TYPES
// ============================================
type Tab = 'general' | 'knowledge' | 'faq' | 'notifications' | 'import';
type AiEmotion = 'friendly' | 'professional' | 'enthusiastic' | 'calm' | 'playful';

interface FAQ {
    id: string;
    question: string;
    answer: string;
    category: string;
    is_active: boolean;
    usage_count: number;
}

const emotionOptions: Array<{ value: AiEmotion; label: string; emoji: string; example: string }> = [
    { value: 'friendly', label: 'Найрсаг', emoji: '😊', example: 'Сайн байна уу! 😊 Mandala Garden-ий талаар мэдээлэл хэрэгтэй юу? Би танд туслахдаа баяртай!' },
    { value: 'professional', label: 'Мэргэжлийн', emoji: '👔', example: 'Сайн байна уу. Vertmon Hub-д тавтай морил. Ямар байрны мэдээлэл хэрэгтэй байна вэ?' },
    { value: 'enthusiastic', label: 'Урам зоригтой', emoji: '🎉', example: 'Сайн уу!! 🎉 Та үнэхээр зөв газар ирлээ! Mandala Garden — хотын төв дээрх шилдэг сонголт!' },
    { value: 'calm', label: 'Тайван', emoji: '🧘', example: 'Сайн байна уу. Та тайван сонголтоо хийгээрэй. Асуух зүйл байвал би энд байна.' },
    { value: 'playful', label: 'Тоглоомтой', emoji: '🎮', example: 'Хөөх, сайн уу! 🏠 Шинэ байр хайж байна гэж үү? Гоё юмнууд их байгаа шүү!' },
];

// ============================================
// MAIN PAGE
// ============================================
export default function AISettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [canImport, setCanImport] = useState(false);

    // General
    const [isAiActive, setIsAiActive] = useState(true);
    const [aiEmotion, setAiEmotion] = useState<AiEmotion>('friendly');
    const [shopDescription, setShopDescription] = useState('');
    const [aiInstructions, setAiInstructions] = useState('');

    // Notifications
    const [notifyOnContact, setNotifyOnContact] = useState(true);
    const [notifyOnSupport, setNotifyOnSupport] = useState(true);
    const [notifyOnCancel, setNotifyOnCancel] = useState(true);

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
            const shopRes = await fetch('/api/shop');
            const shopData = await shopRes.json();
            if (shopData.shop) {
                setShopDescription(shopData.shop.description || '');
                setAiInstructions(shopData.shop.ai_instructions || '');
                setAiEmotion(shopData.shop.ai_emotion || 'friendly');
                setNotifyOnContact(shopData.shop.notify_on_contact ?? true);
                setNotifyOnSupport(shopData.shop.notify_on_support ?? true);
                setNotifyOnCancel(shopData.shop.notify_on_cancel ?? true);
                setIsAiActive(shopData.shop.is_ai_active ?? true);
                if (shopData.shop.custom_knowledge) {
                    setCustomKnowledge(Object.entries(shopData.shop.custom_knowledge).map(([key, value]) => ({ key, value: String(value) })));
                }
            }
            const aiRes = await fetch('/api/ai-settings');
            if (aiRes.ok) {
                const aiData = await aiRes.json();
                setFaqs(aiData.faqs || []);
            }
            // Check import permission
            try {
                const adminRes = await fetch('/api/admin/settings');
                if (adminRes.ok) {
                    const adminData = await adminRes.json();
                    const currentAdmin = adminData.admins?.find((a: any) => a.is_current);
                    if (currentAdmin?.role === 'super_admin' || currentAdmin?.permissions?.can_import_data) {
                        setCanImport(true);
                    }
                }
            } catch { }
        } catch (err) { console.error('Failed to fetch:', err); }
        finally { setLoading(false); }
    }

    async function handleSaveGeneral() {
        setSaving(true);
        try {
            const res = await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: shopDescription, ai_instructions: aiInstructions, ai_emotion: aiEmotion,
                    notify_on_contact: notifyOnContact, notify_on_support: notifyOnSupport,
                    notify_on_cancel: notifyOnCancel, is_ai_active: isAiActive,
                }),
            });
            if (!res.ok) throw new Error('Хадгалах алдаа');
            setSuccess(true);
            toast.success('Амжилттай хадгалагдлаа');
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) { setError(err.message); toast.error(err.message); }
        finally { setSaving(false); }
    }

    // Tab definitions
    const tabs = [
        { id: 'general' as Tab, label: 'Үндсэн', icon: Bot },
        { id: 'knowledge' as Tab, label: 'AI Мэдээлэл', icon: Database },
        { id: 'faq' as Tab, label: 'FAQ', icon: HelpCircle },
        { id: 'notifications' as Tab, label: 'Мэдэгдэл', icon: Bell },
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
                subtitle="Chatbot-ийн мэдээлэл, зан байдал, FAQ-г удирдах"
            />

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
            {activeTab === 'general' && (
                <GeneralSection
                    isAiActive={isAiActive} setIsAiActive={setIsAiActive}
                    aiEmotion={aiEmotion} setAiEmotion={setAiEmotion}
                    shopDescription={shopDescription} setShopDescription={setShopDescription}
                    aiInstructions={aiInstructions} setAiInstructions={setAiInstructions}
                    saving={saving} onSave={handleSaveGeneral}
                />
            )}
            {activeTab === 'knowledge' && (
                <KnowledgeSection
                    customKnowledge={customKnowledge} setCustomKnowledge={setCustomKnowledge}
                    saving={saving} setSaving={setSaving} setSuccess={setSuccess} setError={setError}
                />
            )}
            {activeTab === 'faq' && (
                <FAQSection faqs={faqs} setFaqs={setFaqs} editingFaq={editingFaq} setEditingFaq={setEditingFaq} setError={setError} />
            )}
            {activeTab === 'notifications' && (
                <NotificationsSection
                    notifyOnContact={notifyOnContact} setNotifyOnContact={setNotifyOnContact}
                    notifyOnSupport={notifyOnSupport} setNotifyOnSupport={setNotifyOnSupport}
                    notifyOnCancel={notifyOnCancel} setNotifyOnCancel={setNotifyOnCancel}
                    saving={saving} onSave={handleSaveGeneral}
                />
            )}
            {activeTab === 'import' && canImport && <ImportTab />}
        </div>
    );
}

// ============================================
// GENERAL SECTION
// ============================================
function GeneralSection({ isAiActive, setIsAiActive, aiEmotion, setAiEmotion, shopDescription, setShopDescription, aiInstructions, setAiInstructions, saving, onSave }: {
    isAiActive: boolean; setIsAiActive: (v: boolean) => void;
    aiEmotion: AiEmotion; setAiEmotion: (v: AiEmotion) => void;
    shopDescription: string; setShopDescription: (v: string) => void;
    aiInstructions: string; setAiInstructions: (v: string) => void;
    saving: boolean; onSave: () => void;
}) {
    return (
        <div className="space-y-5">
            {/* AI Toggle */}
            <Card className={cn('border', isAiActive ? 'border-status-success-soft' : 'border-status-danger-soft bg-status-danger-soft/30')}>
                <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isAiActive ? 'bg-status-success-soft text-status-success' : 'bg-status-danger-soft text-status-danger')}>
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">AI Chatbot {isAiActive ? 'Идэвхтэй' : 'Унтарсан'}</h3>
                                <p className="text-sm text-muted-foreground">{isAiActive ? 'Messenger-ээр хэрэглэгчдэд автомат хариу өгч байна' : 'Зөвхөн админ хариу өгнө'}</p>
                            </div>
                        </div>
                        <Switch checked={isAiActive} onCheckedChange={setIsAiActive} aria-label="AI Chatbot идэвхжүүлэх" />
                    </div>
                </CardContent>
            </Card>

            {/* AI Emotion */}
            <SectionCard title="AI Зан байдал" icon={MessageSquareHeart}>
                <div className="grid grid-cols-5 gap-2 mb-4">
                    {emotionOptions.map((opt) => (
                        <button key={opt.value} onClick={() => setAiEmotion(opt.value)}
                            className={cn(
                                'p-3 rounded-xl border text-center transition-colors',
                                'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                aiEmotion === opt.value ? 'border-brand bg-brand-soft shadow-sm' : 'border-border hover:border-border-strong'
                            )}>
                            <div className="text-2xl mb-1">{opt.emoji}</div>
                            <p className={cn('text-xs font-medium', aiEmotion === opt.value ? 'text-brand-strong' : 'text-muted-foreground')}>{opt.label}</p>
                        </button>
                    ))}
                </div>
                <div className="bg-surface-2/40 rounded-xl p-4 border border-border/60">
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-brand-soft text-brand-strong flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-2 mb-1">Жишээ хариулт:</p>
                            <p className="text-sm text-foreground italic">"{emotionOptions.find(e => e.value === aiEmotion)?.example}"</p>
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* Business Description */}
            <SectionCard title="Төслийн тайлбар" icon={Building2} description="AI энэ мэдээллийг ашиглан төслийн талаар хариулна">
                <Textarea
                    value={shopDescription}
                    onChange={(e) => setShopDescription(e.target.value)}
                    placeholder="Жишээ: Монкон Констракшн нь 2010 оноос хойш 15+ орон сууцны хороолол барьсан тэргүүлэх барилгын төсөл..."
                    rows={4}
                    className="resize-none"
                />
            </SectionCard>

            {/* AI Instructions */}
            <SectionCard title="AI Заавар" icon={FileText} description="AI хэрхэн ярих, яаж хариулахыг заана">
                <Textarea
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    placeholder="Жишээ: Хэрэглэгчтэй монголоор ярих. Байрны үнэ асуухад 1м²-ийн үнийг хэлж, нийт талбайгаар үржүүлж тайлбарлах..."
                    rows={5}
                    className="resize-none"
                />
            </SectionCard>

            <div className="flex justify-end">
                <Button onClick={onSave} disabled={saving} className="px-6">
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                </Button>
            </div>
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
            const res = await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
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
                    AI chatbot хэрэглэгчдэд хариулахдаа энд оруулсан мэдээллийг ашиглана.
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
            const res = await fetch('/api/ai-settings', {
                method: isNew ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
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
            await fetch(`/api/ai-settings?type=faqs&id=${id}`, { method: 'DELETE' });
            setFaqs(faqs.filter(f => f.id !== id));
            toast.success('FAQ устгагдлаа');
        } catch (err: any) { setError(err.message); }
    }

    return (
        <div className="space-y-5">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="heading-section text-lg text-foreground">Түгээмэл асуултууд (FAQ)</h3>
                    <p className="text-sm text-muted-foreground">AI chatbot эдгээр асуулт-хариултуудыг ашиглан хэрэглэгчдэд хариулна</p>
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

// ============================================
// NOTIFICATIONS SECTION
// ============================================
function NotificationsSection({ notifyOnContact, setNotifyOnContact, notifyOnSupport, setNotifyOnSupport, notifyOnCancel, setNotifyOnCancel, saving, onSave }: {
    notifyOnContact: boolean; setNotifyOnContact: (v: boolean) => void;
    notifyOnSupport: boolean; setNotifyOnSupport: (v: boolean) => void;
    notifyOnCancel: boolean; setNotifyOnCancel: (v: boolean) => void;
    saving: boolean; onSave: () => void;
}) {
    const items = [
        { label: 'Холбогдох хүсэлт', desc: 'Хэрэглэгч утасны дугаар эсвэл имэйл үлдээх үед', value: notifyOnContact, onChange: setNotifyOnContact },
        { label: 'Тусламж хүсэх', desc: 'Хэрэглэгч борлуулагчтай холбогдохыг хүсэх үед', value: notifyOnSupport, onChange: setNotifyOnSupport },
        { label: 'Үзлэг цуцлах', desc: 'Хэрэглэгч товлосон үзлэгээ цуцлах үед', value: notifyOnCancel, onChange: setNotifyOnCancel },
    ];

    return (
        <div className="space-y-5">
            <SectionCard title="Мэдэгдлийн тохиргоо" icon={BellRing} description="AI ямар тохиолдолд танд мэдэгдэл илгээхийг тохируулна">
                <div className="space-y-3">
                    {items.map((item) => (
                        <SettingRow
                            key={item.label}
                            label={item.label}
                            description={item.desc}
                            control={
                                <Switch checked={item.value} onCheckedChange={item.onChange} aria-label={item.label} />
                            }
                        />
                    ))}
                </div>
                <div className="flex justify-end mt-5">
                    <Button onClick={onSave} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" /> {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                    </Button>
                </div>
            </SectionCard>
        </div>
    );
}
