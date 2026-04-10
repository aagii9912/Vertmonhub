'use client';

import Image from 'next/image';
import { Package } from 'lucide-react';

interface BestSellerProduct {
    id: string;
    name: string;
    image: string | null;
    quantity: number;
    revenue: number;
    rank: number;
    percent: number;
}

interface BestSellersTableProps {
    products: BestSellerProduct[];
    loading?: boolean;
}

export function BestSellersTable({ products, loading }: BestSellersTableProps) {
    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-4 p-3 bg-[#0F0B2E] rounded-lg">
                        <div className="w-8 h-8 bg-[#1C1650] rounded-full" />
                        <div className="w-12 h-12 bg-[#1C1650] rounded-lg" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-[#1C1650] rounded w-3/4" />
                            <div className="h-3 bg-[#1C1650] rounded w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="text-center py-12 text-white/50">
                <Package className="w-12 h-12 mx-auto mb-3 text-white/30" />
                <p>Борлуулалтын өгөгдөл байхгүй</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {products.map((product) => (
                <div
                    key={product.id}
                    className="flex items-center gap-4 p-3 bg-[#0F0B2E] hover:bg-[#151040] rounded-lg transition-colors"
                >
                    {/* Rank */}
                    <div className={`
            w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
            ${product.rank === 1 ? 'bg-yellow-100 text-yellow-700' : ''}
            ${product.rank === 2 ? 'bg-[#1C1650] text-white/70' : ''}
            ${product.rank === 3 ? 'bg-orange-100 text-orange-700' : ''}
            ${product.rank > 3 ? 'bg-[#151040] text-white/60' : ''}
          `}>
                        {product.rank}
                    </div>

                    {/* Image */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#0F0B2E] border border-white/[0.08] flex-shrink-0">
                        {product.image ? (
                            <Image
                                src={product.image}
                                alt={product.name}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#0F0B2E]">
                                <Package className="w-5 h-5 text-white/40" />
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-white truncate">{product.name}</p>
                        <p className="text-xs text-white/50">
                            {product.quantity} ширхэг борлуулсан
                        </p>
                        {/* Progress bar */}
                        <div className="mt-1.5 h-1.5 bg-[#1C1650] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${product.percent}%` }}
                            />
                        </div>
                    </div>

                    {/* Revenue */}
                    <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-sm text-white">
                            ₮{product.revenue.toLocaleString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
