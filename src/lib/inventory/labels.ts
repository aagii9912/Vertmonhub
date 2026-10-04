/**
 * Байрны нөөцийн нэр томьёо — НЭГ эх сурвалж.
 * `property_units` (блокийн нэгж): ангилал + төлөв. Хуучин `properties` жагсаалт
 * ба лидийн сонирхол (`preferred_type`): төрөл + төлөв. Хуудсууд өөрсдийн map-гүй.
 */
import type { Tone } from '@/lib/leads/labels';
import type { PropertyStatus, PropertyType } from '@/types/property';

export type InventoryCategory = 'residential' | 'parking' | 'industry' | 'commercial';
export type InventoryStatus = 'available' | 'reserved' | 'ordered' | 'sold' | 'handed_over';

export const UNIT_CATEGORY_LABEL: Record<InventoryCategory, string> = {
    residential: 'Орон сууц',
    parking: 'Зогсоол',
    industry: 'Агуулах',
    commercial: 'Үйлчилгээ',
};
export const UNIT_CATEGORIES = Object.keys(UNIT_CATEGORY_LABEL) as InventoryCategory[];

/** Борлуулалтын дарааллаар (чөлөөтэй → хүлээлгэсэн). */
export const UNIT_STATUS_LABEL: Record<InventoryStatus, string> = {
    available: 'Чөлөөтэй',
    ordered: 'Захиалсан',
    reserved: 'Хадгалсан',
    sold: 'Зарагдсан',
    handed_over: 'Хүлээлгэсэн',
};
export const UNIT_STATUSES = Object.keys(UNIT_STATUS_LABEL) as InventoryStatus[];

function lookup<K extends string, V>(map: Record<K, V>, value: string | null | undefined): V | undefined {
    return value && Object.hasOwn(map, value) ? map[value as K] : undefined;
}

// Мэдэгдэхгүй (гараар/хуучин) утгыг өөрөөр нь харуулна.
export const unitCategoryLabel = (value: string | null | undefined) => lookup(UNIT_CATEGORY_LABEL, value) || value || '—';
export const unitStatusLabel = (value: string | null | undefined) => lookup(UNIT_STATUS_LABEL, value) || value || '—';

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
    apartment: 'Орон сууц',
    house: 'Хувийн байшин',
    office: 'Оффис',
    land: 'Газар',
    commercial: 'Худалдааны',
};
export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];
export const propertyTypeLabel = (value: string | null | undefined) => lookup(PROPERTY_TYPE_LABEL, value) || value || '—';

export const PROPERTY_STATUS_META: Record<PropertyStatus, { label: string; tone: Tone }> = {
    available: { label: 'Чөлөөтэй',    tone: 'success' },
    reserved:  { label: 'Захиалсан',   tone: 'pending' },
    sold:      { label: 'Зарагдсан',   tone: 'neutral' },
    rented:    { label: 'Түрээслэсэн', tone: 'info' },
    barter:    { label: 'Бартер',      tone: 'pending' },
};
export const PROPERTY_STATUSES = Object.keys(PROPERTY_STATUS_META) as PropertyStatus[];

export const propertyStatusLabel = (value: string | null | undefined) => lookup(PROPERTY_STATUS_META, value)?.label || value || '—';
export const propertyStatusTone = (value: string | null | undefined): Tone => lookup(PROPERTY_STATUS_META, value)?.tone || 'neutral';
