'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Plus, GripVertical, Trash2, Save, Link, MessageCircle, X,
    ChevronRight, Activity, Calendar, ArrowLeft,
    TrendingUp, Users, Globe, Search, BarChart2, Target,
    Building2, Eye, Sparkles, Loader2, MapPin, DollarSign,
    Share2, Heart, MessageSquare, Megaphone
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import NextLink from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

// ==============================================
// TYPES
// ==============================================

type TabType = 'surveys' | 'market' | 'competitor' | 'social';
type QuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'rating';

interface Question {
    id: string;
    type: QuestionType;
    text: string;
    options?: string[];
    required: boolean;
}

interface Survey {
    id?: string;
    title: string;
    description: string;
    questions: Question[];
    is_active?: boolean;
    created_at?: string;
}

interface ResearchResult {
    title: string;
    content: string;
    loading: boolean;
}

// ==============================================
// TAB CONFIG
// ==============================================

const TABS: { id: TabType; label: string; icon: React.ElementType; color: string; desc: string }[] = [
    { id: 'surveys', label: 'Судалгаа', icon: MessageCircle, color: 'emerald', desc: 'Харилцагчийн санал асуулга' },
    { id: 'market', label: 'Зах зээл', icon: TrendingUp, color: 'blue', desc: 'Зах зээлийн судалгаа & тренд' },
    { id: 'competitor', label: 'Өрсөлдөгч', icon: Building2, color: 'orange', desc: 'Өрсөлдөгчдийн шинжилгээ' },
    { id: 'social', label: 'Social орчин', icon: Globe, color: 'violet', desc: 'Нийгмийн сүлжээний шинжилгээ' },
];

const TAB_COLORS: Record<string, { bg: string; text: string; border: string; light: string; btn: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-500', light: 'bg-emerald-100', btn: 'bg-emerald-600 hover:bg-emerald-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-500', light: 'bg-blue-100', btn: 'bg-blue-600 hover:bg-blue-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-500', light: 'bg-orange-100', btn: 'bg-orange-600 hover:bg-orange-700' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-500', light: 'bg-violet-100', btn: 'bg-violet-600 hover:bg-violet-700' },
};

// ==============================================
// MARKET RESEARCH PROMPTS
// ==============================================

const MARKET_TOOLS = [
    {
        id: 'market_overview',
        title: 'Зах зээлийн ерөнхий тойм',
        desc: 'УБ-ийн үл хөдлөх зах зээлийн ерөнхий нөхцөл, чиг хандлага',
        icon: TrendingUp,
        prompt: 'Монголын үл хөдлөх хөрөнгийн зах зээлийн одоогийн нөхцөл, чиг хандлага, үнийн дундаж, эрэлт нийлүүлэлтийн байдлыг дэлгэрэнгүй шинжлээд, 2024-2025 оны прогноз хийж өгнө үү. Улаанбаатар хотын дүүрэг тус бүрийн м² үнийн хандлага.'
    },
    {
        id: 'pricing_analysis',
        title: 'Үнийн шинжилгээ',
        desc: 'Дүүрэг тус бүрийн м² үнэ, хандлага, зөвлөмж',
        icon: DollarSign,
        prompt: 'Улаанбаатар хотын дүүрэг бүрийн орон сууцны м² үнийн шинжилгээ хийнэ үү. Хан-Уул, Баянгол, Сүхбаатар, Чингэлтэй, Баянзүрх, Сонгинохайрхан дүүргүүдийн үнийн ялгаа, хандлага, хамгийн эрэлттэй бүс нутаг. Мөн Vertmon-ий байрууд яг хэдэн төгрөгөөр/м² зарагдаж байгааг DB-ээс татаж харьцуулна уу.'
    },
    {
        id: 'demand_forecast',
        title: 'Эрэлтийн прогноз',
        desc: 'Ирэх 6 сар-1 жилийн эрэлтийн таамаглал',
        icon: Target,
        prompt: 'Vertmon-ий бодит борлуулалтын мэдээлэл дээр тулгуурлан ирэх 6 сар-1 жилийн эрэлтийн прогноз гаргана уу. Аль төрлийн байр илүү эрэлттэй байна вэ? Хэдэн өрөөтэй, хэдэн м², ямар үнийн хүрээнд? Мөн улирлын уур амьсгалын нөлөөлөл, зориулалтын хүчин зүйлс.'
    },
    {
        id: 'buyer_persona',
        title: 'Худалдан авагчийн дүр зураг',
        desc: 'Идеал худалдан авагчийн профайл, зан төлөв',
        icon: Users,
        prompt: 'Vertmon-ий лийд болон худалдан авагчдын мэдээллийг DB-ээс татаж, buyer persona бүтээнэ үү. Нас, орлого, ажил мэргэжил, гэр бүлийн байдал, байр сонгох шалтгаан, energy source, төсвийн хүрээ зэрэг хүчин зүйлсээр ангилна. 3-4 ялгаатай persona гаргана уу.'
    },
];

const COMPETITOR_TOOLS = [
    {
        id: 'competitor_map',
        title: 'Өрсөлдөгчдийн газрын зураг',
        desc: 'Гол өрсөлдөгчид, тэдний давуу/сул тал',
        icon: MapPin,
        prompt: 'Монголын үл хөдлөхийн зах зээлийн гол өрсөлдөгчдийн (Tavan Bogd, Nomin, Hunnu, Ard Holdings, Max Group, Bodi International гм.) SWOT шинжилгээ хийнэ үү. Тэдний төслүүд, үнийн бодлого, маркетинг стратеги, давуу/сул талуудыг Vertmon-тэй харьцуулна уу.'
    },
    {
        id: 'competitor_pricing',
        title: 'Өрсөлдөгчдийн үнийн харьцуулалт',
        desc: 'Ижил бүсийн өрсөлдөгчдийн үнэ, нөхцөл',
        icon: DollarSign,
        prompt: 'Vertmon-ий бодит байрны үнэ DB-ээс татаж, зах зээл дээрх бусад хөгжүүлэгчдийн ижил бүсийн төслүүдтэй харьцуулна уу. Давуу талууд юу вэ? Яагаад Vertmon сонгох хэрэгтэй вэ? Үнийн positioning зөвлөмж.'
    },
    {
        id: 'market_share',
        title: 'Зах зээлийн хувь',
        desc: 'Vertmon-ий зах зээлд эзлэх хувь, байр суурь',
        icon: BarChart2,
        prompt: 'Монголын үл хөдлөх зах зээлд Vertmon-ий эзлэх байр суурь, зорилтот зах зээлийн хэмжээ, өсөлтийн боломж. Vertmon-ий борлуулалтын мэдээлэл DB-ээс авч ерөнхий зах зээлийн хэмжээтэй харьцуулна уу.'
    },
    {
        id: 'diff_strategy',
        title: 'Давуу тал & ялгарах стратеги',
        desc: 'Vertmon-ий өрсөлдөх давуу тал',
        icon: Sparkles,
        prompt: 'Vertmon-ий давуу талууд юу вэ? Vertmon Hub платформ, AI туслах, лийд менежмент зэрэг features-ийг ашиглан яаж өрсөлдөгчдөөсөө ялгарах вэ? Бодит зөвлөмжтэй, хэрэгжих боломжтой стратеги.'
    },
];

const SOCIAL_TOOLS = [
    {
        id: 'social_strategy',
        title: 'Social Media стратеги',
        desc: 'Facebook, Instagram, TikTok зэрэг платформ',
        icon: Share2,
        prompt: 'Vertmon-д зориулсан 3 сарын social media стратеги боловсруулна уу. Facebook, Instagram, TikTok платформ тус бүрээр: контент төрөл, нийтлэлийн давтамж, хэрэглэгчийн оролцоог нэмэгдүүлэх арга, paid ads budget, KPI. Монголын зах зээлд тохирсон.'
    },
    {
        id: 'content_calendar',
        title: 'Контент хуанли',
        desc: 'Долоо хоногийн нийтлэлийн төлөвлөгөө',
        icon: Calendar,
        prompt: '1 сарын контент хуанли гаргана уу. Долоо хоног бүрд: Facebook (3 post), Instagram (5 post + 3 story), TikTok (2 video). Контент төрөл: байрны танилцуулга, customer testimonial, хөгжүүлэлтийн явц, маркетинг offer, lifestyle content. Vertmon-ий бодит байрны мэдээлэл DB-ээс авч ашиглана.'
    },
    {
        id: 'engagement_boost',
        title: 'Оролцоог нэмэгдүүлэх',
        desc: 'Like, comment, share нэмэгдүүлэх аргууд',
        icon: Heart,
        prompt: 'Vertmon-ий social media engagement (like, comment, share, save) нэмэгдүүлэх 10 бодит арга зам. Viral content strategy, community building, UGC (user generated content), influencer хамтын ажиллагаа, giveaway/contest санаанууд. Монгол зах зээлд тохирсон жишээнүүдтэй.'
    },
    {
        id: 'ad_budget',
        title: 'Зар сурталчилгааны төсөв',
        desc: 'Facebook/Instagram Ads төсөв & ROI тооцоо',
        icon: Megaphone,
        prompt: 'Vertmon-д зориулсан Facebook/Instagram Ads strategy: 1) Monthly ad budget зөвлөмж (500K₮ - 5M₮ хооронд), 2) Campaign structure (awareness, consideration, conversion), 3) Target audience setting, 4) Ad format тус бүрийн ROI тооцоо, 5) A/B test strategy. Vertmon-ий бодит байр, үнийн мэдээллийг DB-ээс ашиглана.'
    },
];

// ==============================================
// MAIN COMPONENT
// ==============================================

export default function SurveysPage() {
    const { shop } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('surveys');
    const [view, setView] = useState<'list' | 'create'>('list');
    const [surveyList, setSurveyList] = useState<Survey[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(true);

    const [survey, setSurvey] = useState<Survey>({
        title: 'Шинэ судалгаа',
        description: 'Харилцагчийн сэтгэл ханамжийн судалгаа',
        questions: [
            { id: '1', type: 'short_text', text: 'Таны нэр?', required: true },
            { id: '2', type: 'rating', text: 'Үйлчилгээ 1-5 хүртэл хэдэн оноо өгөх вэ?', required: true },
        ]
    });
    const [isSaving, setIsSaving] = useState(false);

    // Research state
    const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);

    useEffect(() => {
        if (activeTab === 'surveys' && view === 'list') {
            const fetchSurveys = async () => {
                setIsLoadingList(true);
                try {
                    const res = await fetch('/api/surveys');
                    if (res.ok) {
                        const data = await res.json();
                        setSurveyList(data.surveys || []);
                    }
                } catch (error) {
                    console.error('Failed to load surveys', error);
                } finally {
                    setIsLoadingList(false);
                }
            };
            fetchSurveys();
        }
    }, [activeTab, view]);

    // ==============================================
    // RESEARCH HANDLER — Uses AI assistant general mode
    // ==============================================

    const runResearch = async (title: string, prompt: string) => {
        setResearchResult({ title, content: '', loading: true });

        try {
            const res = await fetch('/api/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompt,
                    shopId: shop?.id,
                    mode: 'general',
                    history: [],
                }),
            });

            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setResearchResult({ title, content: data.response || 'Үр дүн байхгүй', loading: false });
        } catch (error) {
            setResearchResult({ title, content: 'Алдаа гарлаа. Дахин оролдоно уу.', loading: false });
        }
    };

    // ==============================================
    // SURVEY BUILDER HELPERS
    // ==============================================

    const questionTypes = [
        { id: 'short_text', label: 'Богино хариулт' },
        { id: 'long_text', label: 'Урт хариулт' },
        { id: 'single_choice', label: 'Нэг сонголт' },
        { id: 'multiple_choice', label: 'Олон сонголт' },
        { id: 'rating', label: 'Үнэлгээ (1-5)' },
    ];

    const addQuestion = (type: QuestionType) => {
        const newQuestion: Question = {
            id: Date.now().toString(), type, text: 'Шинэ асуулт', required: false,
            options: type.includes('choice') ? ['Сонголт 1', 'Сонголт 2'] : undefined,
        };
        setSurvey({ ...survey, questions: [...survey.questions, newQuestion] });
    };

    const updateQuestion = (id: string, updates: Partial<Question>) => {
        setSurvey({ ...survey, questions: survey.questions.map(q => q.id === id ? { ...q, ...updates } : q) });
    };

    const removeQuestion = (id: string) => {
        setSurvey({ ...survey, questions: survey.questions.filter(q => q.id !== id) });
    };

    const onDragEnd = (result: any) => {
        if (!result.destination) return;
        const items = Array.from(survey.questions);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setSurvey({ ...survey, questions: items });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/surveys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(survey),
            });
            if (!res.ok) throw new Error('Failed');
            alert('Судалгаа амжилттай хадгалагдлаа');
            setView('list');
        } catch { alert('Алдаа гарлаа'); }
        finally { setIsSaving(false); }
    };

    // ==============================================
    // RENDER: RESEARCH TOOL GRID
    // ==============================================

    const renderToolGrid = (tools: typeof MARKET_TOOLS, color: string) => {
        const c = TAB_COLORS[color];
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tools.map(tool => {
                        const Icon = tool.icon;
                        return (
                            <button
                                key={tool.id}
                                onClick={() => runResearch(tool.title, tool.prompt)}
                                className={`group text-left p-5 rounded-xl border-2 border-gray-200 hover:${c.border} hover:${c.bg} transition-all`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-11 h-11 ${c.light} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                        <Icon className={`w-5 h-5 ${c.text}`} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 group-hover:text-gray-900">{tool.title}</h3>
                                        <p className="text-sm text-gray-500 mt-0.5">{tool.desc}</p>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 group-hover:text-gray-500">
                                    <Sparkles className="w-3 h-3" />
                                    AI Gemini шинжилгээ + DB мэдээлэл
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Result Panel */}
                {researchResult && (
                    <Card className="relative">
                        <button
                            onClick={() => setResearchResult(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Sparkles className={`w-5 h-5 ${c.text}`} />
                                {researchResult.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {researchResult.loading ? (
                                <div className="flex items-center gap-3 py-12 justify-center">
                                    <Loader2 className={`w-6 h-6 ${c.text} animate-spin`} />
                                    <span className="text-gray-500">AI шинжилгээ хийж байна... (30-60 секунд)</span>
                                </div>
                            ) : (
                                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    {researchResult.content}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    };

    // ==============================================
    // RENDER: SURVEY LIST
    // ==============================================

    const renderSurveyList = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-gray-500 text-sm">Хэрэглэгчдийн санал асуулгын жагсаалт</p>
                </div>
                <Button onClick={() => setView('create')}>
                    <Plus className="w-5 h-5 mr-2" />
                    Судалгаа үүсгэх
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoadingList ? (
                    <div className="col-span-full py-12 text-center text-gray-500">Уншиж байна...</div>
                ) : surveyList.length === 0 ? (
                    <div className="col-span-full py-16 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <Plus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">Судалгаа олдсонгүй</h3>
                        <p className="text-gray-500 mt-1">Одоогоор шинэ судалгаа үүсгээгүй байна.</p>
                        <Button className="mt-4" onClick={() => setView('create')}>Эхний судалгааг үүсгэх</Button>
                    </div>
                ) : (
                    surveyList.map((s) => (
                        <Card key={s.id} className="group hover:border-primary/50 transition-colors">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg line-clamp-1">{s.title}</CardTitle>
                                        <CardDescription className="line-clamp-2 mt-1 min-h-[40px]">{s.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(s.created_at || '').toLocaleDateString('mn-MN')}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Activity className="w-4 h-4 text-emerald-500" />
                                        Идэвхтэй
                                    </div>
                                </div>
                                <NextLink href={`/dashboard/surveys/${s.id}`} className="mt-4 block w-full">
                                    <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-white transition-colors">
                                        Үр дүн харах <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </NextLink>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );

    // ==============================================
    // RENDER: SURVEY CREATE
    // ==============================================

    const renderSurveyCreate = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-gray-500 text-sm">Хэрэглэгчдээс санал асуулга авах, сэтгэл ханамж хэмжих</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setView('list')}><ArrowLeft className="w-4 h-4 mr-2" />Буцах</Button>
                    <Button variant="outline"><Link className="w-4 h-4 mr-2" />Линк хуулах</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Хадгалж байна...' : 'Хадгалах'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 space-y-4">
                    <Card>
                        <CardHeader className="pb-3"><CardTitle className="text-sm">Асуулт нэмэх</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            {questionTypes.map((qt) => (
                                <Button key={qt.id} variant="outline" className="w-full justify-start text-left text-sm font-normal"
                                    onClick={() => addQuestion(qt.id as QuestionType)}>
                                    <Plus className="w-4 h-4 mr-2 text-gray-400" />{qt.label}
                                </Button>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <Card className="border-t-4 border-t-primary">
                        <CardContent className="pt-6 space-y-4">
                            <input type="text" value={survey.title}
                                onChange={(e) => setSurvey({ ...survey, title: e.target.value })}
                                className="text-3xl font-bold w-full outline-none border-b border-transparent hover:border-gray-200 focus:border-primary transition-colors pb-1 bg-transparent"
                                placeholder="Судалгааны гарчиг" />
                            <textarea value={survey.description}
                                onChange={(e) => setSurvey({ ...survey, description: e.target.value })}
                                className="w-full text-sm text-gray-600 outline-none resize-none border-b border-transparent hover:border-gray-200 focus:border-primary transition-colors pb-1 bg-transparent"
                                placeholder="Судалгааны тайлбар" rows={2} />
                        </CardContent>
                    </Card>

                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="questions">
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                                    {survey.questions.map((q, index) => (
                                        <Draggable key={q.id} draggableId={q.id} index={index}>
                                            {(provided) => (
                                                <div ref={provided.innerRef} {...provided.draggableProps} className="group relative">
                                                    <Card>
                                                        <div {...provided.dragHandleProps}
                                                            className="absolute left-1/2 -top-3 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded px-2 py-0.5 cursor-grab active:cursor-grabbing text-gray-400">
                                                            <GripVertical className="w-4 h-4" />
                                                        </div>
                                                        <CardContent className="p-6">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="flex-1 space-y-4">
                                                                    <input type="text" value={q.text}
                                                                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                                                                        className="w-full text-lg font-medium outline-none border-b bg-gray-50 px-3 py-2 rounded focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                                                        placeholder="Асуултаа энд бичнэ үү" />

                                                                    <div className="ml-3 mt-4 text-sm text-gray-500">
                                                                        {q.type === 'short_text' && <div className="border-b border-gray-300 w-1/2 pb-1">Bogino khariу үлдээх зай...</div>}
                                                                        {q.type === 'long_text' && <div className="border border-gray-200 rounded p-2 h-20 bg-gray-50 flex items-center text-gray-400">Урт хариу үлдээх зай...</div>}
                                                                        {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                                                                            <div className="space-y-2">
                                                                                {q.options?.map((opt, i) => (
                                                                                    <div key={i} className="flex items-center gap-2">
                                                                                        {q.type === 'single_choice' ? <div className="w-4 h-4 rounded-full border border-gray-300" /> : <div className="w-4 h-4 rounded border border-gray-300" />}
                                                                                        <input type="text" value={opt}
                                                                                            onChange={(e) => { const newOpts = [...(q.options || [])]; newOpts[i] = e.target.value; updateQuestion(q.id, { options: newOpts }); }}
                                                                                            className="outline-none border-b border-transparent hover:border-gray-200 focus:border-primary text-gray-700 bg-transparent px-1" />
                                                                                        <button onClick={() => updateQuestion(q.id, { options: q.options?.filter((_, idx) => idx !== i) })} className="text-gray-300 hover:text-red-500 ml-2">
                                                                                            <X className="w-3 h-3" />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                                <Button variant="ghost" size="sm" className="text-primary mt-2 text-xs"
                                                                                    onClick={() => updateQuestion(q.id, { options: [...(q.options || []), `Сонголт ${(q.options?.length || 0) + 1}`] })}>
                                                                                    Сонголт нэмэх
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                        {q.type === 'rating' && (
                                                                            <div className="flex gap-4 items-center mt-2">
                                                                                {[1, 2, 3, 4, 5].map(num => (
                                                                                    <div key={num} className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center font-medium text-gray-400">{num}</div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-col items-center gap-4 pt-2 border-l border-gray-100 pl-4">
                                                                    <button onClick={() => removeQuestion(q.id)} className="text-gray-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition-colors">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <div className="flex items-center gap-2 mt-4 text-xs font-medium text-gray-500">
                                                                        Шаардлагатай
                                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                                            <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} className="sr-only peer" />
                                                                            <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>

                    {survey.questions.length === 0 && (
                        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                            <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500 font-medium">Асуулт одоогоор алга байна</p>
                            <p className="text-sm text-gray-400 mt-1">Зүүн талаас асуултын төрөл сонгож эхэлнэ үү</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // ==============================================
    // MAIN RENDER
    // ==============================================

    const currentTab = TABS.find(t => t.id === activeTab)!;
    const currentColor = TAB_COLORS[currentTab.color];

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Судалгаа & Шинжилгээ</h1>
                <p className="text-gray-500 text-sm mt-1">Зах зээлийн судалгаа, өрсөлдөгчдийн шинжилгээ, social стратеги</p>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-0">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const tc = TAB_COLORS[tab.color];
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setResearchResult(null); }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-[1px] ${
                                isActive
                                    ? `${tc.border} ${tc.text}`
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === 'surveys' && (view === 'list' ? renderSurveyList() : renderSurveyCreate())}
            {activeTab === 'market' && renderToolGrid(MARKET_TOOLS, 'blue')}
            {activeTab === 'competitor' && renderToolGrid(COMPETITOR_TOOLS, 'orange')}
            {activeTab === 'social' && renderToolGrid(SOCIAL_TOOLS, 'violet')}
        </div>
    );
}
