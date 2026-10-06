'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarPlus, ChevronDown, ListPlus, MessageSquare, Plus, Search, Sparkles, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBreadcrumb, getDocumentTitle, getNavTitle } from '@/lib/navigation/nav';
import { canQuickCreate, openCommandPalette, openQuickCreate, type QuickCreateKind } from '@/lib/navigation/commandPalette';
import { isTypingTarget } from '@/lib/navigation/shortcuts';
import { onPageTitle } from '@/lib/navigation/pageTitle';
import { openAiPanel } from '@/lib/ai/context';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { ProjectSwitcher } from '@/components/dashboard/ProjectSwitcher';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useNavCounts } from '@/hooks/useNavCounts';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/Dropdown';

/**
 * Дээд мөр (56px, --header-h) — v3.
 *
 * Зүүн: төсөл / хэсэг / хуудас (замын мөр). Баруун: хайлт ⌘K, «+ Шинэ» (лид, уулзалт,
 * ажил), мессеж, AI ⌘J, тусламж, профайл. Хуудасны гарчиг браузерын табд мөн бичигдэнэ.
 */
export function Header() {
    const pathname = usePathname() || '';
    const { data: dashboardMode } = useDashboardMode();
    const [override, setOverride] = useState<string | null>(null);
    useEffect(() => onPageTitle(setOverride), []);
    useEffect(() => setOverride(null), [pathname]);

    const crumbs = getBreadcrumb(pathname);
    const navTitle = pathname === '/dashboard' ? (dashboardMode?.mode === 'personal' ? 'Өнөөдөр' : 'Самбар') : getNavTitle(pathname);
    const title = override ?? navTitle;
    // Бичлэгийн нэр (жишээ: гэрээний дугаар) ирвэл замын мөрийн сүүлийн хэсгийг солино.
    // Танигдаагүй замд (404 г.м.) хуудас өөрөө гарчиг өгөөгүй бол зөвхөн төсөл харагдана.
    const trail = crumbs.length > 1
        ? crumbs.map((c, i) => (i === crumbs.length - 1 ? { ...c, name: title } : c))
        : crumbs.length === 1 || override ? [{ name: title }] : [];

    useEffect(() => {
        document.title = getDocumentTitle(title);
    }, [title]);

    // N товчлуур — түргэн бүртгэл (физик товчоор: кирилл байрлалд ч). Оролтод бичиж байхад ажиллахгүй.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code !== 'KeyN' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(document.activeElement) || document.querySelector('[role="dialog"]')) return;
            e.preventDefault();
            openQuickCreate('lead');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <header
            className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-background/85 px-6 backdrop-blur-md"
            style={{ height: 'var(--header-h)' }}
        >
            <nav aria-label="Замын мөр" className="flex min-w-0 items-center gap-1">
                <ProjectSwitcher />
                {trail.map((c, i) => {
                    const last = i === trail.length - 1;
                    return (
                        <React.Fragment key={`${c.name}-${i}`}>
                            <span aria-hidden="true" className="px-0.5 text-sm text-border-strong">/</span>
                            {last ? (
                                <span aria-current="page" className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                            ) : 'href' in c && c.href ? (
                                <Link href={c.href} className="truncate rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                                    {c.name}
                                </Link>
                            ) : (
                                <span className="truncate px-1 text-sm text-muted-foreground">{c.name}</span>
                            )}
                        </React.Fragment>
                    );
                })}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                    type="button"
                    onClick={openCommandPalette}
                    aria-label="Хайх"
                    className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground xl:w-60"
                >
                    <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className="hidden xl:inline">Хайх…</span>
                    <kbd className="mono-label ml-auto rounded border border-border px-1.5 text-xs leading-5">⌘K</kbd>
                </button>
                <NewMenu />
                <MessagesLink />
                <AiButton />
                <FeedbackWidget />
                <UserMenu />
            </div>
        </header>
    );
}

const NEW_ITEMS: { kind: QuickCreateKind; label: string; icon: typeof UserPlus; hint?: string }[] = [
    { kind: 'lead', label: 'Лид', icon: UserPlus, hint: 'N' },
    { kind: 'meeting', label: 'Уулзалт', icon: CalendarPlus },
    { kind: 'task', label: 'Ажил', icon: ListPlus },
];

/** «+ Шинэ» — эрхтэй зүйлсээ л санал болгоно (сервер дахин шалгана). */
function NewMenu() {
    const access = useModuleAccess();
    const items = NEW_ITEMS.filter((item) => canQuickCreate(item.kind, access));
    if (!items.length) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'flex h-9 items-center gap-1.5 rounded-lg bg-brand pl-2.5 pr-2 text-sm font-medium text-brand-fg',
                        'shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-brand-hover',
                    )}
                >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Шинэ
                    <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                {items.map(({ kind, label, icon: Icon, hint }) => (
                    <DropdownMenuItem key={kind} onSelect={() => openQuickCreate(kind)} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" /> {label}
                        {hint && <kbd className="mono-label ml-auto rounded border border-border px-1.5 text-xs leading-5 text-muted-foreground">{hint}</kbd>}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function MessagesLink() {
    const { can } = useModuleAccess();
    const { inbox = 0 } = useNavCounts();
    if (!can('inbox')) return null;

    return (
        <Link
            href="/dashboard/inbox"
            className="relative flex size-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label={inbox > 0 ? `Мессежүүд: ${inbox} яриа хариу хүлээж байна` : 'Мессежүүд'}
            title="Мессеж"
        >
            <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
            {inbox > 0 && (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-background" />
            )}
        </Link>
    );
}

function AiButton() {
    const { can } = useModuleAccess();
    if (!can('ai-assistant')) return null;

    return (
        <button
            type="button"
            onClick={() => openAiPanel()}
            aria-label="AI туслах (⌘J)"
            title="AI туслах (⌘J)"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground"
        >
            <Sparkles className="h-4 w-4 text-brand-strong" strokeWidth={1.75} />
            <span className="hidden xl:inline">AI</span>
            <kbd className="mono-label hidden rounded border border-border px-1.5 text-xs leading-5 text-muted-foreground xl:inline">⌘J</kbd>
        </button>
    );
}
