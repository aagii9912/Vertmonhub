'use client';

import { useState } from 'react';
import { LOCALES, type Locale, getStoredLocale, setStoredLocale } from '@/lib/i18n';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
    const [locale, setLocale] = useState<Locale>(getStoredLocale());
    const [open, setOpen] = useState(false);

    const handleChange = (newLocale: Locale) => {
        setLocale(newLocale);
        setStoredLocale(newLocale);
        setOpen(false);
        // Trigger re-render across app
        window.dispatchEvent(new CustomEvent('locale-change', { detail: newLocale }));
    };

    const current = LOCALES.find(l => l.code === locale) || LOCALES[0];

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:border-border-strong text-sm transition-colors"
                aria-label="Хэл сонгох"
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span>{current.flag}</span>
                <span className="text-muted-foreground text-xs hidden sm:inline">{current.label}</span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-surface rounded-lg shadow-lg border border-border py-1 z-50 min-w-[140px]" role="menu" aria-label="Хэл сонгох">
                        {LOCALES.map(l => (
                            <button
                                key={l.code}
                                onClick={() => handleChange(l.code)}
                                role="menuitem"
                                aria-current={locale === l.code ? 'true' : undefined}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2/40 transition-colors ${locale === l.code ? 'bg-brand-soft text-brand-strong' : 'text-foreground'}`}
                            >
                                <span>{l.flag}</span>
                                <span>{l.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
