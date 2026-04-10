'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { en } from '@/i18n/en';
import { mn } from '@/i18n/mn';
import type { Translations } from '@/i18n/mn';

export type Locale = 'en' | 'mn';

const STORAGE_KEY = 'syncly_locale';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const translations: Record<Locale, Translations> = { en, mn };

const LanguageContext = createContext<LanguageContextType>({
  locale: 'mn',
  setLocale: () => {},
  t: mn,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('mn');
  const [mounted, setMounted] = useState(false);

  // Load saved locale from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && (saved === 'en' || saved === 'mn')) {
      setLocaleState(saved);
    }
    setMounted(true);
  }, []);

  // Update <html lang> attribute when locale changes
  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale;
    }
  }, [locale, mounted]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = translations[locale];

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
