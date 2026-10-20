import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import {
    buildDailyReport, buildDailyReportChanges, dailyNoteText, flattenDailyNotes, readDailyReportConfig,
    type BuildDailyReportInput, type DailyCountRow, type DailyMeetingRow, type DailyReportChangeRow, type DailyReportConflict,
    type DailyReportNotes, type SaveDailyReportInput,
} from '../src/lib/dashboard/daily-report';
import type { DailyMeetingRequestBody } from '../src/lib/dashboard/daily-report-meetings';
import { shiftDate } from '../src/lib/sales/activity';
import { formatTime, ubDateStr } from '../src/lib/utils/date';

// «Өдрийн тайлан»: багийн харагдац (Elysium-ийн загвар) — тоо оруулж хадгалах, загвар засах, админ
// уулзалтын менежер солих; ээлжийн менежер хамт олныхоо тоог оруулж (expected, 409), түүхээс сэргээж,
// хамт олныхоо уулзалтыг бүртгэнэ. API-г бодит builder-ээр (buildDailyReport, buildDailyReportChanges) mock хийнэ.
const shopId = '00000000-0000-4000-8000-000000000002';
const ARI = 'Ариунбилэг.Нямхүү';
const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const config = {
    ...readDailyReportConfig(null, 'Elysium Residence').config,
    title: '"Элизиум Ресиденс" баг',
    managers: [{ name: ARI, short: 'Ари' }, { name: CHAN, short: 'Чан' }, { name: KHON, short: 'Хон' }],
};
// Холбосон акаунт зөвхөн mock серверт (`authors.other`); тайлангийн JSON-д гарахгүй.
const accounts = [
    { name: ARI, is_active: true, phone: null, user_id: 'ari-account' },
    { name: CHAN, is_active: true, phone: '88881234', user_id: 'chan-account' },
    { name: KHON, is_active: true, phone: '90085678', user_id: 'khon-account' },
];
const roster = accounts.map(({ name, is_active, phone }) => ({ name, is_active, phone }));
const changeRowBase = { manager_name: null, metric: null, note_key: null, old_value: null, new_value: null, old_text: null, new_text: null, restored_from: null, meta: {} };
// Ээлжийн менежерт ч, багийн харагдацад ч төслийн бүх идэвхтэй менежерийн тоо засагдана.
const editable = [ARI, CHAN, KHON];

async function setup(page: Page, mode: 'team' | 'personal') {
    const today = ubDateStr();
    const actor = mode === 'team' ? { id: 'admin-account', name: 'Захирал' } : { id: 'khon-account', name: 'М. Хонгорзул' };
    const enteredAt = `${today}T02:15:00.000Z`;
    const count = (manager: string, metric: string, value: number, by = accounts.find(entry => entry.name === manager)!) =>
        ({ manager_name: manager, metric, value, updated_by: by.user_id, updated_by_name: by.name === KHON ? 'М. Хонгорзул' : by.name, updated_at: enteredAt });
    const state = {
        puts: [] as SaveDailyReportInput[], settings: [] as unknown[], meetingPosts: [] as DailyMeetingRequestBody[], restores: [] as unknown[], errors: [] as string[],
        counts: [
            // Чанцалдуламын төслийн утсыг Хонгорзул оруулсан (өөр хүн).
            count(ARI, 'call.l1.total', 1), count(CHAN, 'call.l1.total', 2, accounts[2]),
            count(KHON, 'call.l1.total', 1), count(ARI, 'call.personal.total', 2),
            count(CHAN, 'call.personal.total', 4), count(KHON, 'call.personal.total', 5),
            count(CHAN, 'chat.personal', 2), count(KHON, 'chat.personal', 2),
        ].filter(row => mode === 'team' || row.manager_name !== KHON) as DailyCountRow[],
        notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан' } } as DailyReportNotes,
        completed: null as BuildDailyReportInput['completed'],
        meetings: [
            { id: 'm1', manager: CHAN, type: 'new_customer', customer: 'Бат', property: null, notes: 'Б2-58м2 10-30%', feedback: 'үлдэгдэл банк', scheduled_at: `${today}T02:00:00Z` },
            { id: 'm2', manager: KHON, type: 'new_customer', customer: 'Сараа', property: null, notes: 'Б1-89м2 бартер эсвэл УХН', feedback: null, scheduled_at: `${today}T03:00:00Z` },
            { id: 'm3', manager: KHON, type: 'new_customer', customer: 'Дорж', property: null, notes: 'Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв', feedback: null, scheduled_at: `${today}T04:00:00Z` },
        ] as DailyMeetingRow[],
        // Цаг нь өнгөрсөн товлосон уулзалт («Болсон» товч идэвхтэй).
        pending: [{ id: 'p1', manager: KHON, type: 'new_customer', customer: 'Болд', scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString() }],
        changes: [] as DailyReportChangeRow[],
    };
    let nextChange = 1;
    const logChange = (row: Partial<DailyReportChangeRow> & Pick<DailyReportChangeRow, 'kind'>) =>
        state.changes.push({ ...changeRowBase, changed_by_name: actor.name, ...row, id: nextChange++, changed_at: new Date(Date.now() + nextChange).toISOString() });
    const currentCount = (manager: string, metric: string) => state.counts.find(row => row.manager_name === manager && row.metric === metric)?.value ?? null;
    const setCount = (manager: string, metric: string, value: number | null, restoredFrom: number | null = null) => {
        const old = currentCount(manager, metric);
        if (old === value) return;
        state.counts = state.counts.filter(row => row.manager_name !== manager || row.metric !== metric);
        if (value !== null) state.counts.push({ manager_name: manager, metric, value, updated_by: actor.id, updated_by_name: actor.name, updated_at: new Date().toISOString() });
        logChange({ kind: 'count', manager_name: manager, metric, old_value: old, new_value: value, restored_from: restoredFrom });
    };
    const input = (date: string): BuildDailyReportInput => ({
        date, title: config.title!, config, roster: accounts,
        counts: state.counts,
        meetings: state.meetings,
        pendingMeetings: state.pending,
        notes: state.notes,
        completed: state.completed,
        only: null,
    });
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        const role = mode === 'team' ? 'admin' : 'sales_manager';
        if (path === '/api/me') return reply({ user: { fullName: mode === 'team' ? 'Захирал' : 'Хонгорзул' }, role,
            permissions: { ...ROLE_PERMISSIONS[role], canWrite: true, modules: mode === 'team' ? [...ROLE_PERMISSIONS.admin.modules, 'settings'] : ['dashboard', 'leads', 'viewings'] },
            shops: [{ id: shopId, name: 'Elysium Residence', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: mode === 'team' ? 'org' : 'personal', managerName: mode === 'team' ? null : KHON, isManager: mode === 'personal', canViewTeam: mode === 'team' });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 0, inbox: 0, meetings: 0 });
        if (path === '/api/dashboard/daily-report' && request.method() === 'GET') {
            const date = url.searchParams.get('date') ?? today;
            return reply({
                date, today, report: buildDailyReport(input(date)), config, configSaved: true, configInvalid: false,
                roster: mode === 'team' ? roster : [],
                viewer: mode === 'team'
                    ? { personal: false, onboarding: false, canEditTeam: true, editable, own: null, canReassign: true }
                    : { personal: true, onboarding: false, canEditTeam: true, editable, own: KHON, canReassign: false },
            });
        }
        if (path === '/api/dashboard/daily-report' && request.method() === 'PUT') {
            // save_daily_report-ийн дүрэм: `expected` зөрвөл юу ч бичихгүй 409; зөвхөн өөрчлөгдсөн нүд түүхэнд.
            const data = request.postDataJSON() as SaveDailyReportInput;
            state.puts.push(data);
            const notes = data.notes ? flattenDailyNotes(data.notes, data.notesExpected) : [];
            const conflicts: DailyReportConflict[] = [
                ...data.cells.filter(cell => cell.expected !== undefined && currentCount(cell.manager, cell.metric) !== cell.expected)
                    .map(cell => ({ kind: 'count' as const, manager: cell.manager, metric: cell.metric, current: currentCount(cell.manager, cell.metric) })),
                ...notes.filter(note => note.expected !== undefined && dailyNoteText(state.notes, note.key) !== note.expected)
                    .map(note => ({ kind: 'note' as const, key: note.key, current: dailyNoteText(state.notes, note.key) })),
            ];
            if (conflicts.length) return reply({ error: 'Энэ хооронд өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.', conflicts }, 409);
            for (const cell of data.cells) setCount(cell.manager, cell.metric, cell.value);
            for (const note of notes) {
                const old = dailyNoteText(state.notes, note.key);
                if (old === note.value) continue;
                if (note.key === 'chats') state.notes = { ...state.notes, chats: note.value };
                else if (note.key === 'general') state.notes = { ...state.notes, general: note.value };
                else state.notes = { ...state.notes, lines: { ...state.notes.lines, [note.key.slice(5)]: note.value } };
                logChange({ kind: 'note', note_key: note.key, old_text: old || null, new_text: note.value || null });
            }
            if (data.complete !== undefined) state.completed = data.complete ? { by: actor.name, at: new Date().toISOString() } : null;
            return reply({ ok: true });
        }
        if (path === '/api/dashboard/daily-report/history' && request.method() === 'GET') {
            const changes = buildDailyReportChanges(state.changes, { config, counts: state.counts, notes: state.notes, editable: new Set(editable), canEditNotes: true });
            return reply({ date: url.searchParams.get('date') ?? today, changes });
        }
        if (path === '/api/dashboard/daily-report/history' && request.method() === 'POST') {
            const { changeId } = request.postDataJSON() as { changeId: number };
            state.restores.push(changeId);
            const change = state.changes.find(row => row.id === changeId);
            if (!change || change.kind !== 'count') return reply({ error: 'Өөрчлөлт олдсонгүй' }, 404);
            if (currentCount(change.manager_name!, change.metric!) !== change.new_value) {
                return reply({ error: 'Энэ нүд дараа нь дахин өөрчлөгдсөн байна. Түүхийг шинэчлээд дахин оролдоно уу.' }, 409);
            }
            setCount(change.manager_name!, change.metric!, change.old_value, change.id);
            return reply({ ok: true });
        }
        if (path === '/api/dashboard/daily-report/meetings') {
            const body = request.postDataJSON() as DailyMeetingRequestBody;
            state.meetingPosts.push(body);
            if (body.action === 'record') {
                const id = `r${state.meetings.length + 1}`;
                state.meetings.push({ id, manager: body.manager, type: body.meeting_type ?? 'new_customer', customer: body.customer_name || 'Нэргүй харилцагч',
                    property: null, notes: body.notes ?? null, feedback: body.feedback ?? null, scheduled_at: new Date().toISOString() });
                logChange({ kind: 'meeting', manager_name: body.manager, new_text: body.customer_name ?? null, meta: { action: 'record' } });
                return reply({ ok: true, viewing_id: id, lead_id: 'lead-new', lead_created: true }, 201);
            }
            if (body.action === 'complete') {
                const meeting = state.pending.find(row => row.id === body.viewing_id)!;
                state.pending = state.pending.filter(row => row.id !== body.viewing_id);
                if (body.status === 'completed') state.meetings.push({ ...meeting, property: null, notes: null, feedback: null });
                logChange({ kind: 'meeting', manager_name: meeting.manager, old_text: 'Товлосон', new_text: body.status === 'completed' ? 'Болсон' : 'Ирээгүй', meta: { action: body.status === 'completed' ? 'complete' : 'no_show' } });
                return reply({ ok: true, viewing_id: body.viewing_id, status: body.status });
            }
            const meeting = state.meetings.find(row => row.id === body.viewing_id)!;
            logChange({ kind: 'meeting', manager_name: body.manager, old_text: meeting.manager, new_text: body.manager, meta: { action: 'reassign' } });
            meeting.manager = body.manager;
            return reply({ ok: true, viewing_id: body.viewing_id, changed: true });
        }
        if (path === '/api/dashboard/daily-report/settings') { state.settings.push(request.postDataJSON()); return reply({ config }); }
        return reply({ error: `Missing fixture: ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return { state, today };
}

test('багийн өдрийн тайлан: хүснэгт, хэн оруулсан, уулзалтын жагсаалт, тоо засаж хадгалах, менежер солих, загвар', async ({ page }) => {
    const { state, today } = await setup(page, 'team');
    await page.goto('/dashboard/daily-report');
    const report = page.locator('article.daily-report');
    await expect(report.getByText('"Элизиум Ресиденс" баг', { exact: true })).toBeVisible();
    await expect(report.getByText('Менежер — Р. Чанцалдулам')).toBeVisible();
    await expect(report.getByText('Нийт 11 дуудлага ирсэн.', { exact: true })).toBeVisible();
    await expect(report.getByText('Бат — Б2-58м2 10-30%; үлдэгдэл банк')).toBeVisible();
    await expect(page.getByText(/товлосон 1 уулзалтын үр дүн бүртгэгдээгүй/)).toBeVisible();
    // Чанцалдуламын төслийн утсыг Хонгорзул оруулсан — зөвхөн дэлгэцийн тэмдэг, тайлбартай.
    const projectLine = report.getByRole('region', { name: 'Төслийн утас · 77862222', exact: true });
    await expect(projectLine.locator('td[data-author="other"]')).toHaveCount(1);
    await expect(projectLine.locator('td[data-author="other"]')).toHaveAttribute('title', `Оруулсан: М. Хонгорзул · ${formatTime(`${today}T02:15:00.000Z`)}`);
    await expect(report.getByText('— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)')).toBeVisible();
    await page.screenshot({ path: 'test-results/e2e/daily-report-team.png', fullPage: true });

    // Зураг (PNG/JPEG): мессенжерт илгээх цагаан тайлан, 2x нягтрал, нэг баганатай (760px → 1520px).
    for (const [item, extension, signature] of [['PNG татах', 'png', '89504e47'], ['JPEG татах', 'jpg', 'ffd8ff']] as const) {
        await page.getByRole('button', { name: 'Зураг', exact: true }).click();
        const download = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: item }).click();
        const file = await download;
        expect(file.suggestedFilename()).toBe(`өдрийн_тайлан_${today}.${extension}`);
        const path = `test-results/e2e/daily-report-image.${extension}`;
        await file.saveAs(path);
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, signature.length / 2).toString('hex')).toBe(signature);
        if (extension === 'png') expect(bytes.readUInt32BE(16)).toBe(1520);
        await expect(page.getByRole('button', { name: 'Зураг', exact: true })).toBeEnabled();
    }
    await expect(page.locator('.paper-theme')).toHaveCount(0);

    await page.getByRole('button', { name: 'Засах', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Төслийн утас · 77862222 · Нийт · Р. Чанцалдулам' }).fill('3');
    await page.getByRole('spinbutton', { name: 'Менежерийн дуудлага · Нийт · М. Хонгорзул' }).fill('');
    await page.getByRole('textbox', { name: 'Менежерийн чат — тайлбар' }).fill('Ихэнх нь үнийн мэдээлэл асуусан');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(page.getByText('Хадгалагдлаа', { exact: true })).toBeVisible();
    // Зөвхөн өөрчилсөн нүд, тэмдэглэл + клиентийн харсан хадгалсан утга.
    expect(state.puts).toEqual([{
        date: today,
        cells: [{ manager: CHAN, metric: 'call.l1.total', value: 3, expected: 2 }, { manager: KHON, metric: 'call.personal.total', value: null, expected: 5 }],
        notes: { chats: 'Ихэнх нь үнийн мэдээлэл асуусан' },
        notesExpected: { chats: '' },
    }]);
    // Одоо Захирал өөрөө оруулсан тул Чанцалдуламын нүд «өөр хүн» хэвээр.
    await expect(projectLine.locator('td[data-author="other"]')).toHaveAttribute('title', /^Оруулсан: Захирал · /);

    await page.getByRole('button', { name: 'Баталгаажуулах', exact: true }).click();
    await expect.poll(() => state.puts.at(-1)).toEqual({ date: today, cells: [], complete: true });

    // Админ: болсон уулзалтыг өөр менежерт тооцох.
    await report.getByRole('combobox', { name: /^Менежер солих — Бат/ }).click();
    await page.getByRole('option', { name: 'М. Хонгорзул' }).click();
    await expect.poll(() => state.meetingPosts.at(-1)).toEqual({ action: 'reassign', date: today, viewing_id: 'm1', manager: KHON });
    await expect(page.getByText('Уулзалтыг М. Хонгорзул-д шилжүүллээ')).toBeVisible();

    await page.getByRole('button', { name: 'Загвар', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Өдрийн тайлангийн загвар' })).toBeVisible();
    await page.getByRole('button', { name: 'Шугам нэмэх', exact: true }).click();
    await page.getByRole('textbox', { name: 'Шугамын дугаар' }).last().fill('7575-8000');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.settings.length).toBe(1);
    expect((state.settings[0] as { config: { lines: Array<{ key: string; label: string }> } }).config.lines.at(-1)).toEqual({ key: 'l2', label: '7575-8000', categories: [] });

    // Админы түүхийн холбоос (`?date=`) тухайн өдрийг нээнэ.
    const yesterday = shiftDate(today, -1);
    await page.goto(`/dashboard/daily-report?date=${yesterday}`);
    await expect(page.getByLabel('Тайлангийн өдөр')).toHaveValue(yesterday);
    await expect(report.getByText('"Элизиум Ресиденс" баг', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
});

test('ээлжийн менежер хамт олныхоо тоог оруулж, түүхээс сэргээж, уулзалтыг нь бүртгээд тайланг баталгаажуулна', async ({ page }) => {
    const { state, today } = await setup(page, 'personal');
    await page.goto('/dashboard/daily-report');
    const report = page.locator('article.daily-report');
    await expect(report.getByRole('columnheader', { name: 'Хон' }).first()).toBeVisible();
    await expect(report.getByRole('columnheader', { name: 'Чан' }).first()).toBeVisible();
    const personalCalls = report.getByRole('region', { name: 'Менежерийн дуудлага', exact: true });
    await expect(personalCalls.getByRole('columnheader', { name: 'Чан 8888 1234' })).toBeVisible();
    await expect(personalCalls.getByRole('columnheader', { name: 'Хон 9008 5678' })).toBeVisible();
    await expect(report.getByText('Бат — Б2-58м2 10-30%; үлдэгдэл банк')).toBeVisible();
    await expect(page.getByText('Ээлжийн менежер бүх менежерийн дуудлага, чатын тоог оруулж болно', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Загвар', exact: true })).toHaveCount(0);
    // Өөрийн багана хоосон тул шууд оруулах горим; өөрийн багана тодорсон, хамт олных засагдана.
    await expect(personalCalls.getByRole('columnheader', { name: 'Хон 9008 5678' })).toHaveAttribute('title', 'М. Хонгорзул — таны багана');
    const chanLine = page.getByRole('spinbutton', { name: 'Төслийн утас · 77862222 · Нийт · Р. Чанцалдулам' });
    await expect(chanLine).toHaveValue('2');
    await page.getByRole('spinbutton', { name: 'Төслийн утас · 77862222 · Нийт · М. Хонгорзул' }).fill('2');
    await page.getByRole('spinbutton', { name: 'Менежерийн дуудлага · Нийт · М. Хонгорзул' }).fill('3');
    await page.getByRole('spinbutton', { name: 'Чат · Хувь чат · М. Хонгорзул' }).fill('4');
    await chanLine.fill('5');
    await page.getByRole('textbox', { name: 'Нэмэлт тэмдэглэл', exact: true }).fill('Багийн өдрийн нэгтгэл');
    await page.screenshot({ path: 'test-results/e2e/daily-report-personal.png', fullPage: true });

    // Энэ хооронд Ариунбилэг Чанцалдуламын тоог 3 болгосон → 409, ноорог хэвээр.
    const chanIndex = state.counts.findIndex(row => row.manager_name === CHAN && row.metric === 'call.l1.total');
    state.counts[chanIndex] = { ...state.counts[chanIndex], value: 3, updated_by: 'ari-account', updated_by_name: 'Н. Ариунбилэг' };
    state.changes.push({ ...changeRowBase, id: 900, kind: 'count', manager_name: CHAN, metric: 'call.l1.total', old_value: 2, new_value: 3, changed_by_name: 'Н. Ариунбилэг', changed_at: new Date(Date.now() - 1000).toISOString() });
    // Мөн чатын тайлбар бичсэн — засаагүй тэмдэглэлийг дахин хадгалахад дарахгүй.
    state.notes = { ...state.notes, chats: 'Ариунбилэгийн тайлбар' };
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(page.getByText('Энэ хооронд өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.')).toBeVisible();
    await expect(page.getByText(/Энэ хооронд өөр хүн өөрчилсөн: Төслийн утас · 77862222 · Р\. Чанцалдулам: одоо 3/)).toBeVisible();
    await expect(chanLine).toHaveValue('5');
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0]).toEqual({ date: today, cells: [
        { manager: KHON, metric: 'call.l1.total', value: 2, expected: null }, { manager: KHON, metric: 'call.personal.total', value: 3, expected: null },
        { manager: KHON, metric: 'chat.personal', value: 4, expected: null }, { manager: CHAN, metric: 'call.l1.total', value: 5, expected: 2 },
    ], notes: { general: 'Багийн өдрийн нэгтгэл' }, notesExpected: { general: '' } });
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.puts.length).toBe(2);
    expect(state.puts[1].cells).toContainEqual({ manager: CHAN, metric: 'call.l1.total', value: 5, expected: 3 });
    expect(state.puts[1]).toMatchObject({ notes: { general: 'Багийн өдрийн нэгтгэл' }, notesExpected: { general: '' } });
    expect(state.notes.chats).toBe('Ариунбилэгийн тайлбар');
    await expect(page.getByText('Хадгалагдлаа', { exact: true })).toBeVisible();
    await expect(report.getByText('Нийт 9 дуудлага ирсэн.', { exact: true })).toBeVisible();

    // Түүх: хэн, хэзээ, хуучин → шинэ; Чанцалдуламын тоог өмнөх утга руу сэргээнэ.
    await page.getByRole('button', { name: 'Түүх', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'Өөрчлөлтийн түүх' });
    const changes = history.getByRole('list', { name: 'Өөрчлөлтүүд' }).getByRole('listitem');
    const chanChange = changes.filter({ hasText: 'Төслийн утас · 77862222 · Р. Чанцалдулам' }).filter({ hasText: 'М. Хонгорзул' });
    await expect(chanChange).toHaveCount(1);
    await expect(chanChange).toContainText('3→5');
    await expect(changes.filter({ hasText: 'Н. Ариунбилэг' })).toContainText('2→3');
    await expect(changes.filter({ hasText: 'Тэмдэглэл · Ерөнхий' })).toContainText('Багийн өдрийн нэгтгэл');
    await chanChange.getByRole('button', { name: /^Сэргээх/ }).click();
    await expect.poll(() => state.restores).toEqual([expect.any(Number)]);
    await expect(page.getByText('Өмнөх утгыг сэргээлээ')).toBeVisible();
    await expect(changes.filter({ hasText: 'Сэргээсэн' })).toContainText('5→3');
    await page.keyboard.press('Escape');
    await expect(history).toHaveCount(0);
    // Нүдэнд тоо + дэлгэц уншигчид «Оруулсан: …» (нуугдмал текст).
    await expect(report.getByRole('region', { name: 'Төслийн утас · 77862222', exact: true }).getByRole('cell').nth(1)).toHaveText(/^3(Оруулсан: .+)?$/);

    // Хамт олныхоо (Чанцалдулам) болсон уулзалтыг түүний нэр дээр бүртгэнэ.
    await report.getByRole('button', { name: 'Уулзалт нэмэх', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Уулзалт нэмэх' });
    await expect(dialog.getByRole('combobox', { name: 'Менежер' })).toHaveText(/М\. Хонгорзул/);
    await dialog.getByRole('combobox', { name: 'Менежер' }).click();
    await page.getByRole('option', { name: 'Р. Чанцалдулам' }).click();
    await dialog.getByRole('button', { name: 'Давтан', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Утас', exact: true }).fill('9911 2233');
    await dialog.getByRole('textbox', { name: 'Нэр', exact: true }).fill('Тулга');
    await dialog.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
    await expect.poll(() => state.meetingPosts.length).toBe(1);
    expect(state.meetingPosts[0]).toEqual({
        action: 'record', date: today, manager: CHAN, meeting_type: 'repeat_customer', time: expect.stringMatching(/^\d{2}:\d{2}$/),
        customer_phone: '9911 2233', customer_name: 'Тулга', anonymous: false, notes: null, feedback: null, interest_level: null,
    });
    await expect(page.getByText('Уулзалт Р. Чанцалдулам-ийн нэр дээр бүртгэгдлээ · шинэ лид үүсгэв')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(report.getByText('Тулга')).toBeVisible();

    // Хонгорзулын товлосон уулзалт «Болсон».
    const pending = report.getByRole('group', { name: 'Товлосон, үр дүн бүртгээгүй' });
    await pending.getByRole('button', { name: /^Болсон: Болд/ }).click();
    await expect.poll(() => state.meetingPosts.at(-1)).toEqual({ action: 'complete', date: today, viewing_id: 'p1', status: 'completed' });
    await expect(pending).toHaveCount(0);
    await expect(report.getByText('Болд')).toBeVisible();

    await page.getByRole('button', { name: 'Баталгаажуулах', exact: true }).click();
    await expect.poll(() => state.puts.at(-1)).toEqual({ date: today, cells: [], complete: true });
    await expect(report.locator('footer')).toContainText('Тайлан хийж гүйцэтгэсэн: М. Хонгорзул');
    await page.reload();
    await expect(report.locator('footer')).toContainText('М. Хонгорзул');
    await expect(report.getByText('Багийн өдрийн нэгтгэл', { exact: true })).toBeVisible();
    // Хэн оруулсны тэмдэг зөвхөн дэлгэцэд: хуулсан текст, хэвлэхэд орохгүй.
    await expect(report.getByText('— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)')).toBeVisible();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Хуулах', exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Төслийн утас · 77862222: Нийт 6 дуудлага ирсэн');
    expect(copied).toContain('Менежерийн дуудлага: Нийт 9 дуудлага ирсэн');
    expect(copied).toContain('Бат — Б2-58м2 10-30%; үлдэгдэл банк');
    expect(copied).toContain('Тулга');
    expect(copied).toContain('Тайлан хийж гүйцэтгэсэн: М. Хонгорзул');
    expect(copied).toContain('Р. Чанцалдулам (8888 1234)');
    expect(copied).toContain('М. Хонгорзул (9008 5678)');
    expect(copied).not.toContain('Оруулсан');
    await page.emulateMedia({ media: 'print' });
    await expect(report.getByRole('region', { name: 'Менежерийн дуудлага', exact: true })).toBeVisible();
    await expect(personalCalls.getByText('9008 5678', { exact: true })).toBeVisible();
    await expect(report.getByText('— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)')).toBeHidden();
    await expect(report.getByRole('button', { name: 'Уулзалт нэмэх', exact: true })).toBeHidden();
    await page.screenshot({ path: 'test-results/e2e/daily-report-print.png', fullPage: true });
    expect(state.errors).toEqual([]);
});
