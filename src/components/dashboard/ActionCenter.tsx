'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils/date';
import {
    AlertTriangle,
    MessageSquare,
    CheckCircle2,
    XCircle,
} from 'lucide-react';

interface Conversation {
    customerId: string;
    customerName: string;
    messageCount: number;
    lastMessage: string;
    lastMessageAt: string;
    lastIntent: string | null;
    isAnswered: boolean;
}

interface ActionCenterProps {
    conversations: Conversation[];
    unansweredCount: number;
}

export function ActionCenter({
    conversations,
    unansweredCount,
}: ActionCenterProps) {
    const hasIssues = unansweredCount > 0;

    const getUrgencyColor = (dateString: string) => {
        const minutes = (Date.now() - new Date(dateString).getTime()) / 60000;
        if (minutes > 30) return 'text-status-danger';
        if (minutes > 10) return 'text-status-pending';
        return 'text-muted-foreground';
    };

    const getUrgencyBg = (dateString: string) => {
        const minutes = (Date.now() - new Date(dateString).getTime()) / 60000;
        if (minutes > 30) return 'bg-status-danger-soft border-status-danger/30';
        if (minutes > 10) return 'bg-status-pending-soft border-status-pending/30';
        return 'bg-secondary/50 border-border';
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <AlertTriangle className={`w-4 h-4 md:w-5 md:h-5 ${hasIssues ? 'text-status-pending' : 'text-status-success'}`} />
                    Анхаарал хэрэгтэй
                </CardTitle>
                {hasIssues && (
                    <Badge variant="danger" className="text-[10px] md:text-xs">
                        {unansweredCount}
                    </Badge>
                )}
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
                {/* Хариулаагүй харилцагчид */}
                {unansweredCount > 0 && (
                    <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-4 h-4 text-status-danger" />
                            <span className="text-sm font-medium text-foreground">
                                Хариулаагүй ({unansweredCount})
                            </span>
                        </div>
                        <div className="space-y-2">
                            {conversations
                                .filter(c => !c.isAnswered)
                                .slice(0, 3)
                                .map(conv => (
                                    <Link
                                        key={conv.customerId}
                                        href="/dashboard/customers"
                                        className={`block p-3 rounded-xl border transition-colors hover:bg-secondary/30 ${getUrgencyBg(conv.lastMessageAt)}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-xs font-medium text-status-success">
                                                        {conv.customerName.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium text-sm text-foreground truncate">
                                                            {conv.customerName}
                                                        </p>
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                                                            {conv.messageCount} мессеж
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                        &quot;{conv.lastMessage}&quot;
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                <span className={`text-[10px] ${getUrgencyColor(conv.lastMessageAt)}`}>
                                                    {formatTimeAgo(conv.lastMessageAt)}
                                                </span>
                                                <XCircle className="w-4 h-4 text-status-danger" />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!hasIssues && (
                    <div className="p-8 text-center">
                        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-status-success" />
                        <p className="text-sm text-muted-foreground">
                            Бүгд хэвийн байна! 🎉
                        </p>
                    </div>
                )}

                {/* Хариулсан харилцагчид */}
                {conversations.filter(c => c.isAnswered).length > 0 && unansweredCount === 0 && (
                    <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-4 h-4 text-status-success" />
                            <span className="text-sm font-medium text-foreground">
                                Сүүлийн харилцаанууд
                            </span>
                        </div>
                        <div className="space-y-2">
                            {conversations
                                .filter(c => c.isAnswered)
                                .slice(0, 3)
                                .map(conv => (
                                    <Link
                                        key={conv.customerId}
                                        href="/dashboard/customers"
                                        className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-full bg-status-success-soft flex items-center justify-center flex-shrink-0">
                                                <span className="text-xs font-medium text-status-success">
                                                    {conv.customerName.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm text-foreground truncate">
                                                    {conv.customerName}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground">
                                                {formatTimeAgo(conv.lastMessageAt)}
                                            </span>
                                            <CheckCircle2 className="w-4 h-4 text-status-success" />
                                        </div>
                                    </Link>
                                ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
