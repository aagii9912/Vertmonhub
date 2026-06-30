'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { Building2, Quote } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Reveal } from './Reveal';

const STATS = [
    { value: 2552, suffix: '', label: 'Орон сууцны нэгж' },
    { value: 1617, suffix: '', label: 'Бүртгэгдсэн гэрээ' },
    { value: 264, suffix: ' тэрбум₮', label: 'Гэрээний нийт дүн' },
];

/**
 * Туршилтаас бодит руу — Mandala Garden-ийн бодит тоонууд.
 */
export function SocialProof() {
    return (
        <section id="proof" aria-labelledby="proof-title" className="px-5 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-6xl">
                <Reveal className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
                    <div className="grid lg:grid-cols-[1fr_1.1fr]">
                        {/* Зүүн: үйлчлүүлэгчийн танилцуулга */}
                        <div className="border-b border-border p-8 sm:p-10 lg:border-b-0 lg:border-r">
                            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
                                <Building2 className="h-3.5 w-3.5" />
                                Тэргүүлэх үйлчлүүлэгч
                            </span>
                            <h2 id="proof-title" className="heading-display mt-5 text-3xl text-foreground sm:text-4xl">
                                Mandala Garden
                            </h2>
                            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                                Орон сууцны цогцолборын бүх нэгж, гэрээ, төлбөрийн хуваарийг Vertmon Hub дээр нэгтгэн
                                удирдаж байна.
                            </p>

                            <figure className="mt-8 rounded-2xl border border-border bg-surface-2 p-5">
                                <Quote className="h-5 w-5 text-brand" aria-hidden="true" />
                                <blockquote className="mt-3 text-sm leading-relaxed text-foreground">
                                    «Хэдэн мянган нэгж, гэрээний өгөгдлийг нэг системд цэгцэлж, борлуулалтаа бодит цагаар
                                    хянадаг болсон.»
                                </blockquote>
                                <figcaption className="mt-3 text-2xs text-muted-foreground">
                                    Борлуулалтын баг · Mandala Garden
                                </figcaption>
                            </figure>
                        </div>

                        {/* Баруун: статистик хавтангууд */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1">
                            {STATS.map((stat, i) => (
                                <div
                                    key={stat.label}
                                    className={`flex flex-col justify-center p-8 sm:p-10 ${
                                        i < STATS.length - 1 ? 'border-b border-border' : ''
                                    }`}
                                >
                                    <CountUp value={stat.value} suffix={stat.suffix} />
                                    <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

function CountUp({ value, suffix }: { value: number; suffix: string }) {
    const reduced = useReducedMotion();
    const ref = useRef<HTMLParagraphElement>(null);
    const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px' });
    const [display, setDisplay] = useState(reduced ? value : 0);

    useEffect(() => {
        if (reduced) {
            setDisplay(value);
            return;
        }
        if (!inView) return;

        let raf = 0;
        const duration = 1400;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            // easeOutExpo
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(Math.round(eased * value));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [inView, reduced, value]);

    return (
        <p ref={ref} className="heading-display text-4xl text-foreground tabular-nums sm:text-5xl">
            {display.toLocaleString('en-US')}
            <span className="text-2xl text-brand sm:text-3xl">{suffix}</span>
        </p>
    );
}
