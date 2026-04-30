'use client';

import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RefreshCw } from 'lucide-react';
import LeadsReport from './leads/page';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const [refreshing, setRefreshing] = useState(false);

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

            <LeadsReport />
        </div>
    );
}
