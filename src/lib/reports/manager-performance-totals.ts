/** Менежерийн гүйцэтгэлийн нийт (клиентэд аюулгүй — хуудас, API, AI нэг хэлбэр). */
export interface ManagerPerformanceTotals {
    managers: number;
    contracts: number;
    closed: number;
    sales: number;
    collected: number;
    /** Он эхнээс (энэ сар хүртэлх) төлөвлөгөө, төслийн хэмжээний гүйцэтгэл, хувь — тодорхойгүй бол null (0 биш). */
    teamTarget: number | null;
    teamActual: number | null;
    /** Огноогүй гэрээ байгаа тул гүйцэтгэл доод хязгаар («+»). */
    teamLowerBound: boolean;
    teamAttainmentPct: number | null;
    /** Бүтэн жилийн төлөвлөгөө ба түүнээс гүйцэтгэсэн хувь. */
    teamYearTarget: number | null;
    teamYearPct: number | null;
}

export function emptyTotals(): ManagerPerformanceTotals {
    return { managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0, teamTarget: null, teamActual: null, teamLowerBound: false,
        teamAttainmentPct: null, teamYearTarget: null, teamYearPct: null };
}
