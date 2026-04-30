'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Plus, Trash2, Edit2, X, Check, Quote } from 'lucide-react';
import type { Slogan } from './types';

interface SlogansTabProps {
    slogans: Slogan[];
    setSlogans: (v: Slogan[]) => void;
    editingSlogan: Partial<Slogan> | null;
    setEditingSlogan: (v: Partial<Slogan> | null) => void;
    setError: (v: string | null) => void;
}

export default function SlogansTab({ slogans, setSlogans, editingSlogan, setEditingSlogan, setError }: SlogansTabProps) {
    async function saveSlogan() {
        if (!editingSlogan?.slogan) return;
        try {
            const isNew = !editingSlogan.id;
            const res = await fetch('/api/ai-settings', {
                method: isNew ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'slogans', ...editingSlogan }),
            });
            if (!res.ok) throw new Error('Failed to save Slogan');
            const { data } = await res.json();
            if (isNew) setSlogans([...slogans, data]);
            else setSlogans(slogans.map(s => s.id === data.id ? data : s));
            setEditingSlogan(null);
        } catch (err: any) { setError(err.message); }
    }

    async function deleteSlogan(id: string) {
        try {
            await fetch(`/api/ai-settings?type=slogans&id=${id}`, { method: 'DELETE' });
            setSlogans(slogans.filter(s => s.id !== id));
        } catch (err: any) { setError(err.message); }
    }

    const contextLabels: Record<string, string> = { greeting: 'Мэндчилгээ', closing: 'Баяртай', promotion: 'Хямдрал', any: 'Дурын' };
    const contextColors: Record<string, string> = { greeting: 'bg-status-success-soft text-status-success', closing: 'bg-status-info-soft text-status-info', promotion: 'bg-status-pending-soft text-status-pending', any: 'bg-surface-2 text-foreground' };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Тусгай хэллэгүүд</h2>
                <Button onClick={() => setEditingSlogan({ slogan: '', usage_context: 'any' })}><Plus className="w-4 h-4 mr-2" /> Нэмэх</Button>
            </div>

            {editingSlogan && (
                <Card className="border-brand/30 bg-brand-soft">
                    <CardContent className="p-4 space-y-4">
                        <Textarea placeholder="Хэллэг" value={editingSlogan.slogan || ''} onChange={(e) => setEditingSlogan({ ...editingSlogan, slogan: e.target.value })} rows={2} />
                        <select value={editingSlogan.usage_context || 'any'} onChange={(e) => setEditingSlogan({ ...editingSlogan, usage_context: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg">
                            <option value="any">Дурын үед</option>
                            <option value="greeting">Мэндчилгээнд</option>
                            <option value="closing">Баяртай хэлэхэд</option>
                            <option value="promotion">Хямдрал дурдахад</option>
                        </select>
                        <div className="flex gap-2">
                            <Button onClick={saveSlogan} size="sm"><Check className="w-4 h-4 mr-1" /> Хадгалах</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingSlogan(null)}><X className="w-4 h-4 mr-1" /> Цуцлах</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {slogans.length === 0 && !editingSlogan ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground"><Quote className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" /><p>Хэллэг байхгүй.</p></CardContent></Card>
            ) : (
                <div className="space-y-3">
                    {slogans.map((slogan) => (
                        <Card key={slogan.id}>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <p className="font-medium text-foreground">&quot;{slogan.slogan}&quot;</p>
                                        <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded ${contextColors[slogan.usage_context] || contextColors.any}`}>
                                            {contextLabels[slogan.usage_context] || 'Дурын'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditingSlogan(slogan)} className="p-2 text-muted-foreground/70 hover:text-brand-strong"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => deleteSlogan(slogan.id)} className="p-2 text-muted-foreground/70 hover:text-status-danger"><Trash2 className="w-4 h-4" /></button>
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
