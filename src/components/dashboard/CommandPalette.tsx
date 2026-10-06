'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, FileText, ListPlus, Loader2, UserPlus, Users } from 'lucide-react';

import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
} from '@/components/ui/Command';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { leadDisplayName } from '@/lib/leads/labels';
import { NAV_SECTIONS, BOTTOM_NAV, SECONDARY_ROUTES, type NavItem } from '@/lib/navigation/nav';
import { onCommandPaletteOpen, openQuickCreate, type QuickCreateKind } from '@/lib/navigation/commandPalette';

/** Бичлэг хайхад хамгийн багадаа ийм тэмдэгт. */
const MIN_QUERY = 2;
const RESULT_LIMIT = 5;

interface LeadHit { id: string; customer_name: string | null; customer_phone: string | null }
interface ContractHit { id: string; contract_number: string | null; customer_name: string | null; unit_label: string | null }

function useDebounced(value: string, ms: number): string {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), ms);
        return () => window.clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

/**
 * ⌘K — хуудас, үйлдэл, бичлэг (лид, гэрээ) хайх нэг газар.
 *
 * Хуудсууд навигацийн бүртгэлээс (эрхгүй нь харагдахгүй), бичлэгүүд одоо байгаа
 * жагсаалтын API-аас (эрх, төслийн хүрээг сервер шалгана) — шинэ endpoint үүсгэхгүй.
 */
export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const router = useRouter();
    const { shop } = useAuth();
    const { can, canWrite, isSuperAdmin } = useModuleAccess();
    const term = useDebounced(query.trim(), 250);
    const searching = open && term.length >= MIN_QUERY;

    // ⌘K / Ctrl+K, болон бусад газраас ирэх нээх дохио.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        const off = onCommandPaletteOpen(() => setOpen(true));
        return () => {
            window.removeEventListener('keydown', onKey);
            off();
        };
    }, []);

    const onOpenChange = React.useCallback((next: boolean) => {
        setOpen(next);
        if (!next) setQuery('');
    }, []);

    const leads = useQuery({
        queryKey: ['palette', 'leads', shop?.id, term],
        queryFn: () => dashboardJson<{ leads: LeadHit[] }>(`/api/dashboard/leads?q=${encodeURIComponent(term)}&page=1&pageSize=${RESULT_LIMIT}`),
        enabled: searching && !!shop?.id && can('leads'),
        staleTime: 30_000,
        meta: { inlineError: true },
    });
    const contracts = useQuery({
        queryKey: ['palette', 'contracts', shop?.id, term],
        queryFn: () => dashboardJson<{ contracts: ContractHit[] }>(`/api/dashboard/contracts?search=${encodeURIComponent(term)}&page=1&pageSize=${RESULT_LIMIT}`),
        enabled: searching && !!shop?.id && can('contracts'),
        staleTime: 30_000,
        meta: { inlineError: true },
    });

    const go = React.useCallback((href: string) => {
        onOpenChange(false);
        router.push(href);
    }, [onOpenChange, router]);

    const create = React.useCallback((kind: QuickCreateKind) => {
        onOpenChange(false);
        openQuickCreate(kind);
    }, [onOpenChange]);

    const sections = NAV_SECTIONS
        .filter((section) => !section.superAdmin || isSuperAdmin)
        .map((section) => ({ ...section, items: section.items.filter((item) => item.superAdmin ? isSuperAdmin : can(item.module)) }))
        .filter((section) => section.items.length > 0);
    const bottom = BOTTOM_NAV.filter((item) => can(item.module));

    const secondary = React.useMemo(() => {
        const map = new Map<string, typeof SECONDARY_ROUTES>();
        for (const r of SECONDARY_ROUTES) {
            if (!can(r.module)) continue;
            const list = map.get(r.group) ?? [];
            list.push(r);
            map.set(r.group, list);
        }
        return [...map.entries()];
    }, [can]);

    const leadHits = searching ? leads.data?.leads ?? [] : [];
    const contractHits = searching ? contracts.data?.contracts ?? [] : [];
    const loading = searching && (leads.isFetching || contracts.isFetching);
    const failed = searching && (leads.isError || contracts.isError);

    const pageItem = (item: NavItem) => {
        const Icon = item.icon;
        return (
            <CommandItem key={item.href} value={`${item.name} ${item.href} ${(item.keywords ?? []).join(' ')}`} onSelect={() => go(item.href)}>
                <Icon className="mr-2 h-4 w-4" />
                {item.name}
            </CommandItem>
        );
    };

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Хуудас, лид, гэрээ хайх…" value={query} onValueChange={setQuery} />
            <CommandList>
                <CommandEmpty>{loading ? 'Хайж байна…' : 'Илэрц олдсонгүй.'}</CommandEmpty>

                {(leadHits.length > 0 || contractHits.length > 0 || loading || failed) && (
                    <CommandGroup heading="Бичлэг">
                        {leadHits.map((lead) => (
                            <CommandItem key={`lead-${lead.id}`} value={`lead ${lead.id} ${leadDisplayName(lead)} ${lead.customer_phone ?? ''} ${term}`} onSelect={() => go(`/dashboard/leads?lead=${encodeURIComponent(lead.id)}`)}>
                                <Users className="mr-2 h-4 w-4" />
                                <span className="truncate">{leadDisplayName(lead)}</span>
                                <span className="ml-2 truncate text-xs text-muted-foreground">Лид{lead.customer_phone ? ` · ${lead.customer_phone}` : ''}</span>
                            </CommandItem>
                        ))}
                        {contractHits.map((contract) => (
                            <CommandItem key={`contract-${contract.id}`} value={`contract ${contract.id} ${contract.contract_number ?? ''} ${contract.customer_name ?? ''} ${contract.unit_label ?? ''} ${term}`} onSelect={() => go(`/dashboard/contracts/${encodeURIComponent(contract.id)}`)}>
                                <FileText className="mr-2 h-4 w-4" />
                                <span className="truncate">{contract.contract_number || contract.unit_label || 'Гэрээ'}</span>
                                <span className="ml-2 truncate text-xs text-muted-foreground">Гэрээ{contract.customer_name ? ` · ${contract.customer_name}` : ''}</span>
                            </CommandItem>
                        ))}
                        {loading && (
                            <CommandItem disabled value={`loading ${term}`}>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Хайж байна…
                            </CommandItem>
                        )}
                        {failed && !loading && (
                            <CommandItem disabled value={`failed ${term}`}>
                                Бичлэг хайж чадсангүй. Дахин оролдоно уу.
                            </CommandItem>
                        )}
                    </CommandGroup>
                )}

                <CommandGroup heading="Шинээр бүртгэх">
                    {canWrite('leads') && (
                        <CommandItem value="шинэ лид бүртгэх new lead" onSelect={() => create('lead')}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Шинэ лид
                            <CommandShortcut>N</CommandShortcut>
                        </CommandItem>
                    )}
                    {canWrite('viewings') && (
                        <CommandItem value="уулзалт товлох meeting" onSelect={() => create('meeting')}>
                            <CalendarPlus className="mr-2 h-4 w-4" />
                            Уулзалт товлох
                        </CommandItem>
                    )}
                    {can('dashboard') && (
                        <CommandItem value="ажил нэмэх task сануулга" onSelect={() => create('task')}>
                            <ListPlus className="mr-2 h-4 w-4" />
                            Ажил нэмэх
                        </CommandItem>
                    )}
                </CommandGroup>

                {sections.map((section) => (
                    <CommandGroup key={section.id} heading={section.label ?? 'Цэс'}>
                        {section.items.map(pageItem)}
                    </CommandGroup>
                ))}
                {secondary.map(([group, routes]) => (
                    <CommandGroup key={group} heading={group}>
                        {group === 'Систем' && bottom.map(pageItem)}
                        {routes.map((r) => {
                            const Icon = r.icon;
                            return (
                                <CommandItem
                                    key={r.href + r.name}
                                    value={`${r.name} ${r.href} ${(r.keywords ?? []).join(' ')}`}
                                    onSelect={() => go(r.href)}
                                >
                                    <Icon className="mr-2 h-4 w-4" />
                                    {r.name}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
