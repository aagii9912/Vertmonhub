'use client';

import { useMemo } from 'react';
import {
    LayoutDashboard, Package, ShoppingCart, Users,
    MessageSquare, Bot, Settings, TrendingUp,
    Bell, Search, ChevronDown, BarChart3,
    Send, Facebook, Instagram, Star,
    CreditCard, CheckCircle2, Sparkles, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SetupPreviewProps {
    step: number;
    shopName: string;
    ownerName: string;
    phone: string;
    bankName: string;
    accountNumber: string;
    fbPageName: string;
    fbConnected: boolean;
    igUsername: string;
    igConnected: boolean;
    products: Array<{ name: string; price?: number }>;
    aiEmotion: string;
}

export function SetupPreview({
    step,
    shopName,
    ownerName,
    phone,
    bankName,
    accountNumber,
    fbPageName,
    fbConnected,
    igUsername,
    igConnected,
    products,
    aiEmotion,
}: SetupPreviewProps) {
    const displayName = shopName || 'Таны дэлгүүр';
    const displayOwner = ownerName || 'Нэр';

    return (
        <div className="w-full h-full flex items-center justify-center p-6 lg:p-8">
            <div className="w-full max-w-[520px] relative">
                {/* Floating label */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em]">
                        Live Preview
                    </span>
                </div>

                {/* Dashboard mockup container */}
                <div className="rounded-2xl border border-white/[0.08] bg-[#0e0e12] shadow-2xl overflow-hidden">
                    {/* Mini sidebar + content layout */}
                    <div className="flex h-[420px]">
                        {/* Mini sidebar */}
                        <div className="w-12 bg-[#0a0a0e] border-r border-white/[0.08] flex flex-col items-center py-3 gap-1 shrink-0">
                            {/* Logo */}
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-3">
                                <Zap className="w-3.5 h-3.5 text-white" />
                            </div>
                            {/* Nav items */}
                            {[LayoutDashboard, ShoppingCart, Package, Users, MessageSquare, BarChart3, Settings].map((Icon, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500',
                                        i === 0 ? 'bg-blue-500/15 text-blue-400' : 'text-white/20 hover:text-white/40'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </div>
                            ))}
                        </div>

                        {/* Main area */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {/* Mini header */}
                            <div className="h-10 border-b border-white/[0.08] flex items-center justify-between px-3 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-white/80 truncate max-w-[120px]">
                                        {displayName}
                                    </span>
                                    <ChevronDown className="w-3 h-3 text-white/30" />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-6 h-6 rounded-lg bg-[#0F0B2E] flex items-center justify-center">
                                        <Search className="w-3 h-3 text-white/30" />
                                    </div>
                                    <div className="w-6 h-6 rounded-lg bg-[#0F0B2E] flex items-center justify-center relative">
                                        <Bell className="w-3 h-3 text-white/30" />
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center">
                                        <span className="text-[8px] font-bold text-white">
                                            {displayOwner.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Content area — changes per step */}
                            <div className="flex-1 p-3 overflow-hidden">
                                {step <= 1 && <ShopInfoPreview name={displayName} owner={displayOwner} phone={phone} bankName={bankName} accountNumber={accountNumber} />}
                                {step === 2 && <FacebookPreview fbPageName={fbPageName} connected={fbConnected} shopName={displayName} />}
                                {step === 3 && <InstagramPreview igUsername={igUsername} connected={igConnected} shopName={displayName} />}
                                {step === 4 && <ProductsPreview products={products} shopName={displayName} />}
                                {step === 5 && <AIPreview emotion={aiEmotion} shopName={displayName} />}
                                {step === 6 && <CompletionPreview shopName={displayName} />}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Glow effects */}
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none -z-10" />
                <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-violet-500/10 blur-[60px] pointer-events-none" />
            </div>
        </div>
    );
}

/* ─── Step 1: Shop Info Preview ─── */
function ShopInfoPreview({ name, owner, phone, bankName, accountNumber }: {
    name: string; owner: string; phone: string; bankName: string; accountNumber: string;
}) {
    return (
        <div className="space-y-3 animate-fade-in">
            {/* Hero card */}
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-white/[0.08] p-3">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <span className="text-sm font-bold text-white">{name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                        <p className="text-[12px] font-bold text-white/90 truncate max-w-[160px]">{name}</p>
                        <p className="text-[10px] text-white/40">{owner}</p>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: 'Захиалга', value: '0' },
                        { label: 'Орлого', value: '₮0' },
                        { label: 'Харилцагч', value: '0' },
                    ].map((stat) => (
                        <div key={stat.label} className="text-center p-2 rounded-lg bg-[#0F0B2E]">
                            <p className="text-[14px] font-bold text-white/80">{stat.value}</p>
                            <p className="text-[8px] text-white/30 uppercase tracking-wider">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Info cards */}
            <div className="space-y-1.5">
                {phone && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F0B2E] border border-white/[0.04]">
                        <span className="text-[10px]">📞</span>
                        <span className="text-[11px] text-white/50">{phone}</span>
                    </div>
                )}
                {bankName && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F0B2E] border border-white/[0.04]">
                        <CreditCard className="w-3 h-3 text-blue-400/60" />
                        <span className="text-[11px] text-white/50">{bankName} {accountNumber && `• ${accountNumber}`}</span>
                    </div>
                )}
            </div>

            {/* Channels */}
            <div className="flex gap-2">
                <div className="flex-1 rounded-lg bg-[#0F0B2E] border border-white/[0.04] p-2 text-center">
                    <Facebook className="w-3.5 h-3.5 text-white/15 mx-auto mb-1" />
                    <span className="text-[9px] text-white/20">Холбоогүй</span>
                </div>
                <div className="flex-1 rounded-lg bg-[#0F0B2E] border border-white/[0.04] p-2 text-center">
                    <Instagram className="w-3.5 h-3.5 text-white/15 mx-auto mb-1" />
                    <span className="text-[9px] text-white/20">Холбоогүй</span>
                </div>
            </div>
        </div>
    );
}

/* ─── Step 2: Facebook Preview ─── */
function FacebookPreview({ fbPageName, connected, shopName }: {
    fbPageName: string; connected: boolean; shopName: string;
}) {
    return (
        <div className="space-y-3 animate-fade-in">
            <div className={cn(
                'rounded-xl border p-3 transition-all duration-500',
                connected ? 'bg-blue-500/10 border-blue-500/20' : 'bg-[#0D0928] border-white/[0.08]'
            )}>
                <div className="flex items-center gap-2.5 mb-3">
                    <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500',
                        connected ? 'bg-blue-500 shadow-lg shadow-blue-500/30' : 'bg-[#151040]'
                    )}>
                        <Facebook className={cn('w-4 h-4', connected ? 'text-white' : 'text-white/20')} />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-white/80">Facebook Messenger</p>
                        {connected ? (
                            <p className="text-[10px] text-blue-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {fbPageName || 'Холбогдсон'}
                            </p>
                        ) : (
                            <p className="text-[10px] text-white/30">Холбогдоогүй...</p>
                        )}
                    </div>
                </div>

                {/* Chat simulation */}
                {connected && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                        <div className="flex gap-2">
                            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                <span className="text-[8px] text-blue-400">👤</span>
                            </div>
                            <div className="bg-[#151040] rounded-xl rounded-tl-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-white/60">Сайн байна уу, энэ бараа байгаа юу?</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <div className="bg-blue-500/20 rounded-xl rounded-tr-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-blue-300 flex items-center gap-1">
                                    <Bot className="w-3 h-3" />
                                    AI хариулж байна...
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Instagram placeholder */}
            <div className="rounded-xl bg-[#0D0928] border border-white/[0.08] p-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#151040] flex items-center justify-center">
                        <Instagram className="w-4 h-4 text-white/20" />
                    </div>
                    <div>
                        <p className="text-[11px] font-medium text-white/50">Instagram DM</p>
                        <p className="text-[10px] text-white/20">Дараагийн алхам</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Step 3: Instagram Preview ─── */
function InstagramPreview({ igUsername, connected, shopName }: {
    igUsername: string; connected: boolean; shopName: string;
}) {
    return (
        <div className="space-y-3 animate-fade-in">
            {/* FB connected */}
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                        <Facebook className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                        <p className="text-[10px] font-medium text-white/60">Facebook Messenger</p>
                        <p className="text-[9px] text-blue-400 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Холбогдсон</p>
                    </div>
                </div>
            </div>

            {/* IG main */}
            <div className={cn(
                'rounded-xl border p-3 transition-all duration-500',
                connected ? 'bg-gradient-to-br from-pink-500/10 to-purple-500/10 border-pink-500/20' : 'bg-[#0D0928] border-white/[0.08]'
            )}>
                <div className="flex items-center gap-2.5 mb-3">
                    <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500',
                        connected ? 'bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-500/30' : 'bg-[#151040]'
                    )}>
                        <Instagram className={cn('w-4 h-4', connected ? 'text-white' : 'text-white/20')} />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-white/80">Instagram DM</p>
                        {connected ? (
                            <p className="text-[10px] text-pink-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> @{igUsername || 'connected'}
                            </p>
                        ) : (
                            <p className="text-[10px] text-white/30">Холбогдоогүй...</p>
                        )}
                    </div>
                </div>

                {connected && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                        <div className="flex gap-2">
                            <div className="w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0">
                                <span className="text-[8px]">💬</span>
                            </div>
                            <div className="bg-[#151040] rounded-xl rounded-tl-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-white/60">Үнэ хэд вэ?</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <div className="bg-pink-500/20 rounded-xl rounded-tr-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-pink-300 flex items-center gap-1">
                                    <Bot className="w-3 h-3" />
                                    AI хариулж байна...
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Step 4: Products Preview ─── */
function ProductsPreview({ products, shopName }: {
    products: Array<{ name: string; price?: number }>; shopName: string;
}) {
    const displayProducts = products.length > 0
        ? products.slice(0, 4)
        : [
            { name: 'Бүтээгдэхүүн нэмнэ үү...', price: 0 },
        ];

    return (
        <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-white/60">Бүтээгдэхүүн</p>
                <span className="text-[10px] text-blue-400 font-medium">{products.length} бараа</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {displayProducts.map((p, i) => (
                    <div
                        key={i}
                        className={cn(
                            'rounded-xl border p-2.5 transition-all duration-500',
                            products.length > 0
                                ? 'bg-[#0F0B2E] border-white/[0.08]'
                                : 'bg-[#0D0928] border-white/[0.04] border-dashed'
                        )}
                    >
                        <div className={cn(
                            'w-full aspect-square rounded-lg mb-2 flex items-center justify-center',
                            products.length > 0 ? 'bg-gradient-to-br from-violet-500/10 to-indigo-500/10' : 'bg-[#0F0B2E]'
                        )}>
                            <Package className={cn('w-5 h-5', products.length > 0 ? 'text-violet-400/50' : 'text-white/10')} />
                        </div>
                        <p className="text-[10px] font-medium text-white/60 truncate">{p.name}</p>
                        {p.price ? (
                            <p className="text-[10px] font-bold text-blue-400 mt-0.5">₮{p.price.toLocaleString()}</p>
                        ) : (
                            <p className="text-[9px] text-white/20 mt-0.5">—</p>
                        )}
                    </div>
                ))}

                {/* Empty slots */}
                {products.length > 0 && products.length < 4 && Array.from({ length: 4 - Math.min(products.length, 4) }).map((_, i) => (
                    <div key={`empty-${i}`} className="rounded-xl border border-dashed border-white/[0.04] p-2.5">
                        <div className="w-full aspect-square rounded-lg bg-[#0D0928] mb-2 flex items-center justify-center">
                            <span className="text-white/10 text-lg">+</span>
                        </div>
                        <p className="text-[9px] text-white/15">Нэмэх</p>
                    </div>
                ))}
            </div>

            {/* Chat bubble hint */}
            <div className="rounded-xl bg-[#0F0B2E] border border-white/[0.04] p-2.5">
                <p className="text-[9px] text-white/25 flex items-center gap-1.5">
                    <Bot className="w-3 h-3" />
                    AI таны барааг хэрэглэгчдэд санал болгоно
                </p>
            </div>
        </div>
    );
}

/* ─── Step 5: AI Preview ─── */
function AIPreview({ emotion, shopName }: {
    emotion: string; shopName: string;
}) {
    const emotionTexts: Record<string, string> = {
        friendly: 'Баярлалаа! Танд хэрхэн туслах вэ? 😊',
        professional: 'Сайн байна уу. Танд юугаар туслах вэ?',
        humorous: 'Ёооо, сайн уу! Юу хэрэгтэй вэ? 😄',
    };
    const botResponse = emotionTexts[emotion] || 'AI тохиргоог хийгээрэй...';

    return (
        <div className="space-y-3 animate-fade-in">
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 p-3">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-white/80">Syncly AI</p>
                        <p className="text-[9px] text-violet-400">
                            {emotion ? `${emotion === 'friendly' ? 'Найрсаг' : emotion === 'professional' ? 'Мэргэжилтэн' : 'Хөгжилтэй'} горим` : 'Тохируулж байна...'}
                        </p>
                    </div>
                </div>

                {/* Chat simulation */}
                <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                    <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#1C1650] flex items-center justify-center shrink-0">
                            <span className="text-[8px]">👤</span>
                        </div>
                        <div className="bg-[#151040] rounded-xl rounded-tl-sm px-2.5 py-1.5">
                            <p className="text-[10px] text-white/60">Сайн байна уу</p>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <div className="bg-violet-500/20 rounded-xl rounded-tr-sm px-2.5 py-1.5 max-w-[200px]">
                            <p className="text-[10px] text-violet-300">{botResponse}</p>
                        </div>
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <Bot className="w-3 h-3 text-white" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Features indicators */}
            <div className="grid grid-cols-2 gap-2">
                {['Автомат хариулт', 'Бараа зөвлөгөө', 'Захиалга авах', 'FAQ хариулт'].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#0F0B2E] border border-white/[0.04]">
                        <Sparkles className="w-3 h-3 text-blue-400/50" />
                        <span className="text-[9px] text-white/40">{f}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Step 6: Completion ─── */
function CompletionPreview({ shopName }: { shopName: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-[14px] font-bold text-white/90 mb-1">{shopName}</p>
            <p className="text-[11px] text-white/40 mb-4">бэлэн боллоо! 🎉</p>

            <div className="flex items-center gap-2">
                {[
                    { icon: Facebook, color: 'bg-blue-500/20 text-blue-400' },
                    { icon: Instagram, color: 'bg-pink-500/20 text-pink-400' },
                    { icon: Bot, color: 'bg-violet-500/20 text-violet-400' },
                ].map(({ icon: Icon, color }, i) => (
                    <div key={i} className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
                        <Icon className="w-4 h-4" />
                    </div>
                ))}
            </div>

            <p className="text-[9px] text-white/25 mt-4 max-w-[180px]">
                Бүх суваг холбогдсон • AI идэвхтэй • Dashboard бэлэн
            </p>
        </div>
    );
}
