'use client';

import { usePageTitle } from '@/lib/navigation/pageTitle';
import { NotFoundPanel } from './NotFoundPanel';

/** Ажлын shell доторх 404 — дээд мөр, браузерын таб «Хуудас олдсонгүй» гэж нэрлэнэ. */
export function InAppNotFound() {
    usePageTitle('Хуудас олдсонгүй');
    return <NotFoundPanel inApp />;
}
