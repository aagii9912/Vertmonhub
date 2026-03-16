'use client';

import { useState, useEffect } from 'react';
import { Bot, HelpCircle, BookOpen, Bell, Upload, Database, Sparkles, AlertCircle, X, Save, Zap, Smile, Briefcase, Cloud, PartyPopper, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
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
        ...(canImport ? [{ id: 'import' as Tab, label: '📥 Өгөгдөл оруулах', icon: Upload }] : []),
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-gray-500 mt-3">Ачааллаж байна...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    AI Тохируулга
                </h1>
                <p className="text-gray-500 mt-1">Chatbot-ийн мэдээлэл, зан байдал, FAQ-г удирдах</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {tabs.map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap text-sm
                            ${activeTab === tab.id
                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                        <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                ))}
            </div>

            {/* Success / Error */}
            {success && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2">
                    <Sparkles className="w-5 h-5" /> Амжилттай хадгалагдлаа!
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />{error}
                    <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
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
            <div className={`rounded-2xl border-2 p-5 transition-all ${isAiActive ? 'bg-white border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAiActive ? 'bg-emerald-100' : 'bg-red-100'}`}>
                            <Zap className={`w-5 h-5 ${isAiActive ? 'text-emerald-600' : 'text-red-500'}`} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">AI Chatbot {isAiActive ? 'Идэвхтэй' : 'Унтарсан'}</h3>
                            <p className="text-sm text-gray-500">{isAiActive ? 'Messenger-ээр хэрэглэгчдэд автомат хариу өгч байна' : 'Зөвхөн админ хариу өгнө'}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAiActive(!isAiActive)}
                        className={`w-14 h-8 rounded-full transition-colors relative ${isAiActive ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${isAiActive ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>
            </div>

            {/* AI Emotion */}
            <Card>
                <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-3">🎭 AI Зан байдал</h3>
                    <div className="grid grid-cols-5 gap-2 mb-4">
                        {emotionOptions.map((opt) => (
                            <button key={opt.value} onClick={() => setAiEmotion(opt.value)}
                                className={`p-3 rounded-xl border-2 text-center transition-all
                                    ${aiEmotion === opt.value ? 'border-violet-500 bg-violet-50 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                                <div className="text-2xl mb-1">{opt.emoji}</div>
                                <p className={`text-xs font-medium ${aiEmotion === opt.value ? 'text-violet-700' : 'text-gray-600'}`}>{opt.label}</p>
                            </button>
                        ))}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-400 mb-1">Жишээ хариулт:</p>
                                <p className="text-sm text-gray-700 italic">"{emotionOptions.find(e => e.value === aiEmotion)?.example}"</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Business Description */}
            <Card>
                <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-1">🏢 Компанийн тайлбар</h3>
                    <p className="text-sm text-gray-500 mb-3">AI энэ мэдээллийг ашиглан компанийн талаар хариулна</p>
                    <Textarea
                        value={shopDescription}
                        onChange={(e) => setShopDescription(e.target.value)}
                        placeholder="Жишээ: Монкон Констракшн нь 2010 оноос хойш 15+ орон сууцны хороолол барьсан тэргүүлэх барилгын компани..."
                        rows={4}
                        className="resize-none"
                    />
                </CardContent>
            </Card>

            {/* AI Instructions */}
            <Card>
                <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-1">📝 AI Заавар</h3>
                    <p className="text-sm text-gray-500 mb-3">AI хэрхэн ярих, яаж хариулахыг заана</p>
                    <Textarea
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        placeholder="Жишээ: Хэрэглэгчтэй монголоор ярих. Байрны үнэ асуухад 1м²-ийн үнийг хэлж, нийт талбайгаар үржүүлж тайлбарлах..."
                        rows={5}
                        className="resize-none"
                    />
                </CardContent>
            </Card>

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
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-100 p-5">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Database className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">AI Мэдээллийн Сан</h3>
                        <p className="text-sm text-gray-600 mt-0.5">
                            AI chatbot хэрэглэгчдэд хариулахдаа энд оруулсан мэдээллийг ашиглана.
                            Жишээ: утасны дугаар, ажлын цаг, урьдчилгаа гэх мэт.
                        </p>
                    </div>
                </div>
            </div>

            {/* Add new */}
            <Card>
                <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-3">➕ Мэдээлэл нэмэх</h3>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Гарчиг / Түлхүүр</label>
                            <Input placeholder="Жишээ: Борлуулалтын утас" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Утга / Агуулга</label>
                            <Input placeholder="Жишээ: 9911-2233, 8800-1122" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
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
                            <p className="text-xs text-gray-400 mb-2">💡 Түгээмэл мэдээлэл:</p>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.map((s) => (
                                    <button key={s.key} onClick={() => setCustomKnowledge([...customKnowledge, s])}
                                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors">
                                        + {s.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Existing entries */}
            <div className="space-y-2">
                {customKnowledge.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center text-gray-500">
                            <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="font-medium">Мэдээлэл байхгүй</p>
                            <p className="text-sm mt-1">Дээрх хэсгээс мэдээлэл нэмнэ үү</p>
                        </CardContent>
                    </Card>
                ) : (
                    customKnowledge.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-violet-200 transition-colors group">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-xs flex-shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm">{item.key}</p>
                                <p className="text-sm text-gray-600 truncate">{item.value}</p>
                            </div>
                            <button onClick={() => setCustomKnowledge(customKnowledge.filter((_, i) => i !== idx))}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {customKnowledge.length > 0 && (
                <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">Нийт {customKnowledge.length} мэдээлэл</p>
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
                    <h3 className="text-lg font-semibold text-gray-900">Түгээмэл асуултууд (FAQ)</h3>
                    <p className="text-sm text-gray-500">AI chatbot эдгээр асуулт-хариултуудыг ашиглан хэрэглэгчдэд хариулна</p>
                </div>
                <Button onClick={() => setEditingFaq({ question: '', answer: '', category: 'general' })}>
                    <Plus className="w-4 h-4 mr-2" /> Нэмэх
                </Button>
            </div>

            {editingFaq && (
                <Card className="border-violet-200 bg-violet-50/50">
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
                    <CardContent className="py-12 text-center text-gray-500">
                        <HelpCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
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
                                        <p className="font-medium text-gray-900">❓ {faq.question}</p>
                                        <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap">{faq.answer}</p>
                                        {faq.usage_count > 0 && (
                                            <p className="text-xs text-gray-400 mt-2">Ашиглагдсан: {faq.usage_count}x</p>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setEditingFaq(faq)} className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteFaq(faq.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
        { label: 'Холбогдох хүсэлт', desc: 'Хэрэглэгч утасны дугаар эсвэл имэйл үлдээх үед', value: notifyOnContact, toggle: () => setNotifyOnContact(!notifyOnContact), emoji: '📱' },
        { label: 'Тусламж хүсэх', desc: 'Хэрэглэгч борлуулагчтай холбогдохыг хүсэх үед', value: notifyOnSupport, toggle: () => setNotifyOnSupport(!notifyOnSupport), emoji: '🆘' },
        { label: 'Үзлэг цуцлах', desc: 'Хэрэглэгч товлосон үзлэгээ цуцлах үед', value: notifyOnCancel, toggle: () => setNotifyOnCancel(!notifyOnCancel), emoji: '❌' },
    ];

    return (
        <div className="space-y-5">
            <Card>
                <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-1">🔔 Мэдэгдлийн тохиргоо</h3>
                    <p className="text-sm text-gray-500 mb-5">AI ямар тохиолдолд танд мэдэгдэл илгээхийг тохируулна</p>
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div key={item.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{item.emoji}</span>
                                    <div>
                                        <p className="font-medium text-gray-900 text-sm">{item.label}</p>
                                        <p className="text-xs text-gray-500">{item.desc}</p>
                                    </div>
                                </div>
                                <button onClick={item.toggle}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${item.value ? 'bg-violet-600' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${item.value ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end mt-5">
                        <Button onClick={onSave} disabled={saving}>
                            <Save className="w-4 h-4 mr-2" /> {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
