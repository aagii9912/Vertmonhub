import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface EmptyCartProps {
    onBrowseProducts: () => void;
}

export function EmptyCart({ onBrowseProducts }: EmptyCartProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-24 h-24 rounded-full bg-gray-50 
                      flex items-center justify-center mb-6 shadow-inner">
                <ShoppingCart className="w-12 h-12 text-gray-300" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
                Сагс хоосон байна
            </h3>

            <p className="text-sm text-gray-500 max-w-[240px] mb-8 leading-relaxed">
                Та барааныхаа жагсаалтаас сонгон сагсандаа нэмнэ үү
            </p>

            <Button onClick={onBrowseProducts} className="w-full sm:w-auto px-12">
                Бараа үзэх
            </Button>
        </div>
    );
}
