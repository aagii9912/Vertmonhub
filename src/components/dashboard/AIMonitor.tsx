import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Bot } from 'lucide-react';

/**
 * AI Monitor — KPI panel for AI conversation automation.
 *
 * NOTE: The metrics this panel is meant to show (AI-handled conversation count,
 * automation rate, hourly automated-vs-handoff trend) are not yet backed by a
 * real endpoint. Rather than render fabricated numbers, this renders an
 * empty-state placeholder until a real data source is wired up.
 */
export function AIMonitor() {
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Bot className="w-4 h-4 text-brand" />
                        AI хяналт
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                        <div className="w-11 h-11 rounded-full bg-brand-soft flex items-center justify-center">
                            <Bot className="w-5 h-5 text-brand-strong" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                            AI үзүүлэлт удахгүй
                        </p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                            AI харилцааны статистик бэлэн болсны дараа энд харагдана.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
