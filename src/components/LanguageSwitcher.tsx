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
                aria-label="Хэл сонгох"
                aria-expanded={open}
                aria-haspopup="listbox"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
                <Globe className="w-4 h-4 text-gray-500" />
                <span>{current.flag}</span>
                <span className="text-gray-600 text-xs hidden sm:inline">{current.label}</span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[140px]">
                        {LOCALES.map(l => (
                            <button
                                key={l.code}
                                onClick={() => handleChange(l.code)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${locale === l.code ? 'bg-violet-50 text-violet-700' : 'text-gray-700'}`}
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
