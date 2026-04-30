'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Users, Phone, Mail, DollarSign, Building2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function NewLeadPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        customer_name: '',
        phone: '',
        email: '',
        source: 'website',
        budget_min: '',
        budget_max: '',
        preferred_type: 'apartment',
        notes: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Demo mode - just show success
        setTimeout(() => {
            toast.success('Лийд амжилттай нэмэгдлээ!');
            router.push('/dashboard/leads');
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
                <Link href="/dashboard/leads" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Буцах
                </Link>
                <h1 className="text-2xl font-bold text-foreground">Шинэ лийд нэмэх</h1>
                <p className="text-muted-foreground mt-1">Боломжит худалдан авагчийн мэдээлэл оруулна уу</p>
            </div>

            <form onSubmit={handleSubmit} className="max-w-2xl">
                <div className="grid gap-6">
                    {/* Customer Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-status-success" />
                                Харилцагчийн мэдээлэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Нэр</label>
                                <Input
                                    name="customer_name"
                                    value={formData.customer_name}
                                    onChange={handleChange}
                                    placeholder="Батбаяр Ганбат"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Утас</label>
                                    <Input
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="99112233"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Имэйл</label>
                                    <Input
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="email@example.com"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Эх үүсвэр</label>
                                <select
                                    name="source"
                                    value={formData.source}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="messenger">Messenger</option>
                                    <option value="instagram">Instagram</option>
                                    <option value="website">Вэбсайт</option>
                                    <option value="referral">Зөвлөмж</option>
                                    <option value="phone">Утас</option>
                                    <option value="other">Бусад</option>
                                </select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Requirements */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-status-success" />
                                Шаардлага
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Сонирхож буй төрөл</label>
                                <select
                                    name="preferred_type"
                                    value={formData.preferred_type}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="apartment">Орон сууц</option>
                                    <option value="house">Хувийн байшин</option>
                                    <option value="office">Оффис</option>
                                    <option value="commercial">Худалдааны</option>
                                    <option value="land">Газар</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Төсөв (доод)</label>
                                    <Input
                                        name="budget_min"
                                        type="number"
                                        value={formData.budget_min}
                                        onChange={handleChange}
                                        placeholder="300000000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Төсөв (дээд)</label>
                                    <Input
                                        name="budget_max"
                                        type="number"
                                        value={formData.budget_max}
                                        onChange={handleChange}
                                        placeholder="500000000"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notes */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-status-success" />
                                Тэмдэглэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                rows={4}
                                className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-emerald-500"
                                placeholder="Нэмэлт мэдээлэл, тайлбар..."
                            />
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
                        <Link href="/dashboard/leads">
                            <Button variant="outline">Цуцлах</Button>
                        </Link>
                    </div>
                </div>
            </form>
        </div>
    );
}
