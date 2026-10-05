import { buildManagerActivity, type ActivityGroup, type BuildActivityInput } from '../../src/lib/sales/activity';
import { ubDateStr } from '../../src/lib/utils/date';

/**
 * GET /api/dashboard/reports/manager-activity-ийн fixture — бодит builder-ээр (хувийн горим: зөвхөн өөрийн мөр).
 * `extra`-аар дуудлага, уулзалт, өдрийн зорилт нэмнэ.
 */
export function managerActivityFixture(url: URL, manager: string, extra: Partial<BuildActivityInput> = {}) {
    const today = ubDateStr();
    const from = url.searchParams.get('from') ?? today;
    const to = url.searchParams.get('to') ?? from;
    const group = (url.searchParams.get('group') ?? 'day') as ActivityGroup;
    return {
        ...buildManagerActivity({ from, to, group, now: new Date(), roster: [{ name: manager, user_id: null, is_active: true }],
            calls: [], meetings: [], requests: [], targets: [], only: manager, ...extra }),
        personal: true, onboarding: false, canEdit: false,
    };
}
