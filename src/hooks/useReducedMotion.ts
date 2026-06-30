'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Хэрэглэгчийн "хөдөлгөөн багасгах" (prefers-reduced-motion) тохиргоог буцаана.
 *
 * Бүх JS animation (Framer Motion / `motion`)-ийг энэ утгаар хаах ёстой —
 * CSS-ийн `@media (prefers-reduced-motion)` clamp нь зөвхөн CSS animation-д
 * үйлчилдэг тул JS-ээр удирдсан хөдөлгөөнийг өөрсдөө хүндэтгэх шаардлагатай.
 *
 * SSR-д үргэлж `false` (хөдөлгөөнтэй) гэж эхэлж, mount хийсний дараа бодит
 * утгыг тогтоодог тул hydration mismatch гарахгүй.
 *
 * @example
 * const reduced = useReducedMotion();
 * <motion.div animate={reduced ? {} : { opacity: 1, y: 0 }} />
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
