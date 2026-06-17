'use client';

/**
 * Гэрэл / харанхуй горим сэлгэгч. data-theme атрибутыг <html>-д тавьж, localStorage-д
 * хадгална (layout.tsx доторх inline script анхны ачаалалд flash-гүйгээр сэргээнэ).
 */

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'dark' : 'light');
        setMounted(true);
    }, []);

    const toggle = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('vh-theme', next); } catch { /* ignore */ }
    };

    const isDark = theme === 'dark';
    return (
        <button
            onClick={toggle}
            aria-label={isDark ? 'Гэрэл горимд шилжих' : 'Харанхуй горимд шилжих'}
            title={isDark ? 'Гэрэл горим' : 'Харанхуй горим'}
            className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
        >
            {/* mounted-ийн өмнө тогтмол Moon — hydration зөрчлөөс сэргийлнэ */}
            {mounted && isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
    );
}
