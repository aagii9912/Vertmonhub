'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { useConversations } from '@/hooks/useConversations';
import { MessageSquare, RefreshCcw, User } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils/date';

export default function InboxPage() {
    const { data: conversations = [], isLoading, refetch } = useConversations();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const filtered = conversations.filter((c: any) =>
        (c.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()),
    );

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-140px)] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Inbox"
                title="Мессеж"
                subtitle={`Нийт ${conversations.length} харилцан ярилцлага`}
                primaryAction={
                    <Button onClick={() => refetch()} variant="secondary" size="sm">
                        <RefreshCcw className="w-4 h-4" /> Шинэчлэх
                    </Button>
                }
            />

            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэрээр хайх...',
                }}
                showClear={searchQuery !== ''}
                onClear={() => setSearchQuery('')}
            />

            {filtered.length === 0 ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<MessageSquare className="w-7 h-7" />} title="Мессеж байхгүй" />
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filtered.map((conv: any) => (
                        <Card
                            key={conv.id}
                            hover
                            className="cursor-pointer"
                            onClick={() => setSelectedId(conv.id)}
                        >
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center flex-shrink-0">
                                    <User className="w-5 h-5 text-brand-strong" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">
                                        {conv.customer_name || 'Харилцагч'}
                                    </p>
                                    <p className="text-sm text-muted-foreground truncate">
                                        {conv.last_message || 'Мессеж байхгүй'}
                                    </p>
                                </div>
                                <div className="text-xs text-muted-foreground/70 flex-shrink-0">
                                    {conv.updated_at ? formatTimeAgo(conv.updated_at) : ''}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
