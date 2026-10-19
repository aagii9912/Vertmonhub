/**
 * `save_daily_report` RPC-ийн санах ойн дуураймал (route тестэд; migration 20261019120000-ийн дүрэм):
 * • Хэлбэр буруу → 22023. `expected`-тэй нүд/тэмдэглэлийн одоогийн утга зөрвөл юу ч бичихгүй
 *   `{ ok: false, conflicts }` (тэмдэглэл байхгүй бол '').
 * • Өөрчлөгдсөн нүд: null → мөр устгана, эс бөгөөс upsert (updated_by, updated_by_name, updated_at);
 *   өөрчлөгдөөгүй нүдэнд бичилт ч, түүх ч үгүй. Тэмдэглэл түлхүүрээр нийлнэ ('' = түлхүүрийг хасна).
 * • Баталгаажуулалт: true үргэлж бичнэ; false зөвхөн баталгаажсан бол цуцална.
 * • Өөрчлөлт бүр `daily_report_changes`-д (id нь өсөх тоо) — `{ ok: true, changes }`.
 * Хэрэглээ: `db.rpcs.save_daily_report = saveDailyReportRpc`.
 */
import type { MemoryDb } from './memory-db';

type Row = Record<string, any>;
const METRIC = /^(call\.[a-z0-9]{1,16}\.(total|new|repeat|other)|chat\.[a-z0-9]{1,16})$/;
const NOTE_KEY = /^(line\.[a-z0-9]{1,16}|chats|general)$/;

const invalid = () => Object.assign(new Error('Тайлангийн мэдээлэл буруу байна'), { code: '22023' });
const isObject = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown) => value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000);
const onlyKeys = (value: Row, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));

function validate(args: Row) {
    const { p_shop_id: shopId, p_date: date, p_cells: cells, p_notes: notes, p_user_name: userName } = args;
    if (!shopId || !date) throw invalid();
    if (!Array.isArray(cells) || cells.length > 600) throw invalid();
    const keys = new Set<string>();
    for (const cell of cells) {
        if (!isObject(cell) || !onlyKeys(cell, ['manager', 'metric', 'value', 'expected']) || !('value' in cell)) throw invalid();
        if (typeof cell.manager !== 'string' || cell.manager.trim() !== cell.manager || cell.manager.length < 1 || cell.manager.length > 120) throw invalid();
        if (typeof cell.metric !== 'string' || !METRIC.test(cell.metric)) throw invalid();
        if (!isCount(cell.value) || ('expected' in cell && !isCount(cell.expected))) throw invalid();
        const key = `${cell.manager}\u0000${cell.metric}`;
        if (keys.has(key)) throw invalid();
        keys.add(key);
    }
    if (notes !== null && notes !== undefined) {
        if (!Array.isArray(notes) || notes.length > 20) throw invalid();
        for (const note of notes) {
            if (!isObject(note) || !onlyKeys(note, ['key', 'value', 'expected'])) throw invalid();
            if (typeof note.key !== 'string' || !NOTE_KEY.test(note.key)) throw invalid();
            if (typeof note.value !== 'string' || note.value.length > 2000) throw invalid();
            if ('expected' in note && note.expected !== null && typeof note.expected !== 'string') throw invalid();
        }
    }
    if (userName !== null && userName !== undefined && (typeof userName !== 'string' || userName.length > 120)) throw invalid();
}

const noteText = (notes: Row, key: string): string => {
    if (key === 'chats') return notes.chats ?? '';
    if (key === 'general') return notes.general ?? '';
    return notes.lines?.[key.slice(5)] ?? '';
};

export function saveDailyReportRpc(args: Row, db: MemoryDb) {
    validate(args);
    const { p_shop_id: shopId, p_date: date, p_user_id: userId = null, p_user_name: userName = null, p_complete: complete = null } = args;
    const cells: Row[] = args.p_cells;
    const notes: Row[] = args.p_notes ?? [];
    const restoredFrom = args.p_restored_from ?? null;

    const counts = (db.tables.daily_report_counts ||= []);
    const reports = (db.tables.daily_reports ||= []);
    const history = (db.tables.daily_report_changes ||= []);
    const cellRow = (cell: Row) => counts.find(row => row.shop_id === shopId && row.report_date === date && row.manager_name === cell.manager && row.metric === cell.metric);
    const report = reports.find(row => row.shop_id === shopId && row.report_date === date);
    const currentNotes: Row = report?.notes ?? {};

    const conflicts: Row[] = [];
    for (const cell of cells) {
        const current = cellRow(cell)?.value ?? null;
        if ('expected' in cell && current !== cell.expected) conflicts.push({ kind: 'count', manager: cell.manager, metric: cell.metric, current });
    }
    for (const note of notes) {
        const current = noteText(currentNotes, note.key);
        if ('expected' in note && current !== (note.expected ?? '')) conflicts.push({ kind: 'note', key: note.key, current });
    }
    if (conflicts.length) return { ok: false, conflicts };

    const now = new Date().toISOString();
    let nextId = history.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    let changes = 0;
    const record = (row: Row) => {
        history.push({
            id: nextId++, shop_id: shopId, report_date: date, kind: null, manager_name: null, metric: null, note_key: null,
            old_value: null, new_value: null, old_text: null, new_text: null, viewing_id: null, restored_from: null, meta: {},
            changed_by: userId, changed_by_name: userName, changed_at: now, ...row,
        });
        changes += 1;
    };

    for (const cell of cells) {
        const row = cellRow(cell);
        const current = row?.value ?? null;
        if (current === cell.value) continue;
        if (cell.value === null) counts.splice(counts.indexOf(row!), 1);
        else if (row) Object.assign(row, { value: cell.value, updated_by: userId, updated_by_name: userName, updated_at: now });
        else counts.push({ shop_id: shopId, report_date: date, manager_name: cell.manager, metric: cell.metric, value: cell.value, updated_by: userId, updated_by_name: userName, updated_at: now });
        record({ kind: 'count', manager_name: cell.manager, metric: cell.metric, old_value: current, new_value: cell.value, restored_from: restoredFrom });
    }

    const nextNotes: Row = JSON.parse(JSON.stringify(currentNotes));
    let reportChanged = false;
    for (const note of notes) {
        const value = String(note.value).trim();
        const current = noteText(nextNotes, note.key);
        if (value === current) continue;
        if (note.key === 'chats' || note.key === 'general') {
            if (value) nextNotes[note.key] = value; else delete nextNotes[note.key];
        } else {
            const line = note.key.slice(5);
            nextNotes.lines = { ...(nextNotes.lines ?? {}) };
            if (value) nextNotes.lines[line] = value; else delete nextNotes.lines[line];
            if (!Object.keys(nextNotes.lines).length) delete nextNotes.lines;
        }
        record({ kind: 'note', note_key: note.key, old_text: current || null, new_text: value || null, restored_from: restoredFrom });
        reportChanged = true;
    }

    const completion: Row = {};
    if (complete === true) {
        record({ kind: 'complete', old_text: report?.completed_by_name ?? null, new_text: userName });
        Object.assign(completion, { completed_by: userId, completed_by_name: userName, completed_at: now });
        reportChanged = true;
    } else if (complete === false && report?.completed_at) {
        record({ kind: 'complete', old_text: report.completed_by_name ?? null, new_text: null });
        Object.assign(completion, { completed_by: null, completed_by_name: null, completed_at: null });
        reportChanged = true;
    }

    if (reportChanged) {
        const fields = { notes: nextNotes, updated_by: userId, updated_at: now, ...completion };
        if (report) Object.assign(report, fields);
        else reports.push({ shop_id: shopId, report_date: date, completed_by: null, completed_by_name: null, completed_at: null, ...fields });
    }
    return { ok: true, changes };
}
