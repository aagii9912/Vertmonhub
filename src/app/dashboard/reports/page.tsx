'use client';

import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RefreshCw, Users, Building2 } from 'lucide-react';
import LeadsReport from './leads/page';
import PropertiesReport from './properties/page';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type Tab = 'leads' | 'properties';

export default function ReportsPage() {
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('leads');

    return (
        <div>
            <PageHeader
                eyebrow="Аналитик"
                title="Тайлан & Шинжилгээ"
                subtitle="Үл хөдлөхийн борлуулалтын дэлгэрэнгүй шинжилгээ"
                primaryAction={
                    <Button
                        onClick={() => {
                            setRefreshing(true);
                            setTimeout(() => setRefreshing(false), 500);
                        }}
                        disabled={refreshing}
                        variant="secondary"
                        size="sm"
                    >
                        <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                        Шинэчлэх
                    </Button>
                }
            />

            <div className="flex gap-2 border-b border-border mb-6">
                <button
                    onClick={() => setActiveTab('leads')}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                        activeTab === 'leads'
                            ? 'text-brand-strong border-brand-strong'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                    )}
                >
                    <Users className="w-4 h-4" />
                    Lead-ууд
                </button>
                <button
                    onClick={() => setActiveTab('properties')}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                        activeTab === 'properties'
                            ? 'text-brand-strong border-brand-strong'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                    )}
                >
                    <Building2 className="w-4 h-4" />
                    Үл хөдлөх
                </button>
            </div>

            {activeTab === 'leads' ? <LeadsReport /> : <PropertiesReport />}
        </div>
    );
}
