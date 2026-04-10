import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';

interface CartItem {
    id: string;
    product_id: string;
    name: string;
    image_url: string;
    unit_price: number;
    quantity: number;
    variant_specs?: {
        color?: string;
        size?: string;
    };
}

interface CartItemCardProps {
    item: CartItem;
    onUpdateQuantity: (id: string, quantity: number) => void;
    onRemove: (id: string) => void;
}

export function CartItemCard({ item, onUpdateQuantity, onRemove }: CartItemCardProps) {
    return (
        <div className="flex gap-3 p-3 bg-[#0F0B2E] rounded-xl border border-gray-100">
            {/* Image */}
            <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No img
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>

                {/* Variant */}
                {item.variant_specs && (
                    <p className="text-xs text-gray-500 mt-0.5">
                        {item.variant_specs.color} / {item.variant_specs.size}
                    </p>
                )}

                {/* Price & Quantity */}
                <div className="flex items-center justify-between mt-2">
                    <span className="font-semibold text-gray-900">
                        {item.unit_price.toLocaleString()}₮
                    </span>

                    <div className="flex items-center gap-2">
                        {/* Quantity Controls */}
                        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-100">
                            <button
                                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                className="w-7 h-7 flex items-center justify-center
                                     hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed
                                     transition"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>

                            <button
                                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center
                                     hover:text-violet-600 transition"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Remove */}
                        <button
                            onClick={() => onRemove(item.id)}
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 
                                     flex items-center justify-center
                                     hover:bg-red-100 transition ml-1"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
