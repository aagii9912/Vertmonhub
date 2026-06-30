'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import PropertyForm from '../../_components/PropertyForm';
import type { Property } from '@/types/property';

interface EditPageProps {
    params: Promise<{ id: string }>;
}

export default function EditPropertyPage({ params }: EditPageProps) {
    const { id } = use(params);
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProperty = async () => {
            try {
                const res = await fetch(`/api/properties/${id}`, {
                    headers: {
                        'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                    },
                });
                if (!res.ok) {
                    throw new Error('Үл хөдлөх олдсонгүй');
                }
                const data = await res.json();
                setProperty(data.property);
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Татахад алдаа');
                router.push('/dashboard/properties');
            } finally {
                setLoading(false);
            }
        };
        fetchProperty();
    }, [id, router]);

    const handleSubmit = async (payload: Record<string, unknown>) => {
        const res = await fetch(`/api/properties/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || 'Хадгалахад алдаа');
        }
        toast.success('Шинэчлэгдлээ!');
        router.push(`/dashboard/properties/${id}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!property) {
        return null;
    }

    return (
        <div>
            <PageHeader
                title="Үл хөдлөх засах"
                subtitle={property.name}
                breadcrumbs={[
                    { label: 'Үл хөдлөх', href: '/dashboard/properties' },
                    { label: property.name, href: `/dashboard/properties/${id}` },
                    { label: 'Засах' },
                ]}
                secondaryActions={
                    <Button variant="outline" size="sm" href={`/dashboard/properties/${id}`}>
                        <ArrowLeft className="w-4 h-4" />
                        Буцах
                    </Button>
                }
            />

            <PropertyForm
                mode="edit"
                initialData={property}
                onSubmit={handleSubmit}
                submitLabel="Хадгалах"
                propertyId={id}
            />
        </div>
    );
}
