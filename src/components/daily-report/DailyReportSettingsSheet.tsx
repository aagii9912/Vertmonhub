'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import {
    CALL_CATEGORIES, CALL_CATEGORY_LABEL, DAILY_LIMITS, DailyReportConfigSchema, defaultShortName, nextConfigKey,
    type CallCategory, type DailyReportConfig, type DailyRosterEntry,
} from '@/lib/dashboard/daily-report';

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

/**
 * Төслийн «Өдрийн тайлан»-гийн загвар (Тохиргоо бичих эрх): гарчиг, утасны шугам (нийт эсвэл
 * ангиллаар), чатын суваг, менежерийн багана. Шугам/сувгийн түлхүүр тогтвортой — нэр солиход
 * хадгалсан тоо хэвээр; устгасан шугамын тоо DB-д үлдэх ч тайланд харагдахгүй.
 */
export function DailyReportSettingsSheet({ open, onOpenChange, config, roster, shopName }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: DailyReportConfig;
    roster: DailyRosterEntry[];
    shopName: string;
}) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<DailyReportConfig>(config);
    const [saving, setSaving] = useState(false);
    const active = roster.filter(entry => entry.is_active).map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'mn'));
    const custom = draft.managers !== null;
    const update = (patch: Partial<DailyReportConfig>) => setDraft(current => ({ ...current, ...patch }));

    async function save() {
        const parsed = DailyReportConfigSchema.safeParse(draft);
        if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || 'Загварыг шалгана уу'); return; }
        setSaving(true);
        try {
            await dashboardMutate('/api/dashboard/daily-report/settings', 'PUT', { config: parsed.data });
            await queryClient.invalidateQueries({ queryKey: ['daily-report'] });
            toast.success('Өдрийн тайлангийн загвар хадгалагдлаа');
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Загварыг хадгалж чадсангүй');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Өдрийн тайлангийн загвар</SheetTitle>
                    <SheetDescription>Энэ төслийн утасны шугам, чатын суваг, менежерийн багана. Уулзалт системээс автоматаар орно.</SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-7 overflow-y-auto px-6 pb-6">
                    <label className="block space-y-1.5">
                        <span className="text-sm font-medium">Гарчиг</span>
                        <Input value={draft.title ?? ''} maxLength={80} placeholder={`${shopName} баг`} onChange={event => update({ title: event.target.value })} />
                    </label>

                    <fieldset className="space-y-3">
                        <legend className="text-sm font-medium">Утасны шугам</legend>
                        <p className="text-xs leading-relaxed text-muted-foreground">Ангилал сонгоогүй бол менежер бүр нийт ирсэн дуудлагаа оруулна. Ангилал сонговол Шинэ / Захиалагч, давтан / Бусад-аар задална.</p>
                        {draft.lines.map((line, index) => (
                            <div key={line.key} className="space-y-2 rounded-xl border border-border p-3">
                                <div className="flex items-center gap-2">
                                    <Input aria-label="Шугамын дугаар" value={line.label} maxLength={40} placeholder="7575-8000"
                                        onChange={event => update({ lines: draft.lines.map(item => item.key === line.key ? { ...item, label: event.target.value } : item) })} />
                                    <Button variant="ghost" size="iconSm" aria-label="Дээш" disabled={index === 0} onClick={() => update({ lines: move(draft.lines, index, -1) })}><ArrowUp /></Button>
                                    <Button variant="ghost" size="iconSm" aria-label="Доош" disabled={index === draft.lines.length - 1} onClick={() => update({ lines: move(draft.lines, index, 1) })}><ArrowDown /></Button>
                                    <Button variant="ghost" size="iconSm" aria-label="Шугам хасах" onClick={() => update({ lines: draft.lines.filter(item => item.key !== line.key) })}><Trash2 /></Button>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                    {CALL_CATEGORIES.map(category => (
                                        <label key={category} className="flex items-center gap-2 text-[13px]">
                                            <Checkbox checked={line.categories.includes(category)} onCheckedChange={checked => update({
                                                lines: draft.lines.map(item => item.key !== line.key ? item : {
                                                    ...item,
                                                    categories: CALL_CATEGORIES.filter(value => value === category ? checked === true : item.categories.includes(value)) as CallCategory[],
                                                }),
                                            })} />
                                            {CALL_CATEGORY_LABEL[category]}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <Button variant="secondary" size="sm" disabled={draft.lines.length >= DAILY_LIMITS.lines}
                            onClick={() => update({ lines: [...draft.lines, { key: nextConfigKey(draft.lines.map(line => line.key), 'l'), label: '', categories: [] }] })}>
                            <Plus />Шугам нэмэх
                        </Button>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="text-sm font-medium">Чатын суваг</legend>
                        {draft.chats.map((chat, index) => (
                            <div key={chat.key} className="flex items-center gap-2">
                                <Input aria-label="Сувгийн нэр" value={chat.label} maxLength={40} placeholder="Хувь чат"
                                    onChange={event => update({ chats: draft.chats.map(item => item.key === chat.key ? { ...item, label: event.target.value } : item) })} />
                                <Button variant="ghost" size="iconSm" aria-label="Дээш" disabled={index === 0} onClick={() => update({ chats: move(draft.chats, index, -1) })}><ArrowUp /></Button>
                                <Button variant="ghost" size="iconSm" aria-label="Доош" disabled={index === draft.chats.length - 1} onClick={() => update({ chats: move(draft.chats, index, 1) })}><ArrowDown /></Button>
                                <Button variant="ghost" size="iconSm" aria-label="Суваг хасах" onClick={() => update({ chats: draft.chats.filter(item => item.key !== chat.key) })}><Trash2 /></Button>
                            </div>
                        ))}
                        <Button variant="secondary" size="sm" disabled={draft.chats.length >= DAILY_LIMITS.chats}
                            onClick={() => update({ chats: [...draft.chats, { key: nextConfigKey(draft.chats.map(chat => chat.key), 'c'), label: '' }] })}>
                            <Plus />Суваг нэмэх
                        </Button>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="text-sm font-medium">Менежерүүд</legend>
                        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Менежерийн багана">
                            {[{ value: false, label: 'Идэвхтэй бүх менежер' }, { value: true, label: 'Сонгосон, дараалалтай' }].map(option => (
                                <button key={String(option.value)} type="button" aria-pressed={custom === option.value}
                                    onClick={() => update({ managers: option.value ? (draft.managers ?? active.map(name => ({ name, short: defaultShortName(name) }))) : null })}
                                    className={cn('min-h-8 flex-1 rounded-md px-2.5 text-[13px]', custom === option.value ? 'bg-surface-2 font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-2')}>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {!custom ? (
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {active.length ? `Нэрийн дарааллаар: ${active.join(', ')}. Товчлол нь нэрийн эхний 3 үсэг.` : 'Идэвхтэй менежер бүртгэгдээгүй байна (Удирдлага → Төлөвлөгөө ба баг).'}
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {draft.managers!.map((manager, index) => (
                                    <li key={manager.name} className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[13px]">{manager.name}</span>
                                        <Input aria-label={`${manager.name} — товчлол`} className="w-20" value={manager.short} maxLength={6}
                                            onChange={event => update({ managers: draft.managers!.map(item => item.name === manager.name ? { ...item, short: event.target.value } : item) })} />
                                        <Button variant="ghost" size="iconSm" aria-label="Дээш" disabled={index === 0} onClick={() => update({ managers: move(draft.managers!, index, -1) })}><ArrowUp /></Button>
                                        <Button variant="ghost" size="iconSm" aria-label="Доош" disabled={index === draft.managers!.length - 1} onClick={() => update({ managers: move(draft.managers!, index, 1) })}><ArrowDown /></Button>
                                        <Button variant="ghost" size="iconSm" aria-label="Хасах" onClick={() => update({ managers: draft.managers!.filter(item => item.name !== manager.name) })}><Trash2 /></Button>
                                    </li>
                                ))}
                                {active.filter(name => !draft.managers!.some(manager => manager.name === name)).map(name => (
                                    <li key={name}>
                                        <Button variant="ghost" size="sm" onClick={() => update({ managers: [...draft.managers!, { name, short: defaultShortName(name) }] })}><Plus />{name}</Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </fieldset>
                </div>
                <SheetFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Болих</Button>
                    <Button onClick={() => void save()} disabled={saving}>{saving ? 'Хадгалж байна…' : 'Хадгалах'}</Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
