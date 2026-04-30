'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Plus, Trash2, Edit2, X, Check, HelpCircle } from 'lucide-react';
import type { FAQ } from './types';

interface FaqTabProps {
    faqs: FAQ[];
    setFaqs: (v: FAQ[]) => void;
    editingFaq: Partial<FAQ> | null;
    setEditingFaq: (v: Partial<FAQ> | null) => void;
    setError: (v: string | null) => void;
}

export default function FaqTab({ faqs, setFaqs, editingFaq, setEditingFaq, setError }: FaqTabProps) {
    async function saveFaq() {
        if (!editingFaq?.question || !editingFaq?.answer) return;
        try {
            const isNew = !editingFaq.id;
            const res = await fetch('/api/ai-settings', {
                method: isNew ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'faqs', ...editingFaq }),
            });
            if (!res.ok) throw new Error('Failed to save FAQ');
            const { data } = await res.json();
            if (isNew) setFaqs([...faqs, data]);
            else setFaqs(faqs.map(f => f.id === data.id ? data : f));
            setEditingFaq(null);
        } catch (err: any) { setError(err.message); }
    }

    async function deleteFaq(id: string) {
        try {
            await fetch(`/api/ai-settings?type=faqs&id=${id}`, { method: 'DELETE' });
            setFaqs(faqs.filter(f => f.id !== id));
        } catch (err: any) { setError(err.message); }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Түгээмэл асуултууд (FAQ)</h2>
                <Button onClick={() => setEditingFaq({ question: '', answer: '', category: 'general' })}>
                    <Plus className="w-4 h-4 mr-2" /> Нэмэх
                </Button>
            </div>

            {editingFaq && (
                <Card className="border-brand/30 bg-brand-soft">
                    <CardContent className="p-4 space-y-4">
                        <Input placeholder="Асуулт" value={editingFaq.question || ''} onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })} />
                        <Textarea placeholder="Хариулт" value={editingFaq.answer || ''} onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })} rows={3} />
                        <div className="flex gap-2">
                            <Button onClick={saveFaq} size="sm"><Check className="w-4 h-4 mr-1" /> Хадгалах</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingFaq(null)}><X className="w-4 h-4 mr-1" /> Цуцлах</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {faqs.length === 0 && !editingFaq ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground"><HelpCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" /><p>FAQ байхгүй байна.</p></CardContent></Card>
            ) : (
                <div className="space-y-3">
                    {faqs.map((faq) => (
                        <Card key={faq.id}>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <p className="font-medium text-foreground">{faq.question}</p>
                                        <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                                        <p className="text-xs text-muted-foreground/70 mt-2">Ашиглагдсан: {faq.usage_count}x</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditingFaq(faq)} className="p-2 text-muted-foreground/70 hover:text-brand-strong"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => deleteFaq(faq.id)} className="p-2 text-muted-foreground/70 hover:text-status-danger"><Trash2 className="w-4 h-4" /></button>
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
