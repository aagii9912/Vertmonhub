'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ArrowLeft, Users, Building2, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function NewLeadPage() {
    const router = useRouter();
    const { shop } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        customer_name: '',
        phone: '',
        email: '',
        source: 'website',
        budget_min: '',
        budget_max: '',
        preferred_type: 'apartment',
        financing_intent: '',
        notes: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!shop?.id) {
            toast.error('Төсөл сонгогдоогүй байна. Дахин нэвтэрнэ үү.');
            return;
        }
        if (!formData.customer_name.trim()) {
            toast.error('Нэр оруулна уу');
            return;
        }

        setLoading(true);

        // Сервер талд үүсгэнэ — хариуцагч менежер (sales_manager_name) автоматаар тамгалагдана
        try {
            const res = await fetch('/api/dashboard/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-shop-id': shop.id },
                body: JSON.stringify({
                    customer_name: formData.customer_name.trim(),
                    customer_phone: formData.phone.trim() || null,
                    customer_email: formData.email.trim() || null,
                    source: formData.source,
                    preferred_type: formData.preferred_type,
                    financing_intent: formData.financing_intent || null,
                    budget_min: formData.budget_min ? Number(formData.budget_min) : null,
                    budget_max: formData.budget_max ? Number(formData.budget_max) : null,
                    notes: formData.notes.trim() || null,
                    status: 'new',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Лийд хадгалахад алдаа гарлаа');
            }
        } catch (error) {
            setLoading(false);
            toast.error(error instanceof Error ? error.message : 'Лийд хадгалахад алдаа гарлаа');
            return;
        }

        toast.success('Лийд амжилттай нэмэгдлээ!');
        router.push('/dashboard/leads');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSelect = (name: keyof typeof formData) => (value: string) => {
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return (
        <div className="p-6">
            <PageHeader
                eyebrow="Лийд"
                title="Шинэ лийд нэмэх"
                subtitle="Боломжит худалдан авагчийн мэдээлэл оруулна уу"
                breadcrumbs={[
                    { label: 'Лийдүүд', href: '/dashboard/leads' },
                    { label: 'Шинэ лийд' },
                ]}
                secondaryActions={
                    <Button variant="outline" href="/dashboard/leads">
                        <ArrowLeft className="w-4 h-4" />
                        Буцах
                    </Button>
                }
            />

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
                            <FormField label="Нэр" htmlFor="customer_name" required>
                                <Input
                                    id="customer_name"
                                    name="customer_name"
                                    value={formData.customer_name}
                                    onChange={handleChange}
                                    placeholder="Батбаяр Ганбат"
                                    required
                                />
                            </FormField>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Утас" htmlFor="phone">
                                    <Input
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="99112233"
                                    />
                                </FormField>
                                <FormField label="Имэйл" htmlFor="email">
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="email@example.com"
                                    />
                                </FormField>
                            </div>
                            <FormField label="Эх үүсвэр" htmlFor="source">
                                <Select value={formData.source} onValueChange={handleSelect('source')}>
                                    <SelectTrigger id="source">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="messenger">Messenger</SelectItem>
                                        <SelectItem value="facebook">Facebook</SelectItem>
                                        <SelectItem value="instagram">Instagram</SelectItem>
                                        <SelectItem value="website">Вэбсайт</SelectItem>
                                        <SelectItem value="referral">Зөвлөмж</SelectItem>
                                        <SelectItem value="phone">Утас</SelectItem>
                                        <SelectItem value="tv">ТВ</SelectItem>
                                        <SelectItem value="radio">Радио</SelectItem>
                                        <SelectItem value="meeting">Уулзалт</SelectItem>
                                        <SelectItem value="event">Өдөрлөг</SelectItem>
                                        <SelectItem value="board">Билборд / Самбар</SelectItem>
                                        <SelectItem value="other">Бусад</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
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
                            <FormField label="Сонирхож буй төрөл" htmlFor="preferred_type">
                                <Select value={formData.preferred_type} onValueChange={handleSelect('preferred_type')}>
                                    <SelectTrigger id="preferred_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="apartment">Орон сууц</SelectItem>
                                        <SelectItem value="house">Хувийн байшин</SelectItem>
                                        <SelectItem value="office">Оффис</SelectItem>
                                        <SelectItem value="commercial">Худалдааны</SelectItem>
                                        <SelectItem value="land">Газар</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Санхүүжилтийн суваг" htmlFor="financing_intent">
                                <Select
                                    value={formData.financing_intent || undefined}
                                    onValueChange={handleSelect('financing_intent')}
                                >
                                    <SelectTrigger id="financing_intent">
                                        <SelectValue placeholder="— Сонгох —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bank_loan">Банкны зээл</SelectItem>
                                        <SelectItem value="cash">Бэлэн төлөлт</SelectItem>
                                        <SelectItem value="mortgage">Ипотек</SelectItem>
                                        <SelectItem value="leasing">Хувь лизинг</SelectItem>
                                        <SelectItem value="barter">Бартер</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Төсөв (доод)" htmlFor="budget_min">
                                    <Input
                                        id="budget_min"
                                        name="budget_min"
                                        type="number"
                                        value={formData.budget_min}
                                        onChange={handleChange}
                                        placeholder="300000000"
                                    />
                                </FormField>
                                <FormField label="Төсөв (дээд)" htmlFor="budget_max">
                                    <Input
                                        id="budget_max"
                                        name="budget_max"
                                        type="number"
                                        value={formData.budget_max}
                                        onChange={handleChange}
                                        placeholder="500000000"
                                    />
                                </FormField>
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
                            <Textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                rows={4}
                                placeholder="Нэмэлт мэдээлэл, тайлбар..."
                            />
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            isLoading={loading}
                            className="px-8"
                        >
                            {loading ? 'Хадгалж байна...' : 'Хадгалах'}
                        </Button>
                        <Button variant="outline" href="/dashboard/leads">
                            Цуцлах
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
