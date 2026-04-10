'use client';
import { useState, useEffect } from 'react';
import { Crown, Check, Zap, BarChart3, Package, MessageSquare, Bot, Calendar, Download, CreditCard, Loader2, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

interface Plan { id: string; name: string; price_monthly: number; price_yearly: number; features: string[]; limits: { products: number; orders: number; messages: number }; highlighted?: boolean; }
export default function SubscriptionPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPlan, setCurrentPlan] = useState('starter');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [usage, setUsage] = useState({ products: 0, orders: 0, messages: 0 });
    const [billingHistory, setBillingHistory] = useState<any[]>([]);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [upgrading, setUpgrading] = useState(false);

    useEffect(() => { fetchData(); }, []);

    async function fetchData(refresh = false) {
        try {
            if (!refresh) setLoading(true);
            const headers = { 'x-shop-id': localStorage.getItem('smarthub_active_shop_id') || '' };
            const [subRes, plansRes] = await Promise.all([
                fetch('/api/subscription/current', { headers }),
                fetch('/api/subscription/plans')
            ]);
            let fetchedPlans: Plan[] = [];
            if (plansRes.ok) {
                const { plans: p } = await plansRes.json();
                fetchedPlans = p.map((plan: any) => {
                    const feats = typeof plan.features === 'object' && plan.features ? plan.features : {};
                    const lmt = typeof plan.limits === 'object' && plan.limits ? plan.limits : {};

                    // Dynamically build string features from JSON boolean flags
                    const mappedFeatures: string[] = [];
                    if (lmt.max_products > 0) mappedFeatures.push(`${lmt.max_products} бараа`);
                    else if (lmt.max_products === -1) mappedFeatures.push('Хязгааргүй бараа');

                    if (lmt.max_messages > 0) mappedFeatures.push(`${lmt.max_messages} мессеж/сар`);
                    else if (lmt.max_messages === -1) mappedFeatures.push('Хязгааргүй мессеж');

                    if (feats.ai_enabled) mappedFeatures.push('AI чатбот');
                    if (feats.shops_limit > 1) mappedFeatures.push('Бүх платформ (FB/IG)');
                    else mappedFeatures.push('Facebook холболт');
                    if (feats.analytics && feats.analytics !== 'none') mappedFeatures.push('Тайлан & Analytics');
                    if (feats.priority_support) mappedFeatures.push('Priority support');

                    return {
                        id: plan.slug || plan.id,
                        name: plan.name,
                        price_monthly: plan.price_monthly || 0,
                        price_yearly: plan.price_yearly || 0,
                        features: mappedFeatures,
                        limits: {
                            products: lmt.max_products > 0 ? lmt.max_products : 99999,
                            orders: lmt.max_customers > 0 ? lmt.max_customers : 99999, // fallback mapping 
                            messages: lmt.max_messages > 0 ? lmt.max_messages : 99999
                        },
                        highlighted: plan.is_featured
                    }
                });

                // Sort to keep deterministic order
                setPlans(fetchedPlans);
            }

            if (subRes.ok) {
                const d = await subRes.json();
                if (d.plan) { setCurrentPlan(d.plan.slug); }
                setUsage(d.usage || { products: 0, orders: 0, messages: 0 });
                setBillingHistory(d.invoices || []);
            }
        } catch (e) { logger.error('Алдаа гарлаа', { error: e }); } finally { setLoading(false); }
    }

    const safePlans = plans.length > 0 ? plans : [
        { id: 'starter', name: 'Уншиж байна...', price_monthly: 0, price_yearly: 0, features: [], limits: { products: 0, orders: 0, messages: 0 } }
    ];
    const PLANS = safePlans;
    const plan = PLANS.find(p => p.id === currentPlan) || PLANS[0];
    const usageItems = [
        { label: 'Бүтээгдэхүүн', value: usage.products, max: plan.limits.products, icon: Package },
        { label: 'Захиалга', value: usage.orders, max: plan.limits.orders, icon: BarChart3 },
        { label: 'Мессеж', value: usage.messages, max: plan.limits.messages, icon: MessageSquare }
    ];

    const cardCls = "bg-[#0F0B2E] rounded-lg border border-white/[0.08]";
    const labelCls = "text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]";

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" /></div>;

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Current Plan */}
            <div className={`${cardCls} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#4A7CE7]/10 flex items-center justify-center"><Crown className="w-5 h-5 text-[#4A7CE7]" strokeWidth={1.5} /></div>
                        <div><p className="text-[15px] font-semibold text-foreground tracking-[-0.02em]">{plan.name} План</p><p className="text-[11px] text-white/40">Идэвхтэй захиалга</p></div>
                    </div>
                    <div className="text-right">
                        <p className="text-[22px] font-bold text-foreground tabular-nums">₮{(billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly).toLocaleString()}</p>
                        <p className="text-[11px] text-white/40">{billingCycle === 'monthly' ? '/сар' : '/жил'}</p>
                    </div>
                </div>
                {/* Usage Bars */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/[0.04]">
                    {usageItems.map(u => {
                        const pct = u.max >= 99999 ? 5 : Math.min((u.value / u.max) * 100, 100);
                        return (
                            <div key={u.label}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className={labelCls}>{u.label}</span>
                                    <span className="text-[12px] font-medium text-foreground tabular-nums">{u.value}{u.max < 99999 ? `/${u.max}` : ''}</span>
                                </div>
                                <div className="h-1.5 bg-[#0F0B2E] rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-blue-500' : 'bg-[#4A7CE7]'}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3">
                <span className={`text-[13px] ${billingCycle === 'monthly' ? 'text-foreground font-medium' : 'text-white/40'}`}>Сарын</span>
                <button onClick={() => setBillingCycle(c => c === 'monthly' ? 'yearly' : 'monthly')} className="relative w-11 h-6 rounded-full bg-[#151040] transition-colors">
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-all ${billingCycle === 'yearly' ? 'left-6' : 'left-1'}`} />
                </button>
                <span className={`text-[13px] ${billingCycle === 'yearly' ? 'text-foreground font-medium' : 'text-white/40'}`}>Жилийн <span className="text-[#4A7CE7] text-[11px]">-17%</span></span>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map(p => {
                    const isCurrent = p.id === currentPlan;
                    const price = billingCycle === 'monthly' ? p.price_monthly : p.price_yearly;
                    return (
                        <div key={p.id} className={`${cardCls} p-5 relative ${p.highlighted ? 'border-[#4A7CE7]/30' : ''} ${isCurrent ? 'ring-1 ring-[#4A7CE7]/50' : ''}`}>
                            {p.highlighted && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-[#4A7CE7] text-white text-[10px] font-medium rounded-full tracking-wide">POPULAR</div>}
                            <h4 className="text-[14px] font-semibold text-foreground tracking-[-0.01em]">{p.name}</h4>
                            <p className="text-[24px] font-bold text-foreground mt-2 tabular-nums">₮{price.toLocaleString()}<span className="text-[12px] font-normal text-white/40">/{billingCycle === 'monthly' ? 'сар' : 'жил'}</span></p>
                            <ul className="mt-4 space-y-2">
                                {p.features.map(f => <li key={f} className="flex items-center gap-2 text-[12px] text-white/60"><Check className="w-3.5 h-3.5 text-[#4A7CE7] flex-shrink-0" strokeWidth={1.5} />{f}</li>)}
                            </ul>
                            <button
                                onClick={() => { if (!isCurrent) { setSelectedPlan(p.id); setShowUpgrade(true); } }}
                                disabled={isCurrent}
                                className={`w-full mt-5 py-2 rounded-md text-[12px] font-medium transition-all ${isCurrent ? 'bg-[#0F0B2E] text-white/30 cursor-default' : p.highlighted ? 'bg-[#4A7CE7] text-white hover:bg-[#3A6BD4]' : 'bg-foreground text-background hover:opacity-80'}`}
                            >{isCurrent ? 'Одоогийн план' : 'Сонгох'}</button>
                        </div>
                    );
                })}
            </div>

            {/* Billing History */}
            {billingHistory.length > 0 && (
                <div className={`${cardCls} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-white/[0.04]">
                        <h3 className="text-[14px] font-semibold text-foreground tracking-[-0.02em]">Төлбөрийн түүх</h3>
                    </div>
                    <table className="w-full">
                        <thead><tr className="border-b border-white/[0.04]">
                            <th className="text-left px-5 py-2.5 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">Огноо</th>
                            <th className="text-left px-5 py-2.5 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">Тайлбар</th>
                            <th className="text-right px-5 py-2.5 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">Дүн</th>
                        </tr></thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {billingHistory.map((b, i) => (
                                <tr key={i} className="hover:bg-[#0D0928]">
                                    <td className="px-5 py-3 text-[12px] text-white/60">{new Date(b.date).toLocaleDateString('mn-MN')}</td>
                                    <td className="px-5 py-3 text-[12px] text-foreground">{b.description}</td>
                                    <td className="px-5 py-3 text-right text-[12px] font-medium text-foreground tabular-nums">₮{Number(b.amount).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Upgrade Modal */}
            {showUpgrade && selectedPlan && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0220] rounded-lg border border-white/[0.08] w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[15px] font-semibold text-foreground tracking-[-0.02em]">Шинэчлэх</h3>
                            <button onClick={() => setShowUpgrade(false)} className="p-1 hover:bg-[#0F0B2E] rounded-md"><X className="w-4 h-4 text-white/30" strokeWidth={1.5} /></button>
                        </div>
                        <p className="text-[13px] text-white/50 mb-5">{PLANS.find(p => p.id === selectedPlan)?.name} план руу шинэчлэх</p>
                        <p className="text-[11px] text-white/40 mb-3">QPay-ээр төлөх</p>
                        <div className="w-40 h-40 bg-[#0D0928] border border-white/[0.08] rounded-lg mx-auto flex items-center justify-center mb-4">
                            <div className="w-full h-full bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://qpay.mn/mock')] bg-contain bg-no-repeat bg-center opacity-60" />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowUpgrade(false)} className="flex-1 py-2 border border-white/[0.08] rounded-md text-[12px] font-medium text-foreground hover:border-white/[0.15] transition-colors">Болих</button>
                            <button onClick={() => { setUpgrading(true); setTimeout(() => { setUpgrading(false); setShowUpgrade(false); fetchData(true); toast.success('Амжилттай шинэчлэгдлээ'); }, 2000); }} className="flex-1 py-2 bg-[#4A7CE7] text-white rounded-md text-[12px] font-medium hover:bg-[#3A6BD4] transition-colors flex items-center justify-center gap-1.5">
                                {upgrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />}Төлбөр шалгах
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
