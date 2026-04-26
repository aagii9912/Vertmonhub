'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth, Shop } from '@/contexts/AuthContext';
import { Store, ChevronDown, Check, Plus } from 'lucide-react';

interface ShopSwitcherProps {
    onAddShop?: () => void;
}

export function ShopSwitcher({ onAddShop }: ShopSwitcherProps) {
    const { shop: activeShop, shops, switchShop } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSwitchShop = async (shopId: string) => {
        if (shopId === activeShop?.id) {
            setIsOpen(false);
            return;
        }

        setSwitching(true);
        await switchShop(shopId);
        // Page will reload after switch
    };

    // Don't show if only one shop
    if (shops.length <= 1 && !onAddShop) {
        return null;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                aria-label="Дэлгүүр сонгох"
                aria-expanded={isOpen}
                aria-haspopup="menu"
            >
                <Store className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm text-foreground max-w-[120px] truncate">
                    {activeShop?.name || 'Дэлгүүр сонгох'}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden" role="menu" aria-label="Дэлгүүр сонгох">
                    <div className="p-2 border-b border-border">
                        <p className="text-xs text-muted-foreground px-2">Миний дэлгүүрүүд</p>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                        {shops.map((shop) => (
                            <button
                                key={shop.id}
                                onClick={() => handleSwitchShop(shop.id)}
                                disabled={switching}
                                role="menuitem"
                                aria-current={activeShop?.id === shop.id ? 'true' : undefined}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${activeShop?.id === shop.id ? 'bg-primary/5' : ''
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeShop?.id === shop.id ? 'bg-primary text-white' : 'bg-secondary'
                                    }`}>
                                    <Store className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-foreground truncate">{shop.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {shop.facebook_page_name || 'Facebook холбоогүй'}
                                    </p>
                                </div>
                                {activeShop?.id === shop.id && (
                                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>

                    {onAddShop && (
                        <div className="p-2 border-t border-border">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onAddShop();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm font-medium">Шинэ дэлгүүр нэмэх</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
