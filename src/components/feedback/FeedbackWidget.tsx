/**
 * Feedback Widget - Bug report and support button
 */

'use client';

import { useState } from 'react';
import { MessageCircle, Bug, HelpCircle, X, Send, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type FeedbackType = 'bug' | 'feature' | 'support';

interface FeedbackState {
    type: FeedbackType;
    message: string;
    email: string;
}

export function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState>({
        type: 'bug',
        message: '',
        email: ''
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);

        try {
            // Send feedback to API
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(feedback)
            });

            setSent(true);
            setTimeout(() => {
                setIsExpanded(false);
                setSent(false);
                setFeedback({ type: 'bug', message: '', email: '' });
            }, 2000);
        } catch (error) {
            console.error('Feedback error:', error);
        } finally {
            setSending(false);
        }
    }

    const feedbackTypes = [
        { id: 'bug' as FeedbackType, icon: Bug, label: 'Алдаа мэдэгдэх', color: 'text-status-danger' },
        { id: 'feature' as FeedbackType, icon: MessageCircle, label: 'Санал хүсэлт', color: 'text-status-info' },
        { id: 'support' as FeedbackType, icon: HelpCircle, label: 'Тусламж', color: 'text-green-500' }
    ];

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {/* Expanded Form */}
            {isExpanded && (
                <div className="absolute bottom-16 right-0 w-80 bg-surface rounded-2xl shadow-2xl border border-border/60 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-brand to-purple-600 px-4 py-3 flex items-center justify-between">
                        <span className="text-white font-medium">Санал хүсэлт</span>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="text-white/80 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {sent ? (
                        <div className="p-8 text-center">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <p className="font-medium text-foreground">Баярлалаа!</p>
                            <p className="text-sm text-muted-foreground">Таны санал хүсэлт илгээгдлээ</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            {/* Type Selection */}
                            <div className="flex gap-2">
                                {feedbackTypes.map(type => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setFeedback(f => ({ ...f, type: type.id }))}
                                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${feedback.type === type.id
                                                ? 'border-brand bg-brand-soft'
                                                : 'border-border hover:border-border-strong'
                                            }`}
                                    >
                                        <type.icon className={`w-5 h-5 ${type.color}`} />
                                        <span className="text-xs text-muted-foreground">{type.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Message */}
                            <textarea
                                value={feedback.message}
                                onChange={e => setFeedback(f => ({ ...f, message: e.target.value }))}
                                placeholder={
                                    feedback.type === 'bug'
                                        ? 'Ямар алдаа гарсан бэ? Алхмуудыг дэлгэрэнгүй бичнэ үү...'
                                        : feedback.type === 'feature'
                                            ? 'Ямар функц нэмээсэй гэж хүсч байна вэ?'
                                            : 'Бид яаж туслах вэ?'
                                }
                                className="w-full h-24 px-3 py-2 text-sm border border-border rounded-lg resize-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                required
                            />

                            {/* Email (optional) */}
                            <input
                                type="email"
                                value={feedback.email}
                                onChange={e => setFeedback(f => ({ ...f, email: e.target.value }))}
                                placeholder="Имэйл (заавал биш)"
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                            />

                            <Button type="submit" className="w-full" disabled={sending || !feedback.message}>
                                {sending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Send className="w-4 h-4 mr-2" />
                                )}
                                Илгээх
                            </Button>
                        </form>
                    )}
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) setIsExpanded(false);
                }}
                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${isOpen
                        ? 'bg-foreground rotate-45'
                        : 'bg-gradient-to-r from-brand to-purple-600 hover:shadow-xl hover:scale-105'
                    }`}
            >
                {isOpen ? (
                    <X className="w-6 h-6 text-white" />
                ) : (
                    <MessageCircle className="w-6 h-6 text-white" />
                )}
            </button>

            {/* Quick Actions */}
            {isOpen && !isExpanded && (
                <div className="absolute bottom-16 right-0 flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-200">
                    {feedbackTypes.map((type, i) => (
                        <button
                            key={type.id}
                            onClick={() => {
                                setFeedback(f => ({ ...f, type: type.id }));
                                setIsExpanded(true);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 bg-surface rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
                            style={{ animationDelay: `${i * 50}ms` }}
                        >
                            <type.icon className={`w-5 h-5 ${type.color}`} />
                            <span className="text-sm font-medium text-foreground">{type.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
