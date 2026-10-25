'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Signpost, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModuleDynamic } from '@/lib/rbac';
import {
    useAddDefaultReferralSources, useCreateReferralSource, useReferralSources, useReorderReferralSources, useUpdateReferralSource,
} from '@/hooks/useReferralSources';
import {
    DEFAULT_REFERRAL_SOURCES, REFERRAL_FIELD_LABEL, REFERRAL_SOURCE_ACTIVE_LIMIT, REFERRAL_SOURCE_NAME_MAX,
    isActiveReferral, missingDefaultReferralSources, normalizeReferralName, referralNameKey, type ReferralSource,
} from '@/lib/sales/referral-sources';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/dashboard/v2/primitives';

/**
 * Тохиргоо → «Сэжим (хаанаас ирсэн)». Төсөл (= shop) бүр өөрийн жагсаалттай; «Тохиргоо» бичих эрхтэй хэрэглэгч
 * нэмж, нэрийг нь сольж, эрэмбэлж, архивлана (ашиглагдсан сонголт түүхэнд үлдэх тул устгахгүй). Санал болгосон
 * жагсаалтаас байхгүйг нь нэг товчоор нэмнэ. Шинэ харилцагчийн уулзалтад идэвхтэй жагсаалтаас заавал сонгоно.
 */
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Хадгалж чадсангүй. Дахин оролдоно уу.');

function nameError(raw: string): string | null {
    const name = normalizeReferralName(raw);
    if (!name) return 'Нэрийг оруулна уу';
    if (name.length > REFERRAL_SOURCE_NAME_MAX) return `Нэр ${REFERRAL_SOURCE_NAME_MAX} тэмдэгтээс ихгүй байна`;
    return null;
}

export function ReferralSourcesSettings() {
    const { user } = useAuth();
    const perms = user?.permissions;
    const canEdit = !!perms && canAccessModuleDynamic(perms, 'settings') && !!perms.canWrite;

    // Алдааг доорх Alert харуулна — давхар toast гаргахгүй.
    const { data, isLoading, isError, refetch, isFetching } = useReferralSources({ inlineError: true });
    const sources = data?.sources ?? [];
    const create = useCreateReferralSource();
    const preset = useAddDefaultReferralSources();
    const update = useUpdateReferralSource();
    const reorder = useReorderReferralSources();

    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

    const missingDefaults = missingDefaultReferralSources(sources);
    const atLimit = sources.filter(isActiveReferral).length >= REFERRAL_SOURCE_ACTIVE_LIMIT;

    const addDefaults = async () => {
        try {
            const result = await preset.mutateAsync();
            toast.success(result.created.length ? `${result.created.length} сонголт нэмэгдлээ` : 'Санал болгосон сонголтууд аль хэдийн байна');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const submitNew = async (event: React.FormEvent) => {
        event.preventDefault();
        if (create.isPending) return; // Давхар Enter/товшилт: амжилтын дараа 409 гаргахгүй.
        const invalid = nameError(draft);
        if (invalid) { toast.error(invalid); return; }
        if (sources.some((source) => isActiveReferral(source) && referralNameKey(source.name) === referralNameKey(draft))) {
            toast.error(`«${normalizeReferralName(draft)}» нэртэй сонголт байна`); return;
        }
        try {
            await create.mutateAsync(normalizeReferralName(draft)!);
            setDraft('');
            toast.success('Сонголт нэмэгдлээ');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const saveEdit = async () => {
        if (!editing) return;
        const invalid = nameError(editing.name);
        if (invalid) { toast.error(invalid); return; }
        try {
            await update.mutateAsync({ id: editing.id, patch: { name: normalizeReferralName(editing.name)! } });
            setEditing(null);
            toast.success('Нэр шинэчлэгдлээ');
        } catch (error) { toast.error(errorMessage(error)); }
    };

    const setArchived = (source: ReferralSource, archived: boolean) => update.mutate(
        { id: source.id, patch: { archived } },
        {
            onSuccess: () => toast.success(archived ? `«${source.name}» архивлагдлаа. Өмнө сонгосон уулзалт, гэрээнд хэвээр харагдана.` : `«${source.name}» сэргээгдлээ`),
            onError: (error) => toast.error(errorMessage(error)),
        },
    );

    /** Дээш/доош: бүх сонголтын шинэ дарааллыг нэг хүсэлтээр (сервер 10, 20, … эрэмбэ онооно). */
    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= sources.length) return;
        const order = sources.map((source) => source.id);
        [order[index], order[target]] = [order[target], order[index]];
        reorder.mutate(order, { onError: (error) => toast.error(errorMessage(error)) });
    };

    return (
        <section id="referral-sources" className="scroll-mt-24">
            <SectionCard
                title={REFERRAL_FIELD_LABEL}
                icon={Signpost}
                description="Харилцагч хаанаас, хэний санаачилгаар ирснийг уулзалт ба гэрээнд энэ жагсаалтаас сонгоно (ж: Facebook, Ойрхон амьдардаг, Мандала Гарден ОС). Шинэ харилцагчийн уулзалтад заавал. Жагсаалт зөвхөн энэ төсөлд хамаарна; чөлөөт тайлбарыг «Тэмдэглэл»-д бичнэ."
            >
                {isLoading ? (
                    <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                ) : isError ? (
                    <Alert variant="danger">
                        Жагсаалтыг уншиж чадсангүй.
                        <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                    </Alert>
                ) : data?.available === false ? (
                    <Alert variant="warning">«{REFERRAL_FIELD_LABEL}»-ийн жагсаалт хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг (migration) суулгана уу.</Alert>
                ) : (
                    <div className="flex flex-col gap-4">
                        {sources.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-4 text-[13px]">
                                <p className="font-medium text-foreground">Энэ төсөлд сонголт алга</p>
                                <p className="mt-1 text-muted-foreground">Санал болгосон жагсаалт: {DEFAULT_REFERRAL_SOURCES.join(', ')}.</p>
                                {canEdit && <Button className="mt-3" size="sm" isLoading={preset.isPending} onClick={() => void addDefaults()}><Sparkles />Санал болгосон жагсаалт нэмэх</Button>}
                            </div>
                        ) : (
                            <ul className="divide-y divide-border rounded-xl border border-border" aria-label={`${REFERRAL_FIELD_LABEL}-ийн сонголтууд`}>
                                {sources.map((source, index) => {
                                    const active = isActiveReferral(source);
                                    const isEditing = editing?.id === source.id;
                                    return (
                                        <li key={source.id} className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', !active && 'bg-surface-2/40')}>
                                            {isEditing && editing ? (
                                                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground" htmlFor={`referral-edit-${source.id}`}>
                                                    Нэр
                                                    <Input id={`referral-edit-${source.id}`} value={editing.name} maxLength={REFERRAL_SOURCE_NAME_MAX}
                                                        onChange={(event) => setEditing({ id: source.id, name: event.target.value })}
                                                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveEdit(); } }} />
                                                </label>
                                            ) : (
                                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                                    <span className={cn('text-[13px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>{source.name}</span>
                                                    {!active && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">Архив</span>}
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
                                                            <Button size="iconSm" variant="ghost" aria-label={`${source.name} дээш`} disabled={reorder.isPending || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                                                            <Button size="iconSm" variant="ghost" aria-label={`${source.name} доош`} disabled={reorder.isPending || index === sources.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                                                            <Button size="iconSm" variant="ghost" aria-label={`${source.name} нэр солих`} onClick={() => setEditing({ id: source.id, name: source.name })}><Pencil /></Button>
                                                            <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Switch checked={active} aria-label={`${source.name} идэвхтэй`} onCheckedChange={(checked) => setArchived(source, !checked)} />
                                                                {active ? 'Идэвхтэй' : 'Архив'}
                                                            </label>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {canEdit && sources.length > 0 && missingDefaults.length > 0 && !atLimit && (
                            <div>
                                <Button size="sm" variant="secondary" isLoading={preset.isPending} onClick={() => void addDefaults()}>
                                    <Sparkles />Санал болгосон жагсаалт нэмэх ({missingDefaults.length})
                                </Button>
                            </div>
                        )}

                        {canEdit && (atLimit ? (
                            <p className="text-xs text-muted-foreground">Төсөлд {REFERRAL_SOURCE_ACTIVE_LIMIT} хүртэл идэвхтэй сонголт байна. Шинээр нэмэхийн тулд хэрэглэхгүйг нь архивлана уу.</p>
                        ) : (
                            <form onSubmit={(event) => void submitNew(event)} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-end" aria-label="Шинэ сонголт нэмэх">
                                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground" htmlFor="new-referral-source">
                                    Шинэ сонголт
                                    <Input id="new-referral-source" value={draft} maxLength={REFERRAL_SOURCE_NAME_MAX} placeholder="Ж: Билбоард" onChange={(event) => setDraft(event.target.value)} />
                                </label>
                                <div>
                                    <Button type="submit" size="sm" isLoading={create.isPending} disabled={create.isPending || !draft.trim()}><Plus />Нэмэх</Button>
                                </div>
                            </form>
                        ))}
                        {!canEdit && <p className="text-xs text-muted-foreground">Жагсаалтыг «Тохиргоо» засах эрхтэй хэрэглэгч өөрчилнө.</p>}
                    </div>
                )}
            </SectionCard>
        </section>
    );
}
