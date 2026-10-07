/**
 * Тестийн санах ойн Supabase (PostgREST) client — service/route тестэд зориулсан жижиг дуураймал.
 * Дэмжих: select (count/head), insert (нэг/олон мөр), upsert (onConflict түлхүүрээр), update, delete, eq/neq/is/in/ilike/or (энгийн
 * `col.op.value`), order (олон түлхүүр), range/limit, maybeSingle/single, await.
 * DB-ийн хязгаарлалтыг `constraints` hook-оор дуурайна (unique → 23505, FK → 23503 гэх мэт).
 */
type Row = Record<string, any>;
type DbError = { code: string; message: string };

export interface MemoryDbConstraints {
    /** Мөр нэмэхийн өмнө: алдаа буцаавал бичихгүй. `rows` нь тухайн хүснэгтийн одоогийн мөрүүд. */
    insert?: (table: string, row: Row, rows: Row[]) => DbError | null;
    /** Шинэчлэхийн өмнө (`next` = шинэ утга). */
    update?: (table: string, next: Row, rows: Row[]) => DbError | null;
    /** Устгахын өмнө. */
    delete?: (table: string, row: Row) => DbError | null;
}

export interface MemoryDb {
    tables: Record<string, Row[]>;
    /** Амжилттай бичилтүүд (дарааллаар). */
    writes: { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; data: Row }[];
    /** Тухайн хүснэгтийн дараагийн уншилт/бичилтэд алдаа буцаана (нэг удаа). */
    failNext: Record<string, DbError>;
    from: (table: string) => any;
}

const valueAt = (row: Row, key: string) => key.split('.').reduce<any>((value, part) => value?.[part], row);

export function createMemoryDb(tables: Record<string, Row[]> = {}, constraints: MemoryDbConstraints = {}): MemoryDb {
    const db: MemoryDb = { tables, writes: [], failNext: {}, from: () => null };
    db.from = (table: string) => {
        const filters: Array<(row: Row) => boolean> = [];
        const orders: { key: string; ascending: boolean }[] = [];
        let mutation: 'insert' | 'update' | 'delete' | 'upsert' | null = null;
        let conflictKeys: string[] = [];
        let payload: Row | Row[] = {};
        let first = 0;
        let last = Infinity;
        let head = false;
        let selected = false;

        const run = (): { data: any; error: DbError | null; count: number | null } => {
            const forced = db.failNext[table];
            if (forced) { delete db.failNext[table]; return { data: null, error: forced, count: null }; }
            const source = (db.tables[table] ||= []);
            let data = source.filter((row) => filters.every((filter) => filter(row)));
            if (mutation === 'insert') {
                const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: crypto.randomUUID(), ...row }));
                const staged = [...source];
                for (const row of rows) {
                    const error = constraints.insert?.(table, row, staged) ?? null;
                    if (error) return { data: null, error, count: null };
                    staged.push(row);
                }
                db.tables[table] = staged;
                for (const row of rows) db.writes.push({ table, op: 'insert', data: row });
                data = rows;
            } else if (mutation === 'upsert') {
                // PostgREST merge-duplicates: давхардсан мөрийн зөвхөн илгээсэн баганыг шинэчилнэ.
                const rows = Array.isArray(payload) ? payload : [payload];
                const staged = [...source];
                const result: Row[] = [];
                for (const row of rows) {
                    const existing = staged.find((other) => conflictKeys.every((key) => other[key] === row[key]));
                    if (existing) { Object.assign(existing, row); result.push(existing); continue; }
                    const created = { id: crypto.randomUUID(), ...row };
                    const error = constraints.insert?.(table, created, staged) ?? null;
                    if (error) return { data: null, error, count: null };
                    staged.push(created);
                    result.push(created);
                }
                db.tables[table] = staged;
                for (const row of result) db.writes.push({ table, op: 'upsert', data: { ...row } });
                data = result;
            } else if (mutation === 'update') {
                for (const row of data) {
                    const error = constraints.update?.(table, { ...row, ...payload as Row }, source) ?? null;
                    if (error) return { data: null, error, count: null };
                }
                for (const row of data) { Object.assign(row, payload); db.writes.push({ table, op: 'update', data: { id: row.id, ...payload as Row } }); }
            } else if (mutation === 'delete') {
                for (const row of data) {
                    const error = constraints.delete?.(table, row) ?? null;
                    if (error) return { data: null, error, count: null };
                }
                db.tables[table] = source.filter((row) => !data.includes(row));
                for (const row of data) db.writes.push({ table, op: 'delete', data: row });
            }
            if (orders.length) {
                data = [...data].sort((a, b) => {
                    for (const { key, ascending } of orders) {
                        const x = valueAt(a, key); const y = valueAt(b, key);
                        if (x === y) continue;
                        if (x === null || x === undefined) return 1;
                        if (y === null || y === undefined) return -1;
                        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
                    }
                    return 0;
                });
            }
            const count = data.length;
            if (mutation && !selected) return { data: null, error: null, count };
            // PostgREST шиг хуулбар буцаана (дараагийн бичилт өмнө уншсан мөрийг өөрчлөхгүй).
            return { data: head ? null : data.slice(first, last + 1).map((row) => ({ ...row })), error: null, count };
        };

        const query: any = {
            select: (_columns?: string, options?: { head?: boolean; count?: string }) => { selected = true; head = !!options?.head; return query; },
            insert: (data: Row | Row[]) => { mutation = 'insert'; payload = data; return query; },
            upsert: (data: Row | Row[], options?: { onConflict?: string }) => {
                mutation = 'upsert'; payload = data;
                conflictKeys = (options?.onConflict || 'id').split(',').map((key) => key.trim());
                return query;
            },
            update: (data: Row) => { mutation = 'update'; payload = data; return query; },
            delete: () => { mutation = 'delete'; return query; },
            eq: (key: string, value: unknown) => { filters.push((row) => valueAt(row, key) === value); return query; },
            neq: (key: string, value: unknown) => { filters.push((row) => valueAt(row, key) !== value); return query; },
            is: (key: string, value: unknown) => { filters.push((row) => (valueAt(row, key) ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(valueAt(row, key))); return query; },
            gte: (key: string, value: any) => { filters.push((row) => valueAt(row, key) >= value); return query; },
            lt: (key: string, value: any) => { filters.push((row) => valueAt(row, key) < value); return query; },
            ilike: (key: string, value: string) => {
                const pattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'iu');
                filters.push((row) => pattern.test(String(valueAt(row, key) ?? '')));
                return query;
            },
            or: (value: string) => {
                const clauses = value.split(',').map((clause) => clause.match(/^([\w.]+)\.(is|eq)\.(.*)$/));
                if (clauses.some((clause) => !clause)) return query;
                filters.push((row) => clauses.some((clause) => {
                    const [, key, op, raw] = clause!;
                    return op === 'is' ? (valueAt(row, key) ?? null) === null : String(valueAt(row, key)) === raw;
                }));
                return query;
            },
            order: (key: string, options?: { ascending?: boolean }) => { orders.push({ key, ascending: options?.ascending !== false }); return query; },
            range: (from: number, to: number) => { first = from; last = to; return query; },
            limit: (limit: number) => { last = first + limit - 1; return query; },
            maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
            single: async () => {
                const result = run();
                if (result.error) return result;
                return result.data?.length ? { ...result, data: result.data[0] } : { data: null, error: { code: 'PGRST116', message: 'no rows' }, count: 0 };
            },
            then: (resolve: (value: ReturnType<typeof run>) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
        };
        return query;
    };
    return db;
}
