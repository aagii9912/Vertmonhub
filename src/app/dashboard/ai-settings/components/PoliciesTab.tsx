'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Check, Save } from 'lucide-react';

interface PoliciesData {
    shipping_threshold: number;
    payment_methods: string[];
    delivery_areas: string[];
    return_policy: string;
}

interface PoliciesTabProps {
    policies: PoliciesData;
    setPolicies: (v: PoliciesData) => void;
    saving: boolean;
    setSaving: (v: boolean) => void;
    setSuccess: (v: boolean) => void;
    setError: (v: string | null) => void;
}

const paymentMethods = ['QPay', 'SocialPay', 'Бэлэн мөнгө', 'Дансаар', 'StorePay', 'Pocket'];

export default function PoliciesTab({ policies, setPolicies, saving, setSaving, setSuccess, setError }: PoliciesTabProps) {
    async function handleSave() {
        setSaving(true);
        try {
            await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policies }),
            });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) { setError(err.message); }
        finally { setSaving(false); }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="p-6">
                    <h2 className="font-semibold text-foreground mb-4">Бодлого & Дүрэм</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Хүргэлтийн үнэгүй болох дүн (₮)</label>
                            <Input type="number" value={policies.shipping_threshold} onChange={(e) => setPolicies({ ...policies, shipping_threshold: Number(e.target.value) })} />
                            <p className="text-xs text-muted-foreground mt-1">Энэ дүнгээс дээш хүргэлт үнэгүй.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Буцаалтын нөхцөл</label>
                            <Input value={policies.return_policy} onChange={(e) => setPolicies({ ...policies, return_policy: e.target.value })} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-foreground mb-1">Төлбөрийн хэлбэрүүд</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {paymentMethods.map(method => (
                                    <button key={method} onClick={() => {
                                        const current = policies.payment_methods || [];
                                        const newMethods = current.includes(method) ? current.filter(m => m !== method) : [...current, method];
                                        setPolicies({ ...policies, payment_methods: newMethods });
                                    }} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${policies.payment_methods?.includes(method) ? 'bg-brand-soft text-brand-strong border-brand/30' : 'bg-surface text-muted-foreground border-border hover:border-border-strong'}`}>
                                        {method}
                                        {policies.payment_methods?.includes(method) && <Check className="w-3 h-3 ml-1 inline-block" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-foreground mb-1">Хүргэлтийн бүсүүд</label>
                            <Textarea value={policies.delivery_areas?.join(', ')} onChange={(e) => setPolicies({ ...policies, delivery_areas: e.target.value.split(',').map(s => s.trim()) })} placeholder="Улаанбаатар, Хөдөө орон нутаг..." rows={2} />
                            <p className="text-xs text-muted-foreground mt-1">Таслалаар тусгаарлаж бичнэ үү.</p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button onClick={handleSave} disabled={saving}>
                            <Save className="w-4 h-4 mr-2" /> {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
