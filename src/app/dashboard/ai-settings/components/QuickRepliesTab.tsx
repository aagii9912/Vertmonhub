'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Plus, Trash2, Edit2, X, Check, MessageCircle } from 'lucide-react';
import type { QuickReply } from './types';

interface QuickRepliesTabProps {
    quickReplies: QuickReply[];
    setQuickReplies: (v: QuickReply[]) => void;
    editingQuickReply: Partial<QuickReply> | null;
    setEditingQuickReply: (v: Partial<QuickReply> | null) => void;
    setError: (v: string | null) => void;
}

export default function QuickRepliesTab({ quickReplies, setQuickReplies, editingQuickReply, setEditingQuickReply, setError }: QuickRepliesTabProps) {
    async function saveQuickReply() {
        if (!editingQuickReply?.name || !editingQuickReply?.response) return;
        try {
            const isNew = !editingQuickReply.id;
            const res = await fetch('/api/ai-settings', {
                method: isNew ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'quick_replies', ...editingQuickReply,
                    trigger_words: typeof editingQuickReply.trigger_words === 'string'
                        ? editingQuickReply.trigger_words
                        : editingQuickReply.trigger_words?.join(', ')
                }),
            });
            if (!res.ok) throw new Error('Failed to save Quick Reply');
            const { data } = await res.json();
            if (isNew) setQuickReplies([...quickReplies, data]);
            else setQuickReplies(quickReplies.map(q => q.id === data.id ? data : q));
            setEditingQuickReply(null);
        } catch (err: any) { setError(err.message); }
    }

    async function deleteQuickReply(id: string) {
        try {
            await fetch(`/api/ai-settings?type=quick_replies&id=${id}`, { method: 'DELETE' });
            setQuickReplies(quickReplies.filter(q => q.id !== id));
        } catch (err: any) { setError(err.message); }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Хурдан хариултууд</h2>
                <Button onClick={() => setEditingQuickReply({ name: '', trigger_words: [], response: '' })}>
                    <Plus className="w-4 h-4 mr-2" /> Нэмэх
                </Button>
            </div>

            {editingQuickReply && (
                <Card className="border-brand/30 bg-brand-soft">
                    <CardContent className="p-4 space-y-4">
                        <Input placeholder="Нэр (жишээ: Үнэ асуулт)" value={editingQuickReply.name || ''} onChange={(e) => setEditingQuickReply({ ...editingQuickReply, name: e.target.value })} />
                        <Input
                            placeholder="Trigger үгс (таслалаар: үнэ, хэд вэ, price)"
                            value={Array.isArray(editingQuickReply.trigger_words) ? editingQuickReply.trigger_words.join(', ') : editingQuickReply.trigger_words || ''}
                            onChange={(e) => setEditingQuickReply({ ...editingQuickReply, trigger_words: e.target.value as any })}
                        />
                        <Textarea placeholder="Хариулт" value={editingQuickReply.response || ''} onChange={(e) => setEditingQuickReply({ ...editingQuickReply, response: e.target.value })} rows={3} />
                        <div className="flex gap-2">
                            <Button onClick={saveQuickReply} size="sm"><Check className="w-4 h-4 mr-1" /> Хадгалах</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingQuickReply(null)}><X className="w-4 h-4 mr-1" /> Цуцлах</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {quickReplies.length === 0 && !editingQuickReply ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground"><MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" /><p>Хурдан хариулт байхгүй.</p></CardContent></Card>
            ) : (
                <div className="space-y-3">
                    {quickReplies.map((qr) => (
                        <Card key={qr.id}>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <p className="font-medium text-foreground">{qr.name}</p>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {qr.trigger_words.map((word, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-brand-soft text-brand-strong text-xs rounded">{word}</span>
                                            ))}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-2">{qr.response}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditingQuickReply(qr)} className="p-2 text-muted-foreground/70 hover:text-brand-strong"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => deleteQuickReply(qr.id)} className="p-2 text-muted-foreground/70 hover:text-status-danger"><Trash2 className="w-4 h-4" /></button>
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
