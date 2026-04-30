'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
    Bot, Save, Zap, Smile, Briefcase, Cloud, PartyPopper,
} from 'lucide-react';
import type { AiEmotion } from './types';

const emotionOptions: Array<{ value: AiEmotion; label: string; icon: React.ReactNode }> = [
    { value: 'friendly', label: 'Найрсаг 😊', icon: <Smile className="w-5 h-5" /> },
    { value: 'professional', label: 'Мэргэжлийн 👔', icon: <Briefcase className="w-5 h-5" /> },
    { value: 'enthusiastic', label: 'Урам зоригтой 🎉', icon: <Zap className="w-5 h-5" /> },
    { value: 'calm', label: 'Тайван 🧘', icon: <Cloud className="w-5 h-5" /> },
    { value: 'playful', label: 'Тоглоомтой 🎮', icon: <PartyPopper className="w-5 h-5" /> },
];

interface GeneralTabProps {
    isAiActive: boolean;
    setIsAiActive: (v: boolean) => void;
    aiEmotion: AiEmotion;
    setAiEmotion: (v: AiEmotion) => void;
    shopDescription: string;
    setShopDescription: (v: string) => void;
    aiInstructions: string;
    setAiInstructions: (v: string) => void;
    saving: boolean;
    onSave: () => void;
}

export default function GeneralTab({
    isAiActive, setIsAiActive, aiEmotion, setAiEmotion,
    shopDescription, setShopDescription, aiInstructions, setAiInstructions,
    saving, onSave,
}: GeneralTabProps) {
    return (
        <div className="space-y-6">
            {/* Main AI Toggle */}
            <Card className={`${isAiActive ? 'bg-surface' : 'bg-status-danger-soft border-status-danger/30'}`}>
                <CardContent className="p-6 flex items-center justify-between">
                    <div>
                        <h2 className="font-semibold text-foreground flex items-center gap-2">
                            <Zap className={`w-5 h-5 ${isAiActive ? 'text-brand-strong' : 'text-muted-foreground/70'}`} />
                            AI-г идэвхжүүлэх
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {isAiActive
                                ? 'AI одоогоор идэвхтэй байна. Хэрэглэгчдэд хариу өгч байна.'
                                : 'AI унтраалттай байна. Зөвхөн админ хариу өгнө.'}
                        </p>
                    </div>
                    <button
                        onClick={() => setIsAiActive(!isAiActive)}
                        className={`w-14 h-8 rounded-full transition-colors relative ${isAiActive ? 'bg-brand' : 'bg-border-strong'}`}
                    >
                        <div className={`absolute top-1 w-6 h-6 bg-surface rounded-full transition-all shadow-sm ${isAiActive ? 'left-7' : 'left-1'}`} />
                    </button>
                </CardContent>
            </Card>

            {/* AI Emotion */}
            <Card>
                <CardContent className="p-6">
                    <h2 className="font-semibold text-foreground mb-4">AI Зан байдал</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                        {emotionOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setAiEmotion(option.value)}
                                className={`p-4 rounded-xl border-2 transition-all relative overflow-hidden ${aiEmotion === option.value
                                    ? 'border-brand bg-brand-soft'
                                    : 'border-border hover:border-brand/30'
                                    }`}
                            >
                                <div className={`mb-2 ${aiEmotion === option.value ? 'text-brand-strong' : 'text-muted-foreground/70'}`}>
                                    {option.icon}
                                </div>
                                <p className={`font-medium text-sm ${aiEmotion === option.value ? 'text-brand-strong' : 'text-foreground'}`}>{option.label}</p>
                                {aiEmotion === option.value && (
                                    <div className="absolute top-2 right-2 w-2 h-2 bg-brand rounded-full animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Emotion Preview */}
                    <div className="bg-surface-2/40 rounded-xl p-4 border border-border/60 flex gap-4 items-start">
                        <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Жишээ хариулт ({emotionOptions.find(e => e.value === aiEmotion)?.label}):</p>
                            <p className="text-sm text-foreground italic">
                                &quot;{
                                    aiEmotion === 'friendly' ? 'Сайн байна уу! 😊 Та манай дэлгүүрийг сонирхсонд баярлалаа. Би танд юугаар туслах вэ?' :
                                        aiEmotion === 'professional' ? 'Сайн байна уу. Vertmon Hub-д тавтай морил. Танд бүтээгдэхүүний мэдээлэл хэрэгтэй юу?' :
                                            aiEmotion === 'enthusiastic' ? 'Сайн уу!! 🎉 Манай дэлгүүрт тавтай морил! Өнөөдөр ямар гоё зүйл хайж байна вэ?' :
                                                aiEmotion === 'calm' ? 'Сайн байна уу. Тавтай морилно уу. Та тайван сонголтоо хийгээрэй, асуух зүйл байвал би энд байна. 🧘' :
                                                    'Хөөх, сайн уу! 🎮 Юу сонирхож байна? Гоё юмнууд их байгаа шүү!'
                                }&quot;
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Shop Description */}
            <Card>
                <CardContent className="p-6">
                    <h2 className="font-semibold text-foreground mb-2">Бизнесийн тайлбар</h2>
                    <p className="text-sm text-muted-foreground mb-4">AI энэ мэдээллийг ашиглан бизнесийн талаар хариулна</p>
                    <Textarea
                        value={shopDescription}
                        onChange={(e) => setShopDescription(e.target.value)}
                        placeholder="Жишээ: Манай компани бол орон сууцны хороолол хөгжүүлэгч..."
                        rows={4}
                    />
                </CardContent>
            </Card>

            {/* AI Instructions */}
            <Card>
                <CardContent className="p-6">
                    <h2 className="font-semibold text-foreground mb-2">AI Заавар</h2>
                    <p className="text-sm text-muted-foreground mb-4">AI хэрхэн ярих, ямар хэв маягтай байхыг заана</p>
                    <Textarea
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        placeholder="Жишээ: Хэрэглэгчтэй найрсаг, дотно харилцаарай..."
                        rows={6}
                    />
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={onSave} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                </Button>
            </div>
        </div>
    );
}
