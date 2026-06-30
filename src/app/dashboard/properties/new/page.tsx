'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import PropertyForm from '../_components/PropertyForm';

export default function NewPropertyPage() {
    const router = useRouter();

    const handleSubmit = async (payload: Record<string, unknown>) => {
        const res = await fetch('/api/properties', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || 'Хадгалахад алдаа гарлаа');
        }
        toast.success('Үл хөдлөх амжилттай нэмэгдлээ!');
        router.push('/dashboard/properties');
    };

    return (
        <div>
            <PageHeader
                title="Шинэ үл хөдлөх нэмэх"
                subtitle="Үл хөдлөх хөрөнгийн мэдээлэл оруулна уу"
                breadcrumbs={[
                    { label: 'Үл хөдлөх', href: '/dashboard/properties' },
                    { label: 'Шинэ' },
                ]}
                secondaryActions={
                    <Button variant="outline" size="sm" href="/dashboard/properties">
                        <ArrowLeft className="w-4 h-4" />
                        Буцах
                    </Button>
                }
            />

            <PropertyForm mode="create" onSubmit={handleSubmit} submitLabel="Үүсгэх" />
        </div>
    );
}
