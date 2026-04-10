import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface FloatingCartButtonProps {
    itemCount: number;
    onClick: () => void;
}

export function FloatingCartButton({ itemCount, onClick }: FloatingCartButtonProps) {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 
                 w-14 h-14 rounded-full 
                 bg-gradient-to-r from-violet-600 to-indigo-600 
                 text-white shadow-lg shadow-violet-500/30 
                 flex items-center justify-center 
                 hover:scale-105 active:scale-95 transition-transform"
        >
            <ShoppingCart className="w-6 h-6" />
            {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 
                        w-6 h-6 rounded-full bg-red-500 
                        text-xs font-bold 
                        flex items-center justify-center 
                        animate-bounce">
                    {itemCount > 99 ? '99+' : itemCount}
                </span>
            )}
        </button>
    );
}
