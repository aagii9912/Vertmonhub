/**
 * Хяналтын давхаргын ЦЭВЭР (pure) тооцоолол — I/O байхгүй тул тестлэгдэнэ.
 *
 * Энд байгаа логикийг AI tool (`get_anomalies`), REST API (`/api/dashboard/activity`)
 * болон өдөр тутмын cron (`/api/cron/anomaly-watch`) гурвуулаа ДАХИН АШИГЛАНА —
 * ингэснээр «идэвхгүй менежер» гэдэг ойлголт гурван газар өөр өөрөөр
 * тодорхойлогдох эрсдэлгүй болно.
 */

export interface ManagerRow {
    name: string;
    is_active?: boolean | null;
}

export interface ActivityRow {
    actor_name?: string | null;
    kind?: string;
    outcome?: string | null;
    occurred_at?: string | null;
    entity_type?: string;
    body?: string | null;
}

export interface LeadRow {
    id: string;
    customer_name?: string | null;
    sales_manager_name?: string | null;
    status?: string | null;
    updated_at?: string | null;
    next_followup_at?: string | null;
}

export type AnomalyKind = 'no_activity' | 'cold_lead' | 'overdue_followup' | 'unassigned_lead';
export type AnomalySeverity = 'info' | 'warn' | 'critical';

export interface Anomaly {
    kind: AnomalyKind;
    severity: AnomalySeverity;
    manager: string | null;
    /** Хүнд ойлгомжтой монгол тайлбар. */
    message: string;
    detail: Record<string, unknown>;
}

export interface AnomalyInput {
    managers: ManagerRow[];
    activities: ActivityRow[];
    leads: LeadRow[];
    /** Хэдэн хоног хөндөөгүй лийдийг «хүйтэн» гэж үзэх. */
    staleDays: number;
    /** Хэдэн хоног үйл ажиллагаагүй менежерийг тэмдэглэх. */
    inactiveDays: number;
    now: Date;
}

const dayMs = 24 * 60 * 60 * 1000;

function daysBetween(from: string | null | undefined, now: Date): number | null {
    if (!from) return null;
    const t = new Date(from).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((now.getTime() - t) / dayMs);
}

/**
 * Аномалиудыг тооцно. Дараалал: хамгийн ноцтой нь эхэнд.
 *
 * ЧУХАЛ: `activities` хоосон байх нь «бүгд идэвхгүй» гэсэн үг БИШ байж болно
 * (миграци ороогүй / бүртгэл эхлээгүй). Тиймээс идэвхгүйн шалгалтыг зөвхөн
 * бүртгэлд ямар нэг мөр байгаа үед л хийнэ — эс бөгөөс шинэ орчинд бүх
 * менежерийг худал «идэвхгүй» гэж зарлана.
 */
export function computeAnomalies(input: AnomalyInput): Anomaly[] {
    const { managers, activities, leads, staleDays, inactiveDays, now } = input;
    const out: Anomaly[] = [];

    const activeManagers = managers.filter((m) => m.is_active !== false).map((m) => m.name);

    // ---- 1) Идэвхгүй менежер ----
    if (activities.length > 0) {
        const acted = new Set(
            activities.map((a) => (a.actor_name || '').trim()).filter(Boolean),
        );
        for (const name of activeManagers) {
            if (!acted.has(name)) {
                out.push({
                    kind: 'no_activity',
                    severity: 'warn',
                    manager: name,
                    message: `${name}: сүүлийн ${inactiveDays} хоногт бүртгэгдсэн үйл ажиллагаа алга`,
                    detail: { inactiveDays },
                });
            }
        }
    }

    // ---- 2) Хугацаа хэтэрсэн дагалт ----
    const overdue = leads.filter((l) => {
        if (!l.next_followup_at) return false;
        const t = new Date(l.next_followup_at).getTime();
        return !Number.isNaN(t) && t < now.getTime();
    });
    for (const l of overdue) {
        const late = daysBetween(l.next_followup_at, now);
        out.push({
            kind: 'overdue_followup',
            severity: (late ?? 0) >= 3 ? 'critical' : 'warn',
            manager: l.sales_manager_name || null,
            message:
                `${l.customer_name || 'Лийд'}: дагалтын хугацаа ` +
                `${late != null ? `${late} хоног` : ''} хэтэрсэн`,
            detail: { leadId: l.id, daysLate: late, manager: l.sales_manager_name || null },
        });
    }

    // ---- 3) Хүйтэн лид (удаан хөндөөгүй, дагалт ч товлоогүй) ----
    const overdueIds = new Set(overdue.map((l) => l.id));
    for (const l of leads) {
        if (overdueIds.has(l.id)) continue;
        if (l.next_followup_at) continue; // дагалт товлосон бол хүйтэн биш
        const idle = daysBetween(l.updated_at, now);
        if (idle != null && idle >= staleDays) {
            out.push({
                kind: 'cold_lead',
                severity: idle >= staleDays * 3 ? 'critical' : 'info',
                manager: l.sales_manager_name || null,
                message: `${l.customer_name || 'Лийд'}: ${idle} хоног хөндөөгүй, дараагийн алхам товлоогүй`,
                detail: { leadId: l.id, idleDays: idle, manager: l.sales_manager_name || null },
            });
        }
    }

    // ---- 4) Эзэнгүй лид ----
    for (const l of leads) {
        if (!l.sales_manager_name || !l.sales_manager_name.trim()) {
            out.push({
                kind: 'unassigned_lead',
                severity: 'warn',
                manager: null,
                message: `${l.customer_name || 'Лийд'}: хариуцагч менежер хуваарилаагүй`,
                detail: { leadId: l.id },
            });
        }
    }

    const rank: Record<AnomalySeverity, number> = { critical: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Аномалиудыг менежерээр бүлэглэж товч тоо гаргана (push мэдэгдэлд). */
export function summarizeAnomalies(anomalies: Anomaly[]): {
    critical: number;
    warn: number;
    info: number;
    byManager: Array<{ manager: string; count: number }>;
} {
    const byManager = new Map<string, number>();
    let critical = 0, warn = 0, info = 0;

    for (const a of anomalies) {
        if (a.severity === 'critical') critical++;
        else if (a.severity === 'warn') warn++;
        else info++;
        if (a.manager) byManager.set(a.manager, (byManager.get(a.manager) || 0) + 1);
    }

    return {
        critical, warn, info,
        byManager: [...byManager.entries()]
            .map(([manager, count]) => ({ manager, count }))
            .sort((a, b) => b.count - a.count),
    };
}
