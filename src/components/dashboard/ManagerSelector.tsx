'use client';

import { useQuery } from '@tanstack/react-query';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/Sheet';
import { ManagerDashboard } from '@/components/dashboard/my/ManagerDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { UserRound } from 'lucide-react';

interface ManagerOption {
    name: string;
    user_id: string | null;
    is_active: boolean;
    hasAccount: boolean;
}

interface ManagerSelectorProps {
    selected: string | null;
    onSelect: (name: string | null) => void;
}

/**
 * «Менежер сонгогч» — админ аль ч менежерийн хувийн самбарыг нээж үзнэ.
 * Select нь /api/dashboard/managers (бүртгэл ∪ гэрээ ∪ лидийн нэрс)-ээс,
 * сонгоход баруун талын Sheet дотор ManagerDashboard drill-in нээгдэнэ.
 */
export function ManagerSelector({ selected, onSelect }: ManagerSelectorProps) {
    const { shop } = useAuth();
    const shopId = shop?.id;

    const { data } = useQuery<ManagerOption[]>({
        queryKey: ['managers', shopId],
        queryFn: async () => {
            if (!shopId) return [];
            const res = await fetch('/api/dashboard/managers', {
                headers: { 'x-shop-id': shopId },
            });
            if (!res.ok) return [];
            const json = await res.json();
            return json.managers || [];
        },
        enabled: !!shopId,
        staleTime: 60000,
    });

    const managers = data || [];

    return (
        <>
            {managers.length > 0 && (
                <Select value={selected || ''} onValueChange={(v) => onSelect(v || null)}>
                    <SelectTrigger className="h-8 w-44" aria-label="Менежер сонгох">
                        <span className="flex items-center gap-2">
                            <UserRound className="size-4 text-muted-foreground/70" />
                            <SelectValue placeholder="Менежер сонгох" />
                        </span>
                    </SelectTrigger>
                    <SelectContent>
                        {managers.map((m) => (
                            <SelectItem key={m.name} value={m.name}>
                                {m.name}
                                {!m.is_active ? ' · идэвхгүй' : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            <Sheet open={!!selected} onOpenChange={(open) => !open && onSelect(null)}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-md bg-brand-soft flex items-center justify-center flex-shrink-0">
                                <UserRound className="w-4 h-4 text-brand-strong" />
                            </span>
                            {selected}
                        </SheetTitle>
                        <SheetDescription>Менежерийн хувийн самбар</SheetDescription>
                    </SheetHeader>
                    <div className="px-4 pb-8 pt-2 md:px-6">
                        {selected && <ManagerDashboard managerName={selected} embedded />}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
