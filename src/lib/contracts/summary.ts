/**
 * Гэрээний жагсаалтын нэгтгэл — жагсаалтын API (статистик ба шүүлтийн хөл) ба AI `get_contracts_summary` нэг дүрмээр.
 * Цэвэр (DB-гүй), клиентэд аюулгүй.
 *
 *  • Цуцалсан гэрээ тоонд (total, cancelled) орно, мөнгөн дүн, талбайд ОРОХГҮЙ.
 *  • Төлсөн дүн NULL (ERP-ээс ирсэн, мэдэгдэхгүй) бол нийлбэрт 0 гэж нэмэхгүй — unknown_paid-д тоологдоно.
 *  • Төлбөр хоцролт ₮ нь файлын огноотой snapshot: сүүлийн HUB файлын огноотой (overdue_as_of) мөр л нийлбэрт;
 *    өмнөх файлынх хуучирсан (overdue_stale). Импорт хийгээгүй төсөлд мэдэгдэж буй бүх утгын нийлбэр.
 *    Хадгалсан утга огт байхгүй бол null («—»), 0 биш.
 */

export interface ContractSummaryRow {
    contract_status?: string | null;
    total_price?: number | string | null;
    prepayment_due?: number | string | null;
    paid_amount?: number | string | null;
    balance?: number | string | null;
    contracted_area?: number | string | null;
    overdue_amount?: number | string | null;
    overdue_as_of?: string | null;
    overdue_days?: number | string | null;
}

export interface ContractSummary {
    /** Бүх гэрээ (цуцалсан орно). */
    total: number;
    active: number;
    closed: number;
    cancelled: number;
    transferred: number;
    /** Σ total_price — цуцалсныг хассан. */
    total_sales: number;
    /** Σ prepayment_due — гэрээний нөхцлөөр төлөх урьдчилгаа (орсон мөнгө биш), цуцалсныг хассан. */
    prepayment_due: number;
    /** Σ overdue_amount (сүүлийн файлын огноотой мөр); хадгалсан утга алга бол null. */
    overdue_amount: number | null;
    /** overdue_amount-ийн огноо (сүүлийн HUB файл); импортгүй бол null. */
    overdue_as_of: string | null;
    /** overdue_amount > 0 гэрээний тоо (нийлбэрт орсон мөрөөс). */
    overdue_count: number;
    /** Хоцролт нь өмнөх файлын огноотой мөр (сүүлийн файлд байгаагүй) — нийлбэрт ороогүй. */
    overdue_stale: number;
    /** overdue_days > 0 (cron-ийн хоногийн тооцоо) — цуцалсныг хассан. */
    overdue_days_count: number;
    /** Мэдэгдэж буй төлсөн дүнгийн нийлбэр (цуцалсныг хассан). */
    total_paid: number;
    total_balance: number;
    /** Төлсөн дүн тодорхойгүй (NULL) гэрээ — цуцалсныг хассан. */
    unknown_paid: number;
    /** Σ гэрээлсэн талбай (м²) — цуцалсныг хассан. */
    area: number;
}

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

/** Мөнгө, талбайг центээр нэмнэ (хөвөгч таслалын үлдэгдэлгүй). */
class CentSum {
    private cents = 0;
    add(value: number | null) {
        if (value !== null) this.cents += Math.round(value * 100);
    }
    get value() {
        return this.cents / 100;
    }
}

export function summarizeContracts(rows: readonly ContractSummaryRow[], options: { latestImportDate?: string | null } = {}): ContractSummary {
    const latest = options.latestImportDate || null;
    const sales = new CentSum();
    const prepayment = new CentSum();
    const overdue = new CentSum();
    const paid = new CentSum();
    const balance = new CentSum();
    const area = new CentSum();
    const summary: ContractSummary = {
        total: 0, active: 0, closed: 0, cancelled: 0, transferred: 0,
        total_sales: 0, prepayment_due: 0, overdue_amount: null, overdue_as_of: latest, overdue_count: 0, overdue_stale: 0,
        overdue_days_count: 0, total_paid: 0, total_balance: 0, unknown_paid: 0, area: 0,
    };
    let overdueKnown = false;

    for (const row of rows) {
        summary.total += 1;
        const status = row.contract_status;
        if (status === 'cancelled') {
            summary.cancelled += 1;
            continue;
        }
        if (status === 'closed') summary.closed += 1;
        else if (status === 'transferred') summary.transferred += 1;
        else summary.active += 1;

        sales.add(toNumber(row.total_price));
        prepayment.add(toNumber(row.prepayment_due));
        area.add(toNumber(row.contracted_area));
        const paidAmount = toNumber(row.paid_amount);
        if (paidAmount === null) summary.unknown_paid += 1;
        paid.add(paidAmount);
        balance.add(toNumber(row.balance));
        if ((toNumber(row.overdue_days) ?? 0) > 0) summary.overdue_days_count += 1;

        const overdueAmount = toNumber(row.overdue_amount);
        if (overdueAmount === null) continue;
        if (latest && row.overdue_as_of !== latest) {
            summary.overdue_stale += 1;
            continue;
        }
        overdueKnown = true;
        overdue.add(overdueAmount);
        if (overdueAmount > 0) summary.overdue_count += 1;
    }

    summary.total_sales = sales.value;
    summary.prepayment_due = prepayment.value;
    summary.overdue_amount = overdueKnown ? overdue.value : null;
    summary.total_paid = paid.value;
    summary.total_balance = balance.value;
    summary.area = area.value;
    return summary;
}
