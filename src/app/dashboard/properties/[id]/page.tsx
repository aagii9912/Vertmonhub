'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Image from 'next/image';
import {
    BedDouble, Maximize, Building2, DollarSign,
    Eye, Edit, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Money } from '@/components/ui/Money';
import { DateText } from '@/components/ui/DateText';
import { PageSkeleton } from '@/components/ui/LoadingSkeleton';
import { PropertyTags } from '@/components/dashboard/PropertyTags';
import { EntityAttachments } from '@/components/dashboard/EntityAttachments';
import { MortgageCalculator } from '@/components/dashboard/MortgageCalculator';
import { VirtualTour } from '@/components/dashboard/VirtualTour';
import type { Property, PropertyStatus, PropertyType } from '@/types/property';

const statusLabels: Record<PropertyStatus, string> = {
    available: 'Чөлөөтэй', reserved: 'Захиалсан', sold: 'Зарагдсан', rented: 'Түрээслэсэн', barter: 'Бартер',
};
const statusVariants: Record<PropertyStatus, 'success' | 'pending' | 'neutral' | 'info'> = {
    available: 'success', reserved: 'pending',
    sold: 'neutral', rented: 'info', barter: 'pending',
};
const typeLabels: Record<PropertyType, string> = {
    apartment: 'Орон сууц', house: 'Хувийн байшин', office: 'Оффис', land: 'Газар', commercial: 'Худалдааны',
};

export default function PropertyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { shop } = useAuth();
    const reducedMotion = useReducedMotion();
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
        return <PageSkeleton rows={4} />;
    }

    const images = property.images?.length > 0 ? property.images : [];
    const hasVirtualTour = !!property.virtual_tour_url;

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <PageHeader
                breadcrumbs={[
                    { label: 'Байрнууд', href: '/dashboard/properties' },
                    { label: property.name },
                ]}
                title={property.name}
                subtitle={property.district ? `${property.district}, ${property.city}` : undefined}
                secondaryActions={
                    <StatusPill variant={statusVariants[property.status]} dot>
                        {statusLabels[property.status]}
                    </StatusPill>
                }
                primaryAction={
                    <Button href={`/dashboard/properties/${property.id}/edit`} variant="primary" size="sm">
                        <Edit className="w-4 h-4" /> Засах
                    </Button>
                }
            />

            <motion.div
                className="space-y-6"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
            >
                {/* Image Gallery */}
                {images.length > 0 && (
                    <div className="relative rounded-xl overflow-hidden bg-surface-2 aspect-[16/9]">
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
                                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-foreground/50 backdrop-blur rounded-full text-background hover:bg-foreground/70 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setCurrentImage(i => (i + 1) % images.length)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-foreground/50 backdrop-blur rounded-full text-background hover:bg-foreground/70 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                    {images.map((_, idx) => (
                                        <button key={idx} onClick={() => setCurrentImage(idx)}
                                            className={`h-2 rounded-full transition-all ${idx === currentImage ? 'bg-background w-6' : 'bg-background/50 w-2'}`} />
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="absolute top-3 right-3 flex gap-2">
                            <span className="px-2.5 py-1 bg-foreground/60 backdrop-blur rounded-md text-background text-xs flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" /> {property.views_count}
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Key Specs */}
                        <Card>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center p-3 bg-brand-soft rounded-xl">
                                        <DollarSign className="w-5 h-5 text-brand-strong mx-auto mb-1" />
                                        <p className="heading-display text-lg text-foreground tabular-nums"><Money value={Number(property.price)} /></p>
                                        <p className="text-xs text-muted-foreground">Үнэ</p>
                                    </div>
                                    <div className="text-center p-3 bg-status-info-soft rounded-xl">
                                        <Maximize className="w-5 h-5 text-status-info mx-auto mb-1" />
                                        <p className="heading-display text-lg text-foreground tabular-nums">{property.size_sqm || '-'} м²</p>
                                        <p className="text-xs text-muted-foreground">Талбай</p>
                                    </div>
                                    <div className="text-center p-3 bg-status-success-soft rounded-xl">
                                        <BedDouble className="w-5 h-5 text-status-success mx-auto mb-1" />
                                        <p className="heading-display text-lg text-foreground tabular-nums">{property.rooms || '-'}</p>
                                        <p className="text-xs text-muted-foreground">Өрөө</p>
                                    </div>
                                    <div className="text-center p-3 bg-status-pending-soft rounded-xl">
                                        <Building2 className="w-5 h-5 text-status-pending mx-auto mb-1" />
                                        <p className="heading-display text-lg text-foreground tabular-nums">{property.floor || '-'}</p>
                                        <p className="text-xs text-muted-foreground">Давхар</p>
                                    </div>
                                </div>

                                {property.price_per_sqm && (
                                    <p className="text-sm text-muted-foreground mt-3 text-center">
                                        м² үнэ: <span className="font-semibold text-foreground tabular-nums"><Money value={Number(property.price_per_sqm)} />/м²</span>
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Description */}
                        {property.description && (
                            <Card>
                                <CardContent>
                                    <CardTitle className="mb-2">Тайлбар</CardTitle>
                                    <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{property.description}</p>
                                </CardContent>
                            </Card>
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
                        <Card>
                            <CardContent>
                                <CardTitle className="mb-3">Дэлгэрэнгүй</CardTitle>
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
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        {/* Quick Actions */}
                        <Card>
                            <CardContent>
                                <CardTitle className="mb-3">Үйлдлүүд</CardTitle>
                                <div className="space-y-2">
                                    <Button href={`/dashboard/leads?property=${property.id}`} variant="primary" size="md" className="w-full">
                                        <Eye className="w-4 h-4" /> Лийд харах
                                    </Button>
                                    <Button href={`/dashboard/properties/${property.id}/edit`} variant="secondary" size="md" className="w-full">
                                        <Edit className="w-4 h-4" /> Засварлах
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Mortgage Calculator */}
                        <MortgageCalculator defaultPrice={Number(property.price)} />

                        {/* AI-аар хавсаргасан файлууд */}
                        <EntityAttachments entityType="property" entityId={property.id} />

                        {/* Meta */}
                        <Card>
                            <CardContent className="text-sm text-muted-foreground">
                                <div className="flex justify-between mb-1">
                                    <span>Нэмэгдсэн</span>
                                    <DateText value={property.created_at} className="text-foreground" />
                                </div>
                                <div className="flex justify-between">
                                    <span>Шинэчлэгдсэн</span>
                                    <DateText value={property.updated_at} className="text-foreground" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
