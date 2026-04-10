export { en } from './en';
export { mn } from './mn';
export type { Translations } from './mn';

export type Locale = 'en' | 'mn';

export const translations: Record<Locale, () => Promise<{ default: any } | any>> = {
  en: () => import('./en').then(m => m.en),
  mn: () => import('./mn').then(m => m.mn),
};

// Synchronous access — for SSR-safe usage we import both upfront
import { en } from './en';
import { mn } from './mn';
import type { Translations } from './mn';

export const locales: Record<Locale, Translations> = { en, mn };
