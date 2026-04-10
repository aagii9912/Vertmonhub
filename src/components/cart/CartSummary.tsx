import React from 'react';
import { ShoppingBag, ChevronRight } from 'lucide-react';

interface CartSummaryProps {
    itemCount: number;
    total: number;
    freeShippingThreshold?: number;
    onViewCart: () => void;
}

export function CartSummary({
    itemCount,
    total,
    freeShippingThreshold = 50000,
    onViewCart
}: CartSummaryProps) {
    const progress = Math.min((total / freeShippingThreshold) * 100, 100);
    const remaining = Math.max(freeShippingThreshold - total, 0);

    return (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 
                    rounded-2xl p-4 border border-violet-100">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-violet-600" />
                    <span className="font-medium text-gray-900">
                        {itemCount} бараа сагсанд
                    </span>
                </div>
                <button
                    onClick={onViewCart}
                    className="text-sm text-violet-600 font-medium flex items-center gap-1 
                     hover:text-violet-700 transition"
                >
                    Харах
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Free Shipping Progress */}
            {remaining > 0 ? (
                <div>
                    <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-600">Үнэгүй хүргэлт хүртэл</span>
                        <span className="font-medium text-violet-600">
                            {remaining.toLocaleString()}₮
                        </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 
                         rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-emerald-600">
                    <span className="text-lg">🎉</span>
                    <span className="font-medium">Үнэгүй хүргэлт идэвхжлээ!</span>
                </div>
            )}
        </div>
    );
}
