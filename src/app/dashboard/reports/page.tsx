'use client';

import { Button } from '@/components/ui/Button';
import { BarChart3, RefreshCw } from 'lucide-react';
import LeadsReport from './leads/page';
import { useState } from 'react';

export default function ReportsPage() {
    const [refreshing, setRefreshing] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-primary" />
                        Тайлан & Шинжилгээ
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Үл хөдлөхийн борлуулалтын дэлгэрэнгүй шинжилгээ
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setRefreshing(true);
                        setTimeout(() => setRefreshing(false), 500);
                    }}
                    disabled={refreshing}
                    variant="secondary"
                    size="sm"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Шинэчлэх
                </Button>
            </div>

            <LeadsReport />
        </div>
    );
}
