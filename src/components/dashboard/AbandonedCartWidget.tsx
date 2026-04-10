import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Ghost, Bell, Clock } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils/date';

interface AbandonedCart {
    id: string;
    customer_name: string;
    item_count: number;
    total_amount: number;
    last_activity_at: string;
}

interface AbandonedCartWidgetProps {
    carts: AbandonedCart[];
    onRecover: (id: string) => void;
}

export function AbandonedCartWidget({ carts, onRecover }: AbandonedCartWidgetProps) {
    return (
        <Card>
            <CardHeader className="py-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Ghost className="w-5 h-5 text-white/40" />
                    Орхигдсон сагс
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {carts.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                        {carts.map((cart) => (
                            <div key={cart.id} className="p-4 flex items-center justify-between hover:bg-[#0D0928] transition-colors">
                                <div className="min-w-0">
                                    <h4 className="text-sm font-semibold text-white truncate">{cart.customer_name}</h4>
                                    <p className="text-[11px] text-white/50 mt-0.5">
                                        {cart.item_count} бараа • {cart.total_amount.toLocaleString()}₮
                                    </p>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-violet-500 font-medium">
                                        <Clock className="w-3 h-3" />
                                        {formatTimeAgo(cart.last_activity_at)}
                                    </div>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => onRecover(cart.id)} className="h-8 px-3 text-[11px]">
                                    <Bell className="w-3 h-3 mr-1.5" />
                                    Сануулах
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center text-white/40">
                        <p className="text-sm">Орхигдсон сагс байхгүй.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
