'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Building2, Upload, MapPin, Bed, Bath, Maximize, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function NewPropertyPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        type: 'mandala_garden',
        price: '',
        size: '',
        bedrooms: '',
        bathrooms: '',
        address: '',
        district: '',
        description: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Demo mode - just show success
        setTimeout(() => {
            toast.success('Үл хөдлөх амжилттай нэмэгдлээ!');
            router.push('/dashboard/properties');
        }, 1000);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    return (
        <div className="min-h-screen bg-surface-2/40 p-6">
            {/* Header */}
            <div className="mb-6">
                <Link href="/dashboard/properties" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Буцах
                </Link>
                <h1 className="text-2xl font-bold text-foreground">Шинэ үл хөдлөх нэмэх</h1>
                <p className="text-muted-foreground mt-1">Үл хөдлөх хөрөнгийн мэдээлэл оруулна уу</p>
            </div>

            <form onSubmit={handleSubmit} className="max-w-3xl">
                <div className="grid gap-6">
                    {/* Basic Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-status-success" />
                                Үндсэн мэдээлэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Нэр</label>
                                <Input
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Жишээ: 3 өрөө байр, Зайсан"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Төрөл</label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="mandala_garden">Mandala Garden</option>
                                        <option value="mandala_tower">360/365 Mandala Tower</option>
                                        <option value="elysium">Elysium Residence</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Үнэ (₮)</label>
                                    <Input
                                        name="price"
                                        type="number"
                                        value={formData.price}
                                        onChange={handleChange}
                                        placeholder="450000000"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Тайлбар</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Үл хөдлөхийн дэлгэрэнгүй тайлбар..."
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Maximize className="w-5 h-5 text-status-success" />
                                Дэлгэрэнгүй
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Хэмжээ (м²)</label>
                                    <Input
                                        name="size"
                                        type="number"
                                        value={formData.size}
                                        onChange={handleChange}
                                        placeholder="120"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Унтлагын өрөө</label>
                                    <Input
                                        name="bedrooms"
                                        type="number"
                                        value={formData.bedrooms}
                                        onChange={handleChange}
                                        placeholder="3"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Угаалгын өрөө</label>
                                    <Input
                                        name="bathrooms"
                                        type="number"
                                        value={formData.bathrooms}
                                        onChange={handleChange}
                                        placeholder="2"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Location */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-status-success" />
                                Байршил
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Дүүрэг</label>
                                <select
                                    name="district"
                                    value={formData.district}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="">Сонгоно уу</option>
                                    <option value="sukhbaatar">Сүхбаатар</option>
                                    <option value="khan-uul">Хан-Уул</option>
                                    <option value="bayanzurkh">Баянзүрх</option>
                                    <option value="bayangol">Баянгол</option>
                                    <option value="chingeltei">Чингэлтэй</option>
                                    <option value="songinokhairkhan">Сонгинохайрхан</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Хаяг</label>
                                <Input
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    placeholder="Зайсан, 12-р хороо"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Images */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Upload className="w-5 h-5 text-status-success" />
                                Зураг
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="border-2 border-dashed border-border-strong rounded-lg p-8 text-center">
                                <Upload className="w-12 h-12 text-muted-foreground/70 mx-auto mb-4" />
                                <p className="text-muted-foreground">Зураг чирж оруулна уу эсвэл</p>
                                <Button variant="outline" className="mt-2">
                                    Файл сонгох
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-status-success hover:opacity-90 text-white px-8"
                        >
                            {loading ? 'Хадгалж байна...' : 'Хадгалах'}
                        </Button>
                        <Link href="/dashboard/properties">
                            <Button variant="outline">Цуцлах</Button>
                        </Link>
                    </div>
                </div>
            </form>
        </div>
    );
}
