'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Link from 'next/link';
import Image from 'next/image';
import {
    ArrowLeft, MapPin, BedDouble, Maximize, Building2, DollarSign,
    Eye, Calendar, Edit, Share2, Heart, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { PropertyTags } from '@/components/dashboard/PropertyTags';
import { MortgageCalculator } from '@/components/dashboard/MortgageCalculator';
import { VirtualTour } from '@/components/dashboard/VirtualTour';
import type { Property, PropertyStatus, PropertyType } from '@/types/property';

const statusLabels: Record<PropertyStatus, string> = {
    available: 'Чөлөөтэй', reserved: 'Захиалсан', sold: 'Зарагдсан', rented: 'Түрээслэсэн', barter: 'Бартер',
};
const statusColors: Record<PropertyStatus, string> = {
    available: 'bg-status-success-soft text-status-success', reserved: 'bg-status-pending-soft text-status-pending',
    sold: 'bg-surface-3 text-muted-foreground', rented: 'bg-status-info-soft text-status-info', barter: 'bg-status-pending-soft text-status-pending',
};
const typeLabels: Record<PropertyType, string> = {
    apartment: 'Орон сууц', house: 'Хувийн байшин', office: 'Оффис', land: 'Газар', commercial: 'Худалдааны',
};

export default function PropertyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { shop } = useAuth();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentImage, setCurrentImage] = useState(0);

    useEffect(() => {
        if (!shop?.id || !params.id) return;
        fetchProperty();
    }, [shop?.id, params.id]);

    async function fetchProperty() {
        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('id', params.id)
            .eq('shop_id', shop!.id)
            .single();

        if (error || !data) {
            toast.error('Байр олдсонгүй');
            router.push('/dashboard/properties');
            return;
        }
        setProperty(data as Property);
        setLoading(false);
    }

    if (loading || !property) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-strong" />
            </div>
        );
    }

    const images = property.images?.length > 0 ? property.images : [];
    const hasVirtualTour = !!property.virtual_tour_url;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/properties" className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{property.name}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            {property.district && (
                                <span className="text-sm text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" />{property.district}, {property.city}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[property.status]}`}>
                        {statusLabels[property.status]}
                    </span>
                    <Link href={`/dashboard/properties/${property.id}/edit`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-strong transition-colors">
                        <Edit className="w-4 h-4" /> Засах
                    </Link>
                </div>
            </div>

            {/* Image Gallery */}
            {images.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden bg-surface-2 aspect-[16/9]">
                    <Image
                        src={images[currentImage]}
                        alt={property.name}
                        fill
                        className="object-cover"
                    />
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={() => setCurrentImage(i => (i - 1 + images.length) % images.length)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 backdrop-blur rounded-full text-white hover:bg-black/60">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setCurrentImage(i => (i + 1) % images.length)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 backdrop-blur rounded-full text-white hover:bg-black/60">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                {images.map((_, idx) => (
                                    <button key={idx} onClick={() => setCurrentImage(idx)}
                                        className={`w-2 h-2 rounded-full transition-all ${idx === currentImage ? 'bg-surface w-6' : 'bg-surface/50'}`} />
                                ))}
                            </div>
                        </>
                    )}
                    <div className="absolute top-3 right-3 flex gap-2">
                        <span className="px-2.5 py-1 bg-black/50 backdrop-blur rounded-lg text-white text-xs flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" /> {property.views_count}
                        </span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Key Specs */}
                    <div className="bg-surface rounded-2xl border border-border p-5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 bg-brand-soft rounded-xl">
                                <DollarSign className="w-5 h-5 text-brand-strong mx-auto mb-1" />
                                <p className="text-lg font-bold text-foreground">{Number(property.price).toLocaleString()}₮</p>
                                <p className="text-xs text-muted-foreground">Үнэ</p>
                            </div>
                            <div className="text-center p-3 bg-status-info-soft rounded-xl">
                                <Maximize className="w-5 h-5 text-status-info mx-auto mb-1" />
                                <p className="text-lg font-bold text-foreground">{property.size_sqm || '-'} м²</p>
                                <p className="text-xs text-muted-foreground">Талбай</p>
                            </div>
                            <div className="text-center p-3 bg-status-success-soft rounded-xl">
                                <BedDouble className="w-5 h-5 text-status-success mx-auto mb-1" />
                                <p className="text-lg font-bold text-foreground">{property.rooms || '-'}</p>
                                <p className="text-xs text-muted-foreground">Өрөө</p>
                            </div>
                            <div className="text-center p-3 bg-status-pending-soft rounded-xl">
                                <Building2 className="w-5 h-5 text-status-pending mx-auto mb-1" />
                                <p className="text-lg font-bold text-foreground">{property.floor || '-'}</p>
                                <p className="text-xs text-muted-foreground">Давхар</p>
                            </div>
                        </div>

                        {property.price_per_sqm && (
                            <p className="text-sm text-muted-foreground mt-3 text-center">
                                м² үнэ: <span className="font-semibold text-foreground">{Number(property.price_per_sqm).toLocaleString()}₮/м²</span>
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    {property.description && (
                        <div className="bg-surface rounded-2xl border border-border p-5">
                            <h3 className="font-semibold text-foreground mb-2">Тайлбар</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{property.description}</p>
                        </div>
                    )}

                    {/* Virtual Tour */}
                    {hasVirtualTour && (
                        <VirtualTour
                            tourUrl={property.virtual_tour_url!}
                            propertyName={property.name}
                            posterImage={images[0]}
                        />
                    )}

                    {/* Property Tags / Amenities */}
                    <PropertyTags
                        selected={property.amenities || []}
                        readonly={true}
                    />

                    {/* Details */}
                    <div className="bg-surface rounded-2xl border border-border p-5">
                        <h3 className="font-semibold text-foreground mb-3">Дэлгэрэнгүй</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between py-2 border-b border-border/60">
                                <span className="text-muted-foreground">Төрөл</span>
                                <span className="font-medium text-foreground">{typeLabels[property.type]}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/60">
                                <span className="text-muted-foreground">Статус</span>
                                <span className="font-medium text-foreground">{statusLabels[property.status]}</span>
                            </div>
                            {property.bedrooms && (
                                <div className="flex justify-between py-2 border-b border-border/60">
                                    <span className="text-muted-foreground">Унтлагын өрөө</span>
                                    <span className="font-medium text-foreground">{property.bedrooms}</span>
                                </div>
                            )}
                            {property.bathrooms && (
                                <div className="flex justify-between py-2 border-b border-border/60">
                                    <span className="text-muted-foreground">Угаалгын өрөө</span>
                                    <span className="font-medium text-foreground">{property.bathrooms}</span>
                                </div>
                            )}
                            {property.year_built && (
                                <div className="flex justify-between py-2 border-b border-border/60">
                                    <span className="text-muted-foreground">Баригдсан он</span>
                                    <span className="font-medium text-foreground">{property.year_built}</span>
                                </div>
                            )}
                            <div className="flex justify-between py-2 border-b border-border/60">
                                <span className="text-muted-foreground">Үзсэн</span>
                                <span className="font-medium text-foreground">{property.views_count} удаа</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-surface rounded-2xl border border-border p-5">
                        <h3 className="font-semibold text-foreground mb-3">Үйлдлүүд</h3>
                        <div className="space-y-2">
                            <Link href={`/dashboard/leads?property=${property.id}`}
                                className="w-full flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-strong transition-colors">
                                <Eye className="w-4 h-4" /> Лийд харах
                            </Link>
                            <Link href={`/dashboard/properties/${property.id}/edit`}
                                className="w-full flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-surface-2/40 transition-colors">
                                <Edit className="w-4 h-4" /> Засварлах
                            </Link>
                        </div>
                    </div>

                    {/* Mortgage Calculator */}
                    <MortgageCalculator defaultPrice={Number(property.price)} />

                    {/* Meta */}
                    <div className="bg-surface rounded-2xl border border-border p-5 text-sm text-muted-foreground">
                        <div className="flex justify-between mb-1">
                            <span>Нэмэгдсэн</span>
                            <span>{new Date(property.created_at).toLocaleDateString('mn-MN')}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Шинэчлэгдсэн</span>
                            <span>{new Date(property.updated_at).toLocaleDateString('mn-MN')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
