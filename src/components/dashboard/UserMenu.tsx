'use client';

import Link from 'next/link';
import { HelpCircle, Keyboard, LogOut, Moon, Sun, UserCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getRoleDisplayName } from '@/lib/rbac';
import { useTheme } from '@/hooks/useTheme';
import { openShortcuts } from '@/lib/navigation/shortcuts';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/Dropdown';

/** Хүний нэрнээс 2 үсэгтэй товчлол: «Д. Номин» → «ДН». */
export function initialsOf(name?: string | null): string {
    if (!name) return '—';
    const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Дээд мөрийн профайл цэс: нэр, дүр, тохиргоо, тема, товчлол, тусламж, гарах. */
export function UserMenu() {
    const { user, signOut } = useAuth();
    const { theme, toggle } = useTheme();
    const displayName = user?.fullName || user?.email?.split('@')[0] || 'Хэрэглэгч';
    const role = user?.role || 'viewer';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Профайл: ${displayName}`}
                    className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
                >
                    <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-foreground ring-1 ring-border">
                        {initialsOf(displayName)}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                    <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
                    {user?.email && <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
                    <span className="truncate text-xs font-normal text-muted-foreground">{getRoleDisplayName(role)}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings" className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" /> Профайл ба тохиргоо
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggle} className="flex items-center gap-2">
                    {theme === 'dark'
                        ? (<><Sun className="h-4 w-4" /> Цайвар тема</>)
                        : (<><Moon className="h-4 w-4" /> Бараан тема</>)}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openShortcuts()} className="flex items-center gap-2">
                    <Keyboard className="h-4 w-4" /> Гарын товчлол
                    <kbd className="mono-label ml-auto rounded border border-border px-1.5 text-xs leading-5 text-muted-foreground">?</kbd>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/help" className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" /> Тусламж
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="flex items-center gap-2 text-status-danger">
                    <LogOut className="h-4 w-4" /> Гарах
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
