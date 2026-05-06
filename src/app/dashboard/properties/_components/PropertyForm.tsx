'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Building2,
  Upload,
  MapPin,
  Maximize,
  X,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Property, PropertyType, PropertyStatus } from '@/types/property';

const TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: 'apartment', label: 'Орон сууц' },
  { value: 'house', label: 'Хувийн байшин' },
  { value: 'office', label: 'Оффис' },
  { value: 'land', label: 'Газар' },
  { value: 'commercial', label: 'Худалдааны' },
];

const STATUS_OPTIONS: Array<{ value: PropertyStatus; label: string }> = [
  { value: 'available', label: 'Зарагдаж байна' },
  { value: 'reserved', label: 'Захиалагдсан' },
  { value: 'sold', label: 'Зарагдсан' },
  { value: 'rented', label: 'Түрээслэгдсэн' },
  { value: 'barter', label: 'Бартер' },
];

const DISTRICT_OPTIONS = [
  'Сүхбаатар',
  'Хан-Уул',
  'Баянзүрх',
  'Баянгол',
  'Чингэлтэй',
  'Сонгинохайрхан',
  'Налайх',
  'Багануур',
  'Багахангай',
];

export interface PropertyFormData {
  name: string;
  description: string;
  type: PropertyType;
  price: string;
  price_per_sqm: string;
  size_sqm: string;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  year_built: string;
  address: string;
  district: string;
  city: string;
  status: PropertyStatus;
  is_active: boolean;
  is_featured: boolean;
  images: string[];
  features: string[];
  amenities: string[];
}

const EMPTY_FORM: PropertyFormData = {
  name: '',
  description: '',
  type: 'apartment',
  price: '',
  price_per_sqm: '',
  size_sqm: '',
  rooms: '',
  bedrooms: '',
  bathrooms: '',
  floor: '',
  year_built: '',
  address: '',
  district: '',
  city: 'Ulaanbaatar',
  status: 'available',
  is_active: true,
  is_featured: false,
  images: [],
  features: [],
  amenities: [],
};

export function fromProperty(p: Property): PropertyFormData {
  return {
    name: p.name || '',
    description: p.description || '',
    type: p.type,
    price: p.price?.toString() || '',
    price_per_sqm: p.price_per_sqm?.toString() || '',
    size_sqm: p.size_sqm?.toString() || '',
    rooms: p.rooms?.toString() || '',
    bedrooms: p.bedrooms?.toString() || '',
    bathrooms: p.bathrooms?.toString() || '',
    floor: p.floor || '',
    year_built: p.year_built?.toString() || '',
    address: p.address || '',
    district: p.district || '',
    city: p.city || 'Ulaanbaatar',
    status: p.status,
    is_active: p.is_active ?? true,
    is_featured: p.is_featured ?? false,
    images: Array.isArray(p.images) ? p.images : [],
    features: Array.isArray(p.features) ? p.features : [],
    amenities: Array.isArray(p.amenities) ? p.amenities : [],
  };
}

export function toApiPayload(f: PropertyFormData) {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const intNum = (v: string) => (v.trim() === '' ? null : Math.trunc(Number(v)));
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    type: f.type,
    price: num(f.price) ?? 0,
    price_per_sqm: num(f.price_per_sqm),
    size_sqm: num(f.size_sqm),
    rooms: intNum(f.rooms),
    bedrooms: intNum(f.bedrooms),
    bathrooms: intNum(f.bathrooms),
    floor: f.floor.trim() || null,
    year_built: intNum(f.year_built),
    address: f.address.trim() || null,
    district: f.district.trim() || null,
    city: f.city.trim() || 'Ulaanbaatar',
    status: f.status,
    is_active: f.is_active,
    is_featured: f.is_featured,
    images: f.images,
    features: f.features,
    amenities: f.amenities,
  };
}

interface PropertyFormProps {
  mode: 'create' | 'edit';
  initialData?: Property;
  onSubmit: (payload: ReturnType<typeof toApiPayload>) => Promise<void>;
  submitLabel?: string;
  propertyId?: string;
}

export default function PropertyForm({ mode, initialData, onSubmit, submitLabel, propertyId }: PropertyFormProps) {
  const [formData, setFormData] = useState<PropertyFormData>(
    initialData ? fromProperty(initialData) : EMPTY_FORM
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleField = <K extends keyof PropertyFormData>(key: K, value: PropertyFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploadedUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('property_id', propertyId || 'unassigned');
        const res = await fetch('/api/properties/upload', {
          method: 'POST',
          body: fd,
          headers: {
            'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
          },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || 'Зураг хуулахад алдаа');
        }
        const { url } = await res.json();
        uploadedUrls.push(url);
      }
      setFormData((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      toast.success(`${uploadedUrls.length} зураг нэмлээ`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Зураг хуулахад алдаа');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Нэр шаардлагатай');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(toApiPayload(formData));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Хадгалахад алдаа');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl">
      <div className="grid gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand" />
              Үндсэн мэдээлэл
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Нэр <span className="text-status-danger">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => handleField('name', e.target.value)}
                placeholder="Жишээ: 3 өрөө байр, Зайсан"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Төрөл</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleField('type', e.target.value as PropertyType)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-ring/40 bg-background"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Төлөв</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleField('status', e.target.value as PropertyStatus)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-ring/40 bg-background"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Үнэ (₮) <span className="text-status-danger">*</span></label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => handleField('price', e.target.value)}
                  placeholder="450000000"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">м²-ийн үнэ (₮)</label>
                <Input
                  type="number"
                  value={formData.price_per_sqm}
                  onChange={(e) => handleField('price_per_sqm', e.target.value)}
                  placeholder="3500000"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Тайлбар</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleField('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-ring/40 bg-background"
                placeholder="Үл хөдлөхийн дэлгэрэнгүй тайлбар..."
              />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleField('is_active', e.target.checked)}
                />
                Идэвхтэй
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_featured}
                  onChange={(e) => handleField('is_featured', e.target.checked)}
                />
                Онцлох
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Maximize className="w-5 h-5 text-brand" />
              Дэлгэрэнгүй
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Хэмжээ (м²)</label>
                <Input
                  type="number"
                  value={formData.size_sqm}
                  onChange={(e) => handleField('size_sqm', e.target.value)}
                  placeholder="120"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Өрөөний тоо</label>
                <Input
                  type="number"
                  value={formData.rooms}
                  onChange={(e) => handleField('rooms', e.target.value)}
                  placeholder="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Унтлагын өрөө</label>
                <Input
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => handleField('bedrooms', e.target.value)}
                  placeholder="2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Угаалгын өрөө</label>
                <Input
                  type="number"
                  value={formData.bathrooms}
                  onChange={(e) => handleField('bathrooms', e.target.value)}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Давхар</label>
                <Input
                  value={formData.floor}
                  onChange={(e) => handleField('floor', e.target.value)}
                  placeholder="5/12"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Ашиглалтанд орсон он</label>
                <Input
                  type="number"
                  value={formData.year_built}
                  onChange={(e) => handleField('year_built', e.target.value)}
                  placeholder="2024"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-brand" />
              Байршил
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Дүүрэг</label>
                <select
                  value={formData.district}
                  onChange={(e) => handleField('district', e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-ring/40 bg-background"
                >
                  <option value="">Сонгоно уу</option>
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Хот</label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleField('city', e.target.value)}
                  placeholder="Ulaanbaatar"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Хаяг</label>
              <Input
                value={formData.address}
                onChange={(e) => handleField('address', e.target.value)}
                placeholder="Зайсан, 12-р хороо"
              />
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand" />
              Зураг ({formData.images.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {formData.images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
                {formData.images.map((url, idx) => (
                  <div key={idx} className="relative aspect-square bg-surface-2 rounded-md overflow-hidden group">
                    <Image
                      src={url}
                      alt={`Зураг ${idx + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 25vw"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-foreground/70 text-background rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Устгах"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="cursor-pointer block">
              <div className="border-2 border-dashed border-border-strong rounded-lg p-8 text-center hover:bg-surface-2/50 transition-colors">
                {uploading ? (
                  <>
                    <Loader2 className="w-12 h-12 text-brand mx-auto mb-4 animate-spin" />
                    <p className="text-muted-foreground">Хуулж байна...</p>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-12 h-12 text-muted-foreground/70 mx-auto mb-4" />
                    <p className="text-muted-foreground">Зураг сонгох (олон зэрэг боломжтой)</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">JPG, PNG, WebP — 8MB-аас бага</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={(e) => handleImagesUpload(e.target.files)}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={submitting || uploading}
            isLoading={submitting}
            variant="primary"
          >
            {submitLabel || (mode === 'create' ? 'Үүсгэх' : 'Хадгалах')}
          </Button>
        </div>
      </div>
    </form>
  );
}
