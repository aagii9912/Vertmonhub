'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, BadgePercent, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { unitCategoryLabel } from '@/lib/inventory/labels';
import { pricingKey } from '@/lib/sales/pricing';
import type { PricingBlock, PricingBlockKind, PricingPhase, PricingSheetVersion } from '@/lib/sales/pricing-history';
import { PRICING_VALIDITY, PricingVersionView } from './PricingVersionView';

/** «201-р блок», «Б1 блок», «Г1474 блок»: numbered blocks take the ordinal. */
export const pricingBlockLabel = (block: string) => /^\d+$/.test(block.trim()) ? `${block.trim()}-р блок` : `${block.trim()} блок`;

type KindState = { label: string; variant: 'success' | 'pending' | 'danger' | 'warning' | 'neutral' };

function kindState(kind: PricingBlockKind, draft: boolean): KindState {
    if (kind.price) return PRICING_VALIDITY[kind.price.validity];
    // Only an administrator is told about a saved draft; for everyone else the block simply has no price yet.
    if (draft && kind.category === 'residential') return { label: 'Ноорог', variant: 'warning' };
    return { label: 'Үнэ ороогүй', variant: 'neutral' };
}

const UNREGISTERED = 'Тоот бүртгэгдээгүй блок';
const LEGEND: KindState[] = [PRICING_VALIDITY.valid, PRICING_VALIDITY.upcoming, PRICING_VALIDITY.expired, { label: 'Үнэ ороогүй', variant: 'neutral' }];

/**
 * The price page by block. A project like Mandala Garden has dozens of blocks, each with apartments and often
 * parking, storage and service space, so staff find a price by phase → block → kind; which price list a block's
 * price belongs to is shown with the price, not asked first. The map of blocks comes first (what is priced, what
 * is not); a block opens on its own with the other blocks of its phase one click away.
 */
export function PricingBlocksView({ phases: registered, active, draftBlocks, several, canEdit }: {
    phases: readonly PricingPhase[];
    active: readonly PricingSheetVersion[];
    /** Blocks with a saved, not yet activated draft (`pricingKey` → the name as typed) — passed for administrators only. */
    draftBlocks?: ReadonlyMap<string, string>;
    /** The project has more than one price list: the price then names its list. */
    several: boolean;
    canEdit: boolean;
}) {
    // A drafted block that is neither in the register nor priced yet (Forest Garden 503) is still on the administrator's map.
    const phases = useMemo(() => {
        const known = new Set(registered.flatMap(phase => phase.blocks.map(block => pricingKey(block.block))));
        const drafted = [...draftBlocks ?? []].filter(([key]) => !known.has(key))
            .map(([, name]): PricingBlock => ({ block: name, kinds: [{ category: 'residential', units: 0, available: 0, price: null }] }));
        if (!drafted.length) return registered;
        const last = registered.at(-1);
        return last && last.name === null ? [...registered.slice(0, -1), { name: null, blocks: [...last.blocks, ...drafted] }] : [...registered, { name: null, blocks: drafted }];
    }, [registered, draftBlocks]);
    const [chosen, setChosen] = useState<string | null>(null);
    const [category, setCategory] = useState<string | null>(null);
    const isDraft = (item: PricingBlock) => !!draftBlocks?.has(pricingKey(item.block));
    const open = (block: string | null) => { setChosen(block); setCategory(null); };
    const phase = chosen === null ? undefined : phases.find(item => item.blocks.some(block => block.block === chosen));
    const block = phase?.blocks.find(item => item.block === chosen);

    if (!phase || !block) return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Блокоо сонгож үнийг нь харна.</p>
            <ul aria-label="Үнийн төлөвийн тайлбар" className="flex flex-wrap gap-2">
                {LEGEND.map(item => <li key={item.label}><Badge variant={item.variant}>{item.label}</Badge></li>)}
            </ul>
        </div>
        {phases.map(item => <section key={item.name ?? 'unregistered'} aria-label={item.name ?? UNREGISTERED}>
            <h2 className="flex flex-wrap items-baseline gap-2 text-sm font-semibold">
                {item.name ?? UNREGISTERED}
                <span className="text-xs font-normal text-muted-foreground">{item.blocks.length} блок{item.name === null ? ' · үнэ орсон, тоотын бүртгэлд хараахан алга' : ''}</span>
            </h2>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] items-start gap-2">
                {item.blocks.map(entry => <button key={entry.block} type="button" aria-label={pricingBlockLabel(entry.block)} onClick={() => open(entry.block)}
                    className="rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong">
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {entry.block}<ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                    </span>
                    <span className="mt-2 block space-y-1">
                        {entry.kinds.map(part => {
                            const state = kindState(part, isDraft(entry));
                            return <span key={part.category} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>{unitCategoryLabel(part.category)}{part.units > 0 && <span className="num"> · {part.units}</span>}</span>
                                <Badge variant={state.variant}>{state.label}</Badge>
                            </span>;
                        })}
                    </span>
                </button>)}
            </div>
        </section>)}
    </div>;

    const kind = block.kinds.find(item => item.category === category) ?? block.kinds[0];
    const version = kind.price ? active.find(item => item.list_key === kind.price!.list_key && item.version === kind.price!.version) : undefined;
    return <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => open(null)}><ArrowLeft />Бүх блок</Button>
            {phase.blocks.length > 1 && <div role="group" aria-label={`${phase.name ?? UNREGISTERED} — блок солих`} className="flex flex-wrap gap-1.5">
                {phase.blocks.map(item => <Button key={item.block} type="button" size="sm" variant={item === block ? 'primary' : 'ghost'}
                    aria-pressed={item === block} onClick={() => open(item.block)}>{item.block}</Button>)}
            </div>}
        </div>
        <section aria-label={`${pricingBlockLabel(block.block)}-ийн үнэ`} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{pricingBlockLabel(block.block)}
                    {phase.name && <span className="ml-2 text-sm font-normal text-muted-foreground">{phase.name}</span>}</h2>
                <p className="text-sm text-muted-foreground">
                    {kind.units > 0 ? <><span className="num">{kind.units}</span> {unitCategoryLabel(kind.category).toLowerCase()} · <span className="num">{kind.available}</span> чөлөөтэй</>
                        : 'Тоотын бүртгэлд хараахан ороогүй'}
                </p>
            </div>
            {block.kinds.length > 1 && <div role="group" aria-label="Төрөл" className="flex flex-wrap gap-2">
                {block.kinds.map(part => {
                    const state = kindState(part, isDraft(block));
                    return <Button key={part.category} type="button" size="sm" variant={part === kind ? 'primary' : 'secondary'}
                        aria-pressed={part === kind} onClick={() => setCategory(part.category)}>
                        {unitCategoryLabel(part.category)}{part.units > 0 && <span className="num"> · {part.units}</span>}
                        <Badge variant={state.variant} className="ml-1.5">{state.label}</Badge>
                    </Button>;
                })}
            </div>}
            {version ? <PricingVersionView version={version} block={block.block} showList={several} />
                : <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<BadgePercent />}
                    title={kind.category === 'residential' ? `${pricingBlockLabel(block.block)}-ийн орон сууцны баталсан үнэ алга` : `${unitCategoryLabel(kind.category)}-ын үнэ энд хараахан ороогүй`}
                    description={kind.category !== 'residential' ? 'Одоогоор энэ хуудсанд зөвхөн орон сууцны м² үнэ хадгалагдаж байна.'
                        : isDraft(block) ? 'Ноорог хадгалагдсан байна. «Засах» табаас хянаад идэвхжүүлнэ.'
                            : canEdit ? '«Засах» табаас энэ блокийн үнийг оруулж, хянаад идэвхжүүлнэ.' : 'Удирдлага үнийг баталж идэвхжүүлсний дараа энд харагдана.'} /></div>}
        </section>
    </div>;
}
