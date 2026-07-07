'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/Sheet';
import {
    MANAGER_WIDGETS,
    moveWidget,
    toggleWidget,
    type WidgetPref,
} from '@/lib/dashboard/widget-prefs';
import { Settings2, ChevronUp, ChevronDown } from 'lucide-react';

const LABELS = new Map(MANAGER_WIDGETS.map((w) => [w.id, w.label]));

/**
 * «Самбар тохируулах» — виджет нуух/эрэмбэлэх Sheet.
 * Өөрчлөлт бүр onChange-ээр шууд хадгалагдана (optimistic).
 */
export function WidgetCustomizer({
    prefs,
    onChange,
}: {
    prefs: WidgetPref[];
    onChange: (next: WidgetPref[]) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                className="h-9"
                onClick={() => setOpen(true)}
                title="Самбар тохируулах"
            >
                <Settings2 className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Тохируулах</span>
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Самбар тохируулах</SheetTitle>
                        <SheetDescription>
                            Виджетүүдийг нуух эсвэл дарааллыг нь өөрчилнө. Тохиргоо танд л хадгалагдана.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 space-y-2 px-4 pb-6">
                        {prefs.map((pref, i) => (
                            <div
                                key={pref.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="flex flex-col">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            disabled={i === 0}
                                            onClick={() => onChange(moveWidget(prefs, pref.id, -1))}
                                            title="Дээш"
                                        >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            disabled={i === prefs.length - 1}
                                            onClick={() => onChange(moveWidget(prefs, pref.id, 1))}
                                            title="Доош"
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <span className="text-sm font-medium text-foreground truncate">
                                        {LABELS.get(pref.id) || pref.id}
                                    </span>
                                </div>
                                <Switch
                                    checked={!pref.hidden}
                                    onCheckedChange={() => onChange(toggleWidget(prefs, pref.id))}
                                    aria-label={`${LABELS.get(pref.id) || pref.id} харуулах`}
                                />
                            </div>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
