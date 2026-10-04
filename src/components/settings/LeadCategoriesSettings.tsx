'use client';

import React, { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Sparkles, Tags, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModuleDynamic } from '@/lib/rbac';
import { useLeadCategories, type LeadCategoryRow } from '@/hooks/useLeads';
import {
    useAddDefaultLeadCategories, useCreateLeadCategory, useDeleteLeadCategory, useLeadCategoryCounts, useReorderLeadCategories, useUpdateLeadCategory,
} from '@/hooks/useLeadCategorySettings';
import {
    DEFAULT_LEAD_CATEGORIES, LEAD_CATEGORY_DESCRIPTION_MAX, LEAD_CATEGORY_LIMIT, LEAD_CATEGORY_NAME_MAX, LEAD_CATEGORY_TONES,
    UNCATEGORIZED_LABEL, categoryNameKey, isUncategorizedInput, type LeadCategoryTone,
} from '@/lib/leads/labels';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { confirmToast } from '@/components/ui/Toast';
import { CategoryBadge } from '@/components/leads/pickers';
import { Skeleton } from '@/components/dashboard/v2/primitives';

/**
 * Тохиргоо → «Лидийн ангилал». Төсөл (= shop) бүр өөрийн жагсаалттай; «Тохиргоо» бичих эрхтэй
 * хэрэглэгч нэмж, засаж, эрэмбэлж, архивлана. Ашиглагдаагүй ангиллыг л устгана (устгах эрх).
 * Санал болгох ангиллыг нэг товчоор нэмнэ (байгаа нэрийг алгасна).
 */
const DraftSchema = z.object({
    name: z.string().trim().min(1, 'Ангиллын нэрийг оруулна уу').max(LEAD_CATEGORY_NAME_MAX, `Нэр ${LEAD_CATEGORY_NAME_MAX} тэмдэгтээс ихгүй байна`)
        .refine((name) => !isUncategorizedInput(name), `«${UNCATEGORIZED_LABEL}» нэрийг ангилалд ашиглахгүй`),
    description: z.string().trim().max(LEAD_CATEGORY_DESCRIPTION_MAX, `Тайлбар ${LEAD_CATEGORY_DESCRIPTION_MAX} тэмдэгтээс ихгүй байна`),
    tone: z.enum(['neutral', 'info', 'success', 'pending']),
});
type Draft = z.infer<typeof DraftSchema>;
const EMPTY_DRAFT: Draft = { name: '', description: '', tone: 'neutral' };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Хадгалж чадсангүй. Дахин оролдоно уу.');

export function LeadCategoriesSettings() {
    const { user } = useAuth();
    const perms = user?.permissions;
    const hasSettings = !!perms && canAccessModuleDynamic(perms, 'settings');
    const canEdit = hasSettings && !!perms?.canWrite;
    const canDelete = hasSettings && !!perms?.canDelete;

    // Алдааг доорх Alert харуулна — давхар toast гаргахгүй.
    const { data: categories = [], isLoading, isError, refetch, isFetching } = useLeadCategories({ inlineError: true });
    const { data: counts } = useLeadCategoryCounts(hasSettings);
    const create = useCreateLeadCategory();
    const preset = useAddDefaultLeadCategories();
    const update = useUpdateLeadCategory();
    const remove = useDeleteLeadCategory();
    const reorder = useReorderLeadCategories();

    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);

    const existingKeys = new Set(categories.map((c) => categoryNameKey(c.name)));
    const missingDefaults = DEFAULT_LEAD_CATEGORIES.filter((p) => !existingKeys.has(categoryNameKey(p.name)));
    const atLimit = categories.length >= LEAD_CATEGORY_LIMIT;

    const addDefaults = async () => {
        try {
            const result = await preset.mutateAsync();
            toast.success(result.created.length ? `${result.created.length} ангилал нэмэгдлээ` : 'Санал болгох ангиллууд аль хэдийн байна');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const submitNew = async (event: React.FormEvent) => {
        event.preventDefault();
        const parsed = DraftSchema.safeParse(draft);
        if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Мэдээлэл буруу байна'); return; }
        try {
            await create.mutateAsync({ name: parsed.data.name, description: parsed.data.description || null, tone: parsed.data.tone });
            setDraft(EMPTY_DRAFT);
            toast.success('Ангилал нэмэгдлээ');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const saveEdit = async () => {
        if (!editing) return;
        const parsed = DraftSchema.safeParse(editing.draft);
        if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Мэдээлэл буруу байна'); return; }
        try {
            await update.mutateAsync({ id: editing.id, patch: { name: parsed.data.name, description: parsed.data.description || null, tone: parsed.data.tone } });
            setEditing(null);
            toast.success('Ангилал шинэчлэгдлээ');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const setActive = (category: LeadCategoryRow, isActive: boolean) => update.mutate(
        { id: category.id, patch: { is_active: isActive } },
        {
            onSuccess: () => toast.success(isActive ? `«${category.name}» сэргээгдлээ` : `«${category.name}» архивлагдлаа. Өмнө оноосон лидэд хэвээр харагдана.`),
            onError: (error) => toast.error(errorMessage(error)),
        },
    );

    const deleteCategory = async (category: LeadCategoryRow) => {
        const ok = await confirmToast({
            title: `«${category.name}» ангиллыг устгах уу?`,
            description: 'Лидэд ашиглагдаагүй ангилал л устгагдана. Ашиглагдсан бол архивлана уу.',
            confirmLabel: 'Устгах', cancelLabel: 'Болих', destructive: true,
        });
        if (!ok) return;
        remove.mutate(category.id, {
            onSuccess: () => toast.success('Ангилал устгагдлаа'),
            onError: (error) => toast.error(errorMessage(error)),
        });
    };

    /** Дээш/доош: бүх ангиллын шинэ дарааллыг нэг хүсэлтээр (сервер 10, 20, … эрэмбэ онооно). */
    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= categories.length) return;
        const order = categories.map((category) => category.id);
        [order[index], order[target]] = [order[target], order[index]];
        reorder.mutate(order, { onError: (error) => toast.error(errorMessage(error)) });
    };

    return (
        <section id="lead-categories" className="scroll-mt-24">
            <SectionCard
                title="Лидийн ангилал"
                icon={Tags}
                description="Харилцагчийн төрөл, зорилгоор лидийг ангилна (ж: хөрөнгө оруулагч, дилер). Байрны төрөл «Сонирхол»-д, суваг «Эх үүсвэр»-т тусдаа бүртгэгдэнэ. Ангилал зөвхөн энэ төсөлд хамаарна; лид бүр нэг ангилалтай эсвэл ангилалгүй байна."
            >
                {isLoading ? (
                    <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                ) : isError ? (
                    <Alert variant="danger">
                        Ангиллыг уншиж чадсангүй.
                        <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                    </Alert>
                ) : (
                    <div className="flex flex-col gap-4">
                        {categories.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-4 text-[13px]">
                                <p className="font-medium text-foreground">Энэ төсөлд лидийн ангилал алга</p>
                                <p className="mt-1 text-muted-foreground">Санал болгох жагсаалт: {DEFAULT_LEAD_CATEGORIES.map((p) => p.name).join(', ')}.</p>
                                {canEdit && <Button className="mt-3" size="sm" isLoading={preset.isPending} onClick={() => void addDefaults()}><Sparkles />Санал болгох ангиллууд нэмэх</Button>}
                            </div>
                        ) : (
                            <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Лидийн ангиллууд">
                                {categories.map((category, index) => {
                                    const count = counts?.byCategory[category.id];
                                    // Устгасан лидэд ч холбогдсон бол устгах боломжгүй (FK) — архивлана.
                                    const inUse = !!count || !!counts?.referenced?.includes(category.id);
                                    const isEditing = editing?.id === category.id;
                                    return (
                                        <li key={category.id} className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', !category.is_active && 'bg-surface-2/40')}>
                                            {isEditing && editing ? (
                                                <DraftFields draft={editing.draft} onChange={(next) => setEditing({ id: category.id, draft: next })} idPrefix={`edit-${category.id}`} />
                                            ) : (
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <CategoryBadge category={category} />
                                                        {typeof count === 'number' && <span className="num text-xs text-muted-foreground">{count} лид</span>}
                                                    </div>
                                                    {category.description && <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>}
                                                </div>
                                            )}
                                            {canEdit && (
                                                <div className="flex shrink-0 items-center gap-1">
                                                    {isEditing ? (
                                                        <>
                                                            <Button size="iconSm" variant="ghost" aria-label="Хадгалах" isLoading={update.isPending} onClick={() => void saveEdit()}><Check /></Button>
                                                            <Button size="iconSm" variant="ghost" aria-label="Болих" onClick={() => setEditing(null)}><X /></Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button size="iconSm" variant="ghost" aria-label={`${category.name} дээш`} disabled={reorder.isPending || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                                                            <Button size="iconSm" variant="ghost" aria-label={`${category.name} доош`} disabled={reorder.isPending || index === categories.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                                                            <Button size="iconSm" variant="ghost" aria-label={`${category.name} засах`}
                                                                onClick={() => setEditing({ id: category.id, draft: { name: category.name, description: category.description ?? '', tone: (category.tone as LeadCategoryTone) || 'neutral' } })}><Pencil /></Button>
                                                            <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Switch checked={category.is_active} aria-label={`${category.name} идэвхтэй`} onCheckedChange={(checked) => setActive(category, checked)} />
                                                                {category.is_active ? 'Идэвхтэй' : 'Архив'}
                                                            </label>
                                                            {canDelete && (
                                                                <Button size="iconSm" variant="ghost" aria-label={`${category.name} устгах`} disabled={inUse}
                                                                    title={count ? 'Лидэд ашиглагдсан тул архивлана уу' : inUse ? 'Устгасан лидэд ашиглагдсан — архивлана уу' : 'Устгах'}
                                                                    onClick={() => void deleteCategory(category)}><Trash2 /></Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {counts && categories.length > 0 && <p className="text-xs text-muted-foreground">{UNCATEGORIZED_LABEL}: <span className="num">{counts.uncategorized}</span> лид</p>}

                        {canEdit && categories.length > 0 && missingDefaults.length > 0 && !atLimit && (
                            <div>
                                <Button size="sm" variant="secondary" isLoading={preset.isPending} onClick={() => void addDefaults()}>
                                    <Sparkles />Санал болгох ангиллууд нэмэх ({missingDefaults.length})
                                </Button>
                            </div>
                        )}

                        {canEdit && (atLimit ? (
                            <p className="text-xs text-muted-foreground">Төсөлд {LEAD_CATEGORY_LIMIT} хүртэл ангилал байна. Шинээр нэмэхийн тулд ашиглаагүй ангиллыг устгана уу.</p>
                        ) : (
                            <form onSubmit={(event) => void submitNew(event)} className="flex flex-col gap-3 rounded-xl border border-border p-3" aria-label="Шинэ ангилал нэмэх">
                                <DraftFields draft={draft} onChange={setDraft} idPrefix="new-category" />
                                <div>
                                    <Button type="submit" size="sm" isLoading={create.isPending} disabled={!draft.name.trim()}><Plus />Ангилал нэмэх</Button>
                                </div>
                            </form>
                        ))}
                        {!canEdit && <p className="text-xs text-muted-foreground">Ангиллыг «Тохиргоо» засах эрхтэй хэрэглэгч өөрчилнө.</p>}
                    </div>
                )}
            </SectionCard>
        </section>
    );
}

function DraftFields({ draft, onChange, idPrefix }: { draft: Draft; onChange: (draft: Draft) => void; idPrefix: string }) {
    return (
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${idPrefix}-name`}>
                Нэр
                <Input id={`${idPrefix}-name`} value={draft.name} maxLength={LEAD_CATEGORY_NAME_MAX} placeholder="Ж: Хөрөнгө оруулагч"
                    onChange={(event) => onChange({ ...draft, name: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${idPrefix}-description`}>
                Тайлбар (заавал биш)
                <Input id={`${idPrefix}-description`} value={draft.description} maxLength={LEAD_CATEGORY_DESCRIPTION_MAX} placeholder="Хэнийг энэ ангилалд оруулах вэ"
                    onChange={(event) => onChange({ ...draft, description: event.target.value })} />
            </label>
            <fieldset className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                <legend className="sr-only">Өнгө</legend>
                <span className="mr-1 text-xs text-muted-foreground">Өнгө:</span>
                {LEAD_CATEGORY_TONES.map((tone) => (
                    <button key={tone.key} type="button" aria-pressed={draft.tone === tone.key} onClick={() => onChange({ ...draft, tone: tone.key })}
                        className={cn('rounded-full focus-ring', draft.tone === tone.key && 'ring-2 ring-brand/40')}>
                        <CategoryBadge category={{ name: tone.label, tone: tone.key, is_active: true }} />
                    </button>
                ))}
            </fieldset>
        </div>
    );
}
