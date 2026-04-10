'use client';

import { useState } from 'react';

export default function AITestPage() {
    const [message, setMessage] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const testAI = async () => {
        if (!message.trim()) return;

        setLoading(true);
        setError('');
        setResponse('');

        try {
            const res = await fetch('/api/chat/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    shopContext: {
                        shopName: 'Demo Shop',
                        products: ['iPhone 15', 'Samsung S24', 'MacBook Pro']
                    }
                })
            });

            const data = await res.json();

            if (data.success) {
                setResponse(data.message);
            } else {
                setError(data.error || 'Unknown error');
            }
        } catch (err: unknown) {
            setError((err instanceof Error ? err.message : String(err)));
        } finally {
            setLoading(false);
        }
    };

    const exampleQuestions = [
        'Сайн байна уу?',
        'Ямар бүтээгдэхүүн байгаа вэ?',
        'iPhone 15 үнэ хэд вэ?',
        'Захиалга өгөх боломжтой юу?'
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-white mb-2">🤖 AI Chat Test</h1>
                <p className="text-gray-400 mb-8">Gemini AI integration test</p>

                {/* Example Questions */}
                <div className="mb-6">
                    <p className="text-sm text-gray-400 mb-2">Жишээ асуултууд:</p>
                    <div className="flex flex-wrap gap-2">
                        {exampleQuestions.map((q, i) => (
                            <button
                                key={i}
                                onClick={() => setMessage(q)}
                                className="px-3 py-1 bg-purple-600/30 text-purple-300 rounded-full text-sm hover:bg-purple-600/50 transition"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Input */}
                <div className="flex gap-3 mb-6">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && testAI()}
                        placeholder="Мессеж бичнэ үү..."
                        className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                        onClick={testAI}
                        disabled={loading || !message.trim()}
                        className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {loading ? '...' : 'Илгээх'}
                    </button>
                </div>

                {/* Response */}
                {response && (
                    <div className="p-6 bg-green-500/20 border border-green-500/30 rounded-xl">
                        <p className="text-sm text-green-400 mb-2">✅ AI Хариулт:</p>
                        <p className="text-white whitespace-pre-wrap">{response}</p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="p-6 bg-red-500/20 border border-red-500/30 rounded-xl">
                        <p className="text-sm text-red-400 mb-2">❌ Алдаа:</p>
                        <p className="text-red-300">{error}</p>
                    </div>
                )}

                {/* Status */}
                <div className="mt-8 p-4 bg-white/5 rounded-xl">
                    <h3 className="text-white font-medium mb-3">📊 API Status</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Gemini API</span>
                            <span className="text-green-400">● Connected</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Model</span>
                            <span className="text-gray-300">gemini-1.5-flash</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
