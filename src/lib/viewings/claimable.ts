import { DashboardApiError } from '@/lib/api/dashboardFetch';

/**
 * Уулзалт үүсгэх 409-ийн `claimable` (ViewingService): ирсэн уулзалтын утас төслийн ганц идэвхтэй
 * хариуцагчгүй лидтэй таарсан. Лидийн харагдах нэрийг буцаана — маягт «Хариуцаж аваад бүртгэх»-ийг санал болгоно.
 */
export function claimableLeadName(error: unknown): string | null {
    if (!(error instanceof DashboardApiError) || error.status !== 409) return null;
    const claimable = error.detail?.claimable;
    if (!claimable || typeof claimable !== 'object') return null;
    const name = (claimable as { name?: unknown }).name;
    return typeof name === 'string' && name ? name : null;
}
