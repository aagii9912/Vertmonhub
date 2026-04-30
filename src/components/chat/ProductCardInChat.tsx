import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface ProductCardInChatProps {
    product: {
        id: string;
        name: string;
        description?: string;
        price: number;
        image_url?: string;
        has_variants?: boolean;
        variants?: any[];
    };
    onAddToCart?: (productId: string, variantId?: string) => void;
}

export function ProductCardInChat({ product, onAddToCart }: ProductCardInChatProps) {
    const [selectedOptions, setSelectedOptions] = React.useState<Record<string, string>>({});
    const [showOptions, setShowOptions] = React.useState(false);

    // Check if variants exist
    const hasVariants = product.has_variants && product.variants && product.variants.length > 0;

    // Get unique option names
    const optionNames = React.useMemo(() => {
        if (!hasVariants) return [];
        const names = new Set<string>();
        product.variants?.forEach((v: any) => {
            if (v.options) Object.keys(v.options).forEach(k => names.add(k));
        });
        return Array.from(names);
    }, [product]);

    // Handle option selection
    const handleOptionSelect = (name: string, value: string) => {
        setSelectedOptions(prev => ({ ...prev, [name]: value }));
    };

    // Find selected variant
    const selectedVariant = React.useMemo(() => {
        if (!hasVariants) return null;
        if (Object.keys(selectedOptions).length !== optionNames.length) return null;

        return product.variants?.find((v: any) => {
            return Object.entries(v.options).every(([key, val]) => selectedOptions[key] === val);
        });
    }, [product, selectedOptions, optionNames, hasVariants]);

    // Get available values for an option name (can depend on previous selections if we want to be fancy, simplified here)
    const getValuesForOption = (name: string) => {
        const values = new Set<string>();
        product.variants?.forEach((v: any) => {
            if (v.options && v.options[name]) values.add(v.options[name]);
        });
        return Array.from(values);
    };

    const handleAddToCart = () => {
        if (!onAddToCart) return;
        if (hasVariants) {
            if (selectedVariant) {
                onAddToCart(product.id, selectedVariant.id);
            } else {
                setShowOptions(true);
            }
        } else {
            onAddToCart(product.id);
        }
    };

    return (
        <div className="bg-surface border border-border/60 rounded-xl overflow-hidden 
                    shadow-sm hover:shadow-md transition w-[220px] shrink-0 mt-2">
            {/* Image */}
            <div className="w-full h-24 bg-surface-2/40 overflow-hidden relative group">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/60 text-[10px]">
                        No image
                    </div>
                )}

                {/* Variant Badge */}
                {hasVariants && (
                    <div className="absolute top-1 right-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                        {product.variants?.length} options
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-2.5">
                <h4 className="font-medium text-foreground text-xs truncate" title={product.name}>{product.name}</h4>

                {/* Variant Selection UI */}
                {showOptions && hasVariants && (
                    <div className="mt-2 space-y-2 bg-surface-2/40 p-2 rounded-lg border border-border/60 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        {optionNames.map(name => (
                            <div key={name}>
                                <label className="text-[10px] text-muted-foreground font-medium block mb-1">{name}</label>
                                <div className="flex flex-wrap gap-1">
                                    {getValuesForOption(name).map(val => (
                                        <button
                                            key={val}
                                            onClick={() => handleOptionSelect(name, val)}
                                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors
                                                ${selectedOptions[name] === val
                                                    ? 'bg-brand text-white border-violet-600'
                                                    : 'bg-surface text-muted-foreground border-border hover:border-brand/40'}`}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-50">
                    <div className="flex flex-col">
                        <span className="font-bold text-brand-strong text-xs">
                            {(selectedVariant?.price || product.price).toLocaleString()}₮
                        </span>
                        {selectedVariant && (
                            <span className="text-[10px] text-muted-foreground/70">
                                {selectedVariant.name}
                            </span>
                        )}
                    </div>

                    {onAddToCart && (
                        <button
                            onClick={handleAddToCart}
                            disabled={hasVariants && showOptions && !selectedVariant}
                            className={`flex items-center gap-1 px-2 py-1 
                                     text-[10px] font-medium 
                                     rounded-lg transition
                                     ${hasVariants && showOptions && !selectedVariant
                                    ? 'bg-surface-3 text-muted-foreground/70 cursor-not-allowed'
                                    : 'bg-brand text-white hover:bg-brand-strong'}`}
                        >
                            <ShoppingCart className="w-3 h-3" />
                            {hasVariants && !selectedVariant ? "Сонгох" : "Сагслах"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
