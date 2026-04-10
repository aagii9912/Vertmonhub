import React from 'react';
import { ActiveCart } from '@/hooks/useActiveCarts';
import { User, ShoppingCart, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomerListProps {
    carts: ActiveCart[];
    activeId?: string;
    onSelect: (id: string) => void;
}

export function CustomerList({ carts, activeId, onSelect }: CustomerListProps) {
    if (carts.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-white/40 p-6 text-center">
                <ShoppingCart className="w-12 h-12 mb-3 text-gray-200" />
                <p className="text-sm font-medium">Одоогоор сагс хоосон байна</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 border-b border-white/[0.08]">
                <h3 className="font-bold text-white">Идэвхтэй Сагс ({carts.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
                {Array.from(new Map(carts.map(c => [c.id, c])).values()).map((cart) => {
                    const isActive = activeId === cart.id;
                    const itemsNames = cart.items.map(i => i.name).slice(0, 4).join(', ');
                    const hasMore = cart.items.length > 4;

                    return (
                        <button
                            key={cart.id}
                            onClick={() => onSelect(cart.id)}
                            className={cn(
                                "w-full p-4 flex items-center gap-3 transition-colors text-left hover:bg-[#0F0B2E]",
                                isActive && "bg-violet-500/10 hover:bg-violet-500/10"
                            )}
                        >
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center text-violet-600 font-bold border border-white shadow-sm">
                                    {cart.customer.name.charAt(0).toUpperCase()}
                                </div>
                                {cart.customer.isVip && (
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white">
                                        ★
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h4 className={cn("text-sm font-semibold truncate", isActive ? "text-violet-700" : "text-white")}>
                                        {cart.customer.name}
                                    </h4>
                                    <span className="text-xs font-medium text-white/50">
                                        {new Date(cart.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-xs text-white/50 truncate mb-1">
                                    {cart.items.length > 0 ? (
                                        <>
                                            <span className="text-white/70 font-medium">{cart.items.length} бараа:</span> {itemsNames}{hasMore ? '...' : ''}
                                        </>
                                    ) : (
                                        <span className="italic">Сагс хоосон</span>
                                    )}
                                </p>
                                <div className="flex items-center gap-1.5 ">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                        Total: {cart.totalAmount.toLocaleString()}₮
                                    </span>
                                </div>
                            </div>

                            <ChevronRight className={cn("w-4 h-4", isActive ? "text-violet-500" : "text-white/30")} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
