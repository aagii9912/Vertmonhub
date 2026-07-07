/**
 * «Миний самбар»-ын виджет тохируулгын PURE логик.
 * Хадгалалт: user_dashboard_prefs.widgets JSONB — эрэмбэлэгдсэн [{id, hidden}].
 * Merge дүрэм: хадгалсан дараалал хэвээр; registry-д шинээр нэмэгдсэн виджет
 * автоматаар (hidden=false) жагсаалтын төгсгөлд орно; registry-ээс хасагдсан
 * id-ууд унана. Ингэснээр шинэ виджет нэвтрүүлэхэд хуучин тохиргоотой
 * хэрэглэгчдэд ч харагдана.
 */

export interface WidgetPref {
    id: string;
    hidden: boolean;
}

export interface WidgetDef {
    id: string;
    label: string;
}

/** Менежерийн самбарын виджетийн канон бүртгэл (default дараалал). */
export const MANAGER_WIDGETS: WidgetDef[] = [
    { id: 'kpis', label: 'Гол үзүүлэлтүүд' },
    { id: 'tasks', label: 'Хийх ажлууд' },
    { id: 'target', label: 'Борлуулалтын зорилт' },
    { id: 'leads', label: 'Миний лидүүд' },
    { id: 'viewings', label: 'Миний уулзалтууд' },
    { id: 'revenueTrend', label: 'Орлогын тренд' },
];

/** Хадгалсан тохиргоог registry-тэй нэгтгэнэ (давхардал/устсан id цэвэрлэж, шинийг нэмнэ). */
export function mergeWidgetPrefs(saved: WidgetPref[], registry: WidgetDef[]): WidgetPref[] {
    const registryIds = new Set(registry.map((w) => w.id));
    const seen = new Set<string>();
    const out: WidgetPref[] = [];

    for (const pref of saved || []) {
        if (!pref || typeof pref.id !== 'string') continue;
        if (!registryIds.has(pref.id) || seen.has(pref.id)) continue;
        seen.add(pref.id);
        out.push({ id: pref.id, hidden: !!pref.hidden });
    }
    for (const w of registry) {
        if (!seen.has(w.id)) out.push({ id: w.id, hidden: false });
    }
    return out;
}

/** Виджетийн харагдацыг эргүүлнэ. */
export function toggleWidget(prefs: WidgetPref[], id: string): WidgetPref[] {
    return prefs.map((p) => (p.id === id ? { ...p, hidden: !p.hidden } : p));
}

/** Виджетийг дээш/доош зөөнө (хил давбал өөрчлөхгүй). */
export function moveWidget(prefs: WidgetPref[], id: string, dir: -1 | 1): WidgetPref[] {
    const idx = prefs.findIndex((p) => p.id === id);
    if (idx < 0) return prefs;
    const target = idx + dir;
    if (target < 0 || target >= prefs.length) return prefs;
    const out = [...prefs];
    [out[idx], out[target]] = [out[target], out[idx]];
    return out;
}
