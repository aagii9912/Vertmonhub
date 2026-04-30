'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Bot, Plus, Settings, MessageSquare, Zap, Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface AIAgent {
    id: string;
    name: string;
    description: string;
    type: string;
    status: string;
    model: string;
    total_conversations: number;
    avg_response_time_ms: number;
    satisfaction_rate: number;
}

export default function AgentsPage() {
    const { shop } = useAuth();
    const [agents, setAgents] = useState<AIAgent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('ai_agents')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setAgents(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-muted-foreground">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Bot className="w-6 h-6 text-status-success" />
                        AI Агентууд
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">AI туслагчдын тохиргоо</p>
                </div>
                <Button className="bg-status-success hover:opacity-90 text-white"><Plus className="w-4 h-4 mr-2" />Шинэ агент</Button>
            </div>

            {agents.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <Bot className="w-16 h-16 text-muted-foreground/60 mb-4" />
                        <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                        <p className="text-muted-foreground mb-4">AI агент нэмэхийн тулд "Шинэ агент" товчийг дарна уу.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents.map(agent => (
                        <Card key={agent.id} className="hover:shadow-md transition-all">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.status === 'active' ? 'bg-status-success-soft' : 'bg-surface-2'}`}>
                                            <Bot className={`w-5 h-5 ${agent.status === 'active' ? 'text-status-success' : 'text-muted-foreground/70'}`} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-foreground">{agent.name}</h3>
                                            <span className="text-xs text-muted-foreground">{agent.model}</span>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${agent.status === 'active' ? 'bg-status-success-soft text-status-success' : agent.status === 'error' ? 'bg-status-danger-soft text-status-danger' : 'bg-surface-2 text-muted-foreground'}`}>
                                        {agent.status === 'active' ? 'Идэвхтэй' : agent.status === 'error' ? 'Алдаа' : 'Идэвхгүй'}
                                    </span>
                                </div>
                                {agent.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{agent.description}</p>}
                                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-foreground">{agent.total_conversations}</p>
                                        <p className="text-xs text-muted-foreground">Харилцан яриа</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-foreground">{agent.avg_response_time_ms ? `${(agent.avg_response_time_ms / 1000).toFixed(1)}s` : '-'}</p>
                                        <p className="text-xs text-muted-foreground">Хариу хугацаа</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-foreground">{agent.satisfaction_rate ? `${agent.satisfaction_rate}%` : '-'}</p>
                                        <p className="text-xs text-muted-foreground">Сэтгэл ханамж</p>
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
