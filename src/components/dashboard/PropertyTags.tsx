'use client';

import {
    Car, Shield, Wifi, Dumbbell, Trees, Waves,
    Building, Thermometer, Wind, Droplets, Zap, Trash2,
    Baby, ShoppingBag, Phone, Eye
} from 'lucide-react';

export interface AmenityItem {
    key: string;
    label: string;
    icon: React.ComponentType<React.SVGAttributes<SVGSVGElement>>;
    category: string;
}

export const AMENITIES: AmenityItem[] = [
    // Building
    { key: 'elevator', label: 'Лифт', icon: Building, category: 'Барилга' },
    { key: 'parking_underground', label: 'Газар доорх паркинг', icon: Car, category: 'Барилга' },
    { key: 'parking_outdoor', label: 'Гадна паркинг', icon: Car, category: 'Барилга' },
    { key: 'security_24h', label: 'Хамгаалалт 24/7', icon: Shield, category: 'Барилга' },
    { key: 'cctv', label: 'Камер (CCTV)', icon: Eye, category: 'Барилга' },
    { key: 'lobby', label: 'Лобби', icon: Building, category: 'Барилга' },
    { key: 'commercial_floor', label: 'Худалдааны давхар', icon: ShoppingBag, category: 'Барилга' },
    // Amenities
    { key: 'garden', label: 'Цэцэрлэгт хүрээлэн', icon: Trees, category: 'Тохилог' },
    { key: 'playground', label: 'Тоглоомын талбай', icon: Baby, category: 'Тохилог' },
    { key: 'gym', label: 'Фитнес/Gym', icon: Dumbbell, category: 'Тохилог' },
    { key: 'pool', label: 'Усан бассейн', icon: Waves, category: 'Тохилог' },
    // Utilities
    { key: 'central_heating', label: 'Төв халаалт', icon: Thermometer, category: 'Инженер' },
    { key: 'floor_heating', label: 'Шалны халаалт', icon: Thermometer, category: 'Инженер' },
    { key: 'ventilation', label: 'Агааржуулалт', icon: Wind, category: 'Инженер' },
    { key: 'water_purifier', label: 'Ус цэвэршүүлэгч', icon: Droplets, category: 'Инженер' },
    { key: 'fiber_internet', label: 'Оптик интернет', icon: Wifi, category: 'Инженер' },
    { key: 'generator', label: 'Нөөц цахилгаан', icon: Zap, category: 'Инженер' },
    { key: 'waste_system', label: 'Хог зайлуулах', icon: Trash2, category: 'Инженер' },
];

interface PropertyTagsProps {
    selected: string[];
    onChange?: (tags: string[]) => void;
    readonly?: boolean;
}

export function PropertyTags({ selected, onChange, readonly = false }: PropertyTagsProps) {
    const categories = [...new Set(AMENITIES.map(a => a.category))];

    const toggle = (key: string) => {
        if (readonly || !onChange) return;
        const next = selected.includes(key)
            ? selected.filter(k => k !== key)
            : [...selected, key];
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {categories.map(cat => (
                <div key={cat}>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">{cat}</p>
                    <div className="flex flex-wrap gap-2">
                        {AMENITIES.filter(a => a.category === cat).map(amenity => {
                            const active = selected.includes(amenity.key);
                            const Icon = amenity.icon;
                            return (
                                <button
                                    key={amenity.key}
                                    onClick={() => toggle(amenity.key)}
                                    disabled={readonly}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${active
                                        ? 'bg-status-success-soft text-status-success border border-status-success/40'
                                        : readonly
                                            ? 'bg-surface-2/40 text-muted-foreground/70 border border-border/60'
                                            : 'bg-surface-2/40 text-muted-foreground border border-border hover:border-border-strong cursor-pointer'
                                        }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {amenity.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Display only selected tags in compact form */
export function PropertyTagsBadges({ tags }: { tags: string[] }) {
    if (!tags || tags.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1">
            {tags.map(key => {
                const amenity = AMENITIES.find(a => a.key === key);
                if (!amenity) return null;
                const Icon = amenity.icon;
                return (
                    <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-2 text-muted-foreground rounded-full text-xs">
                        <Icon className="w-3 h-3" />
                        {amenity.label}
                    </span>
                );
            })}
        </div>
    );
}
