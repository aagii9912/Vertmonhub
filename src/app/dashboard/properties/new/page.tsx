'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
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
        <div className="min-h-screen bg-surface-2/40 p-6">
            <div className="mb-6">
                <Link href="/dashboard/properties" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Буцах
                </Link>
                <h1 className="text-2xl font-bold text-foreground">Шинэ үл хөдлөх нэмэх</h1>
                <p className="text-muted-foreground mt-1">Үл хөдлөх хөрөнгийн мэдээлэл оруулна уу</p>
            </div>

            <PropertyForm mode="create" onSubmit={handleSubmit} submitLabel="Үүсгэх" />
        </div>
    );
}
