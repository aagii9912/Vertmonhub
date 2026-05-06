'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterSelect } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import {
    Building2,
    Eye,
    DollarSign,
    TrendingUp,
    Plus,
    Edit,
    Trash2,
    MapPin,
    BedDouble,
    Maximize,
    ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Image from 'next/image';
import Link from 'next/link';
import type { Property, PropertyType, PropertyStatus } from '@/types/property';

const typeBadgeVariant: Record<PropertyType, 'info' | 'success' | 'brand' | 'warning' | 'danger'> = {
    apartment: 'info',
    house: 'success',
    office: 'brand',
    land: 'warning',
    commercial: 'danger',
};

const statusBadgeVariant: Record<PropertyStatus, 'success' | 'warning' | 'default' | 'info' | 'brand'> = {
    available: 'success',
    reserved: 'warning',
    sold: 'default',
    rented: 'info',
    barter: 'brand',
};

const typeLabels: Record<PropertyType, string> = {
    apartment: 'Орон сууц',
    house: 'Хувийн байшин',
    office: 'Оффис',
    land: 'Газар',
    commercial: 'Худалдааны',
};

const statusLabels: Record<PropertyStatus, string> = {
    available: 'Зарагдаж байна',
    reserved: 'Захиалагдсан',
    sold: 'Зарагдсан',
    rented: 'Түрээслэгдсэн',
    barter: 'Бартер',
};

interface Stats {
    totalProperties: number;
    totalValue: number;
    totalViews: number;
    avgPrice: number;
}

export default function PropertiesPage() {
    const { shop } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<PropertyType | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all');
    const [stats, setStats] = useState<Stats>({
        totalProperties: 0,
        totalValue: 0,
        totalViews: 0,
        avgPrice: 0,
    });

    useEffect(() => {
        if (!shop?.id) return;

        const fetchProperties = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('properties')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });

                if (typeFilter !== 'all') query = query.eq('type', typeFilter);
                if (statusFilter !== 'all') query = query.eq('status', statusFilter);

                const { data, error } = await query;

                if (error) throw error;

                const propertiesData = data as Property[];
                setProperties(propertiesData);

                const totalValue = propertiesData.reduce((sum, p) => sum + p.price, 0);
                const totalViews = propertiesData.reduce((sum, p) => sum + (p.views_count || 0), 0);
                setStats({
                    totalProperties: propertiesData.length,
                    totalValue,
                    totalViews,
                    avgPrice: propertiesData.length > 0 ? totalValue / propertiesData.length : 0,
                });
            } catch (error) {
                console.error('Error fetching properties:', error);
                toast.error('Мэдээлэл татахад алдаа гарлаа');
            } finally {
                setLoading(false);
            }
        };

        fetchProperties();
    }, [shop?.id, typeFilter, statusFilter]);

    const filteredProperties = properties.filter((p) => {
        const name = (p.name || (p as any).title || '').toLowerCase();
        return (
            name.includes(searchQuery.toLowerCase()) ||
            p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.district?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Энэ үл хөдлөхийг устгах уу?')) return;

        try {
            const res = await fetch(`/api/properties/${id}`, {
                method: 'DELETE',
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Устгахад алдаа');
            }
            setProperties((prev) => prev.filter((p) => p.id !== id));
            toast.success('Үл хөдлөх амжилттай устгагдлаа');
        } catch (error) {
            console.error('Error deleting property:', error);
            toast.error(error instanceof Error ? error.message : 'Устгахад алдаа гарлаа');
        }
    };

    const formatPrice = (price: number) => {
        if (price >= 1000000000) return `${(price / 1000000000).toFixed(1)}B₮`;
        if (price >= 1000000) return `${(price / 1000000).toFixed(0)}M₮`;
        return `${price.toLocaleString()}₮`;
    };

    return (
        <div>
            <PageHeader
                eyebrow="Үл хөдлөх"
                title="Үл хөдлөх жагсаалт"
                subtitle="Бүртгэлтэй бүх объектуудыг харах, шинэчлэх, шинээр нэмэх"
                primaryAction={
                    <Button href="/dashboard/properties/new" variant="primary" size="md">
                        <Plus className="w-4 h-4" />
                        Шинэ нэмэх
                    </Button>
                }
            />

            {/* Stats */}
            <StatBar columns={4}>
                <StatTile
                    label="Нийт үл хөдлөх"
                    value={stats.totalProperties}
                    icon={<Building2 className="w-4 h-4" />}
                    accent="brand"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-success">
                            <ArrowUpRight className="w-3 h-3" />
                            +12% өмнөх сараас
                        </span>
                    }
                />
                <StatTile
                    label="Нийт үнэ"
                    value={formatPrice(stats.totalValue)}
                    icon={<DollarSign className="w-4 h-4" />}
                    accent="info"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-success">
                            <ArrowUpRight className="w-3 h-3" />
                            +8% өмнөх сараас
                        </span>
                    }
                />
                <StatTile
                    label="Нийт үзэлт"
                    value={stats.totalViews.toLocaleString()}
                    icon={<Eye className="w-4 h-4" />}
                    accent="success"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-success">
                            <ArrowUpRight className="w-3 h-3" />
                            +24% өмнөх сараас
                        </span>
                    }
                />
                <StatTile
                    label="Дундаж үнэ"
                    value={formatPrice(stats.avgPrice)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    accent="warning"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-danger">
                            <ArrowUpRight className="w-3 h-3 rotate-90" />
                            -2% өмнөх сараас
                        </span>
                    }
                />
            </StatBar>

            {/* Filters */}
            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэр, хаяг, дүүргээр хайх...',
                }}
                showClear={searchQuery !== '' || typeFilter !== 'all' || statusFilter !== 'all'}
                onClear={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                    setStatusFilter('all');
                }}
            >
                <FilterSelect
                    label="Төрөл"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as PropertyType | 'all')}
                >
                    <option value="all">Бүх төрөл</option>
                    <option value="apartment">Орон сууц</option>
                    <option value="house">Хувийн байшин</option>
                    <option value="office">Оффис</option>
                    <option value="land">Газар</option>
                    <option value="commercial">Худалдааны</option>
                </FilterSelect>
                <FilterSelect
                    label="Төлөв"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | 'all')}
                >
                    <option value="all">Бүх төлөв</option>
                    <option value="available">Зарагдаж байна</option>
                    <option value="reserved">Захиалагдсан</option>
                    <option value="sold">Зарагдсан</option>
                    <option value="rented">Түрээслэгдсэн</option>
                    <option value="barter">Бартер</option>
                </FilterSelect>
            </FilterBar>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface-2/50 border-b border-border">
                                <tr>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үл хөдлөх
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Төрөл
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үнэ
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Хэмжээ
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Төлөв
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үзэлт
                                    </th>
                                    <th className="text-right px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үйлдэл
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <Spinner size="lg" />
                                                <span className="text-sm text-muted-foreground">Татаж байна...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredProperties.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12">
                                            <EmptyState
                                                icon={<Building2 className="w-7 h-7" />}
                                                title="Үл хөдлөх олдсонгүй"
                                                description="Шүүлтүүрээ өөрчлөх эсвэл анхны үл хөдлөхөө нэмнэ үү"
                                                action={
                                                    <Button href="/dashboard/properties/new" variant="primary" size="sm">
                                                        <Plus className="w-4 h-4" />
                                                        Шинэ нэмэх
                                                    </Button>
                                                }
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProperties.map((property) => (
                                        <tr key={property.id} className="hover:bg-surface-2/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-16 h-12 bg-surface-2 rounded-md overflow-hidden flex-shrink-0">
                                                        {property.images?.[0] ? (
                                                            <Image
                                                                src={property.images[0]}
                                                                alt={property.name}
                                                                width={64}
                                                                height={48}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Building2 className="w-5 h-5 text-muted-foreground/60" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-foreground text-sm">{property.name}</p>
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                            <MapPin className="w-3 h-3" />
                                                            {property.district || property.city}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={typeBadgeVariant[property.type]}>
                                                    {typeLabels[property.type]}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-foreground tabular-nums">
                                                    {formatPrice(property.price)}
                                                </p>
                                                {property.price_per_sqm && (
                                                    <p className="text-xs text-muted-foreground tabular-nums">
                                                        {formatPrice(property.price_per_sqm)}/м²
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                    {property.size_sqm && (
                                                        <span className="flex items-center gap-1 tabular-nums">
                                                            <Maximize className="w-3.5 h-3.5" />
                                                            {property.size_sqm}м²
                                                        </span>
                                                    )}
                                                    {property.rooms && (
                                                        <span className="flex items-center gap-1 tabular-nums">
                                                            <BedDouble className="w-3.5 h-3.5" />
                                                            {property.rooms}ө
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={statusBadgeVariant[property.status]}>
                                                    {statusLabels[property.status]}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                                                    <Eye className="w-4 h-4" />
                                                    {property.views_count || 0}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Link href={`/dashboard/properties/${property.id}/edit`}>
                                                        <button
                                                            className="p-2 hover:bg-surface-2 rounded-md transition-colors"
                                                            title="Засах"
                                                        >
                                                            <Edit className="w-4 h-4 text-muted-foreground" />
                                                        </button>
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDelete(property.id)}
                                                        className="p-2 hover:bg-status-danger-soft rounded-md transition-colors"
                                                        title="Устгах"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-status-danger" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
