'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Building2,
    Eye,
    DollarSign,
    TrendingUp,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Edit,
    Trash2,
    MapPin,
    BedDouble,
    Maximize,
    ArrowUpRight,
    ChevronDown
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Image from 'next/image';
import Link from 'next/link';
import type { Property, PropertyType, PropertyStatus } from '@/types/property';

// Property Type colors
const typeColors: Record<PropertyType, string> = {
    apartment: 'bg-blue-100 text-blue-700',
    house: 'bg-green-100 text-green-700',
    office: 'bg-purple-100 text-purple-700',
    land: 'bg-amber-100 text-amber-700',
    commercial: 'bg-rose-100 text-rose-700',
};

// Property Status colors
const statusColors: Record<PropertyStatus, string> = {
    available: 'bg-emerald-100 text-emerald-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    sold: 'bg-gray-100 text-gray-700',
    rented: 'bg-blue-100 text-blue-700',
    barter: 'bg-orange-100 text-orange-700',
};

// Mongolian labels
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

    // Fetch properties
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

                if (typeFilter !== 'all') {
                    query = query.eq('type', typeFilter);
                }
                if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }

                const { data, error } = await query;

                if (error) throw error;

                const propertiesData = data as Property[];
                setProperties(propertiesData);

                // Calculate stats
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

    // Filter by search
    const filteredProperties = properties.filter(p => {
        const name = (p.name || (p as any).title || '').toLowerCase();
        return name.includes(searchQuery.toLowerCase()) ||
            p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.district?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Delete property
    const handleDelete = async (id: string) => {
        if (!confirm('Энэ үл хөдлөхийг устгах уу?')) return;

        try {
            const { error } = await supabase
                .from('properties')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setProperties(prev => prev.filter(p => p.id !== id));
            toast.success('Үл хөдлөх амжилттай устгагдлаа');
        } catch (error) {
            console.error('Error deleting property:', error);
            toast.error('Устгахад алдаа гарлаа');
        }
    };

    const formatPrice = (price: number) => {
        if (price >= 1000000000) {
            return `${(price / 1000000000).toFixed(1)}B₮`;
        }
        if (price >= 1000000) {
            return `${(price / 1000000).toFixed(0)}M₮`;
        }
        return `${price.toLocaleString()}₮`;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold text-gray-900">Үл хөдлөх</h1>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Хайх..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 w-64 bg-gray-50 border-gray-200"
                            />
                        </div>
                        <Link href="/dashboard/properties/new">
                            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Plus className="w-4 h-4 mr-2" />
                                Шинэ нэмэх
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {/* VERTMON: Pro banner removed - full access mode */}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Нийт үл хөдлөх</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalProperties}</p>
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3" />
                                        +12% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                    <Building2 className="w-6 h-6 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Нийт үнэ</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(stats.totalValue)}</p>
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3" />
                                        +8% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                    <DollarSign className="w-6 h-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Нийт үзәлт</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalViews.toLocaleString()}</p>
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3" />
                                        +24% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                    <Eye className="w-6 h-6 text-purple-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Дундаж үнэ</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(stats.avgPrice)}</p>
                                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3 rotate-90" />
                                        -2% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters & Table */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-0">
                        {/* Table Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Үл хөдлөх жагсаалт</h3>
                            <div className="flex items-center gap-3">
                                <select
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value as PropertyType | 'all')}
                                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
                                >
                                    <option value="all">Бүх төсөл</option>
                                    <option value="mandala_garden">Mandala Garden</option>
                                    <option value="mandala_tower">360/365 Mandala Tower</option>
                                    <option value="elysium">Elysium Residence</option>
                                </select>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | 'all')}
                                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
                                >
                                    <option value="all">Бүх төлөв</option>
                                    <option value="available">Зарагдаж байна</option>
                                    <option value="reserved">Захиалагдсан</option>
                                    <option value="sold">Зарагдсан</option>
                                    <option value="rented">Түрээслэгдсэн</option>
                                    <option value="barter">Бартер</option>
                                </select>
                                <Button variant="outline" size="sm" className="text-gray-600">
                                    Дэлгэрэнгүй шүүлт
                                </Button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үл хөдлөх</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Төрөл</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үнэ</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Хэмжээ</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Төлөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үзэлт</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                                    Татаж байна...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredProperties.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                                <p>Үл хөдлөх олдсонгүй</p>
                                                <Link href="/dashboard/properties/new" className="text-emerald-600 hover:underline mt-2 inline-block">
                                                    Анхны үл хөдлөхөө нэмэх
                                                </Link>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProperties.map((property) => (
                                            <tr key={property.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
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
                                                                    <Building2 className="w-5 h-5 text-gray-400" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900 text-sm">{property.name}</p>
                                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                                <MapPin className="w-3 h-3" />
                                                                {property.district || property.city}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${typeColors[property.type]}`}>
                                                        {typeLabels[property.type]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-gray-900">{formatPrice(property.price)}</p>
                                                    {property.price_per_sqm && (
                                                        <p className="text-xs text-gray-500">{formatPrice(property.price_per_sqm)}/м²</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                                        {property.size_sqm && (
                                                            <span className="flex items-center gap-1">
                                                                <Maximize className="w-3.5 h-3.5" />
                                                                {property.size_sqm}м²
                                                            </span>
                                                        )}
                                                        {property.rooms && (
                                                            <span className="flex items-center gap-1">
                                                                <BedDouble className="w-3.5 h-3.5" />
                                                                {property.rooms}ө
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[property.status]}`}>
                                                        {statusLabels[property.status]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                                        <Eye className="w-4 h-4" />
                                                        {property.views_count || 0}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link href={`/dashboard/properties/${property.id}/edit`}>
                                                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                                                <Edit className="w-4 h-4 text-gray-500" />
                                                            </button>
                                                        </Link>
                                                        <button
                                                            onClick={() => handleDelete(property.id)}
                                                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-500" />
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
        </div>
    );
}
