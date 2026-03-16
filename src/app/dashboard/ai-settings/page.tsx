'use client';

import { useState, useEffect } from 'react';
import { Bot, HelpCircle, MessageCircle, Quote, BookOpen, Settings2, Bell, BarChart3, Sparkles, AlertCircle, X, Upload } from 'lucide-react';
import type { Tab, AiEmotion, FAQ, QuickReply, Slogan, AIStats } from './components/types';
import GeneralTab from './components/GeneralTab';
import FaqTab from './components/FaqTab';
import QuickRepliesTab from './components/QuickRepliesTab';
import SlogansTab from './components/SlogansTab';
import StatsTab from './components/StatsTab';
import NotificationsTab from './components/NotificationsTab';
import KnowledgeTab from './components/KnowledgeTab';
import PoliciesTab from './components/PoliciesTab';
import ImportTab from './components/ImportTab';

const baseTabs = [
    { id: 'general' as Tab, label: 'Үндсэн', icon: Bot },
    { id: 'faqs' as Tab, label: 'FAQ', icon: HelpCircle },
    { id: 'quick_replies' as Tab, label: 'Хурдан хариулт', icon: MessageCircle },
    { id: 'slogans' as Tab, label: 'Хэллэгүүд', icon: Quote },
    { id: 'knowledge' as Tab, label: 'Мэдлэгийн сан', icon: BookOpen },
    { id: 'policies' as Tab, label: 'Бодлогууд', icon: Settings2 },
    { id: 'notifications' as Tab, label: 'Мэдэгдэл', icon: Bell },
    { id: 'stats' as Tab, label: 'Статистик', icon: BarChart3 },
];

const importTab = { id: 'import' as Tab, label: '📥 Өгөгдөл оруулах', icon: Upload };

export default function AISettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [canImport, setCanImport] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // General settings
    const [shopDescription, setShopDescription] = useState('');
    const [aiInstructions, setAiInstructions] = useState('');
    const [aiEmotion, setAiEmotion] = useState<AiEmotion>('friendly');
    const [notifyOnOrder, setNotifyOnOrder] = useState(true);
    const [notifyOnContact, setNotifyOnContact] = useState(true);
    const [notifyOnSupport, setNotifyOnSupport] = useState(true);
    const [notifyOnCancel, setNotifyOnCancel] = useState(true);
    const [isAiActive, setIsAiActive] = useState(true);

    // AI Features data
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [slogans, setSlogans] = useState<Slogan[]>([]);
    const [stats, setStats] = useState<AIStats | null>(null);

    // Knowledge & Policies
    const [customKnowledge, setCustomKnowledge] = useState<Array<{ key: string; value: string }>>([]);
    const [policies, setPolicies] = useState({
        shipping_threshold: 50000,
        payment_methods: ['QPay', 'SocialPay', 'Бэлэн мөнгө'],
        delivery_areas: ['Улаанбаатар'],
        return_policy: '7 хоногийн дотор буцаах боломжтой'
    });

    // Edit states
    const [editingFaq, setEditingFaq] = useState<Partial<FAQ> | null>(null);
    const [editingQuickReply, setEditingQuickReply] = useState<Partial<QuickReply> | null>(null);
    const [editingSlogan, setEditingSlogan] = useState<Partial<Slogan> | null>(null);

    useEffect(() => { fetchAllData(); }, []);

    async function fetchAllData() {
        try {
            const shopRes = await fetch('/api/shop');
            const shopData = await shopRes.json();
            if (shopData.shop) {
                setShopDescription(shopData.shop.description || '');
                setAiInstructions(shopData.shop.ai_instructions || '');
                setAiEmotion(shopData.shop.ai_emotion || 'friendly');
                setNotifyOnOrder(shopData.shop.notify_on_order ?? true);
                setNotifyOnContact(shopData.shop.notify_on_contact ?? true);
                setNotifyOnSupport(shopData.shop.notify_on_support ?? true);
                setNotifyOnCancel(shopData.shop.notify_on_cancel ?? true);
                setIsAiActive(shopData.shop.is_ai_active ?? true);
                if (shopData.shop.custom_knowledge) {
                    setCustomKnowledge(Object.entries(shopData.shop.custom_knowledge).map(([key, value]) => ({ key, value: String(value) })));
                }
                if (shopData.shop.policies) setPolicies(prev => ({ ...prev, ...shopData.shop.policies }));
            }
            const aiRes = await fetch('/api/ai-settings');
            if (aiRes.ok) {
                const aiData = await aiRes.json();
                setFaqs(aiData.faqs || []);
                setQuickReplies(aiData.quickReplies || []);
                setSlogans(aiData.slogans || []);
                setStats(aiData.stats || null);
            }
            // Check if user can import (super_admin or has permission)
            try {
                const adminRes = await fetch('/api/admin/settings');
                if (adminRes.ok) {
                    const adminData = await adminRes.json();
                    const currentAdmin = adminData.admins?.find((a: any) => a.is_current);
                    if (currentAdmin?.role === 'super_admin' || currentAdmin?.permissions?.can_import_data) {
                        setCanImport(true);
                    }
                }
            } catch { /* Non-admin user, import stays hidden */ }
        } catch (err) { console.error('Failed to fetch data:', err); }
        finally { setLoading(false); }
    }

    async function handleSaveGeneral() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: shopDescription, ai_instructions: aiInstructions, ai_emotion: aiEmotion,
                    notify_on_order: notifyOnOrder, notify_on_contact: notifyOnContact,
                    notify_on_support: notifyOnSupport, notify_on_cancel: notifyOnCancel, is_ai_active: isAiActive,
                }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) { setError(err.message); }
        finally { setSaving(false); }
    }

    if (loading) {
        return (<div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" /></div>);
    }

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bot className="w-7 h-7 text-violet-600" /> AI Тохируулга</h1>
                <p className="text-gray-500 mt-1">Chatbot-ийн зан байдал, хариултуудыг тохируулах</p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
                {[...baseTabs, ...(canImport ? [importTab] : [])].map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                ))}
            </div>

            {success && (<div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2"><Sparkles className="w-5 h-5" /> Амжилттай хадгалагдлаа!</div>)}
            {error && (<div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-center gap-2"><AlertCircle className="w-5 h-5" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>)}

            {activeTab === 'general' && <GeneralTab isAiActive={isAiActive} setIsAiActive={setIsAiActive} aiEmotion={aiEmotion} setAiEmotion={setAiEmotion} shopDescription={shopDescription} setShopDescription={setShopDescription} aiInstructions={aiInstructions} setAiInstructions={setAiInstructions} saving={saving} onSave={handleSaveGeneral} />}
            {activeTab === 'faqs' && <FaqTab faqs={faqs} setFaqs={setFaqs} editingFaq={editingFaq} setEditingFaq={setEditingFaq} setError={setError} />}
            {activeTab === 'quick_replies' && <QuickRepliesTab quickReplies={quickReplies} setQuickReplies={setQuickReplies} editingQuickReply={editingQuickReply} setEditingQuickReply={setEditingQuickReply} setError={setError} />}
            {activeTab === 'slogans' && <SlogansTab slogans={slogans} setSlogans={setSlogans} editingSlogan={editingSlogan} setEditingSlogan={setEditingSlogan} setError={setError} />}
            {activeTab === 'stats' && <StatsTab stats={stats} />}
            {activeTab === 'notifications' && <NotificationsTab notifyOnOrder={notifyOnOrder} setNotifyOnOrder={setNotifyOnOrder} notifyOnContact={notifyOnContact} setNotifyOnContact={setNotifyOnContact} notifyOnSupport={notifyOnSupport} setNotifyOnSupport={setNotifyOnSupport} saving={saving} onSave={handleSaveGeneral} />}
            {activeTab === 'knowledge' && <KnowledgeTab customKnowledge={customKnowledge} setCustomKnowledge={setCustomKnowledge} saving={saving} setSaving={setSaving} setSuccess={setSuccess} setError={setError} />}
            {activeTab === 'policies' && <PoliciesTab policies={policies} setPolicies={setPolicies} saving={saving} setSaving={setSaving} setSuccess={setSuccess} setError={setError} />}
            {activeTab === 'import' && canImport && <ImportTab />}
        </div>
    );
}
