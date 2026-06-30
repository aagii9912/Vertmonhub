'use client';

import { motion } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DashboardMock } from './DashboardMock';

const TRUST = ['Монгол хэлтэй', '24/7 Messenger AI', 'Лийдээс гэрээ хүртэл'];

/**
 * Hero — гол үнэ цэнийн мессеж + CTA + бүтээгдэхүүний дүрслэл.
 */
export function Hero() {
    const reduced = useReducedMotion();

    const fade = (delay: number) =>
        reduced
            ? {}
            : {
                  initial: { opacity: 0, y: 18 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
              };

    return (
        <section className="relative overflow-hidden px-5 pt-28 pb-16 sm:px-6 sm:pt-36 sm:pb-24">
            {/* Дэвсгэр чимэглэл */}
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute left-1/2 top-0 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-brand-soft/50 blur-3xl" />
                <div
                    className="absolute inset-0 opacity-[0.4]"
                    style={{
                        backgroundImage:
                            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
                        backgroundSize: '64px 64px',
                        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, black 30%, transparent 75%)',
                    }}
                />
            </div>

            <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
                {/* Текст блок */}
                <div className="text-center lg:text-left">
                    <motion.div
                        {...fade(0)}
                        className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3.5 py-1.5 text-xs font-medium text-brand-strong"
                    >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Монголын үл хөдлөхийн AI борлуулалтын платформ
                    </motion.div>

                    <motion.h1
                        {...fade(0.08)}
                        className="heading-display mt-6 text-[2.5rem] leading-[1.05] text-foreground sm:text-5xl lg:text-[3.75rem]"
                    >
                        Лийдээс гэрээ хүртэл
                        <br />
                        <span className="text-brand">нэг ухаалаг системд</span>
                    </motion.h1>

                    <motion.p
                        {...fade(0.16)}
                        className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0"
                    >
                        Facebook болон Instagram Messenger дээр AI борлуулагч 24/7 хариулж, лийд цуглуулна. Үзлэг товлох,
                        гэрээ хянах, санхүүгийн тайлан — бүгд нэг дороос.
                    </motion.p>

                    <motion.div
                        {...fade(0.24)}
                        className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start sm:justify-center"
                    >
                        <Button href="/auth/register" variant="primary" size="lg" className="w-full sm:w-auto">
                            Үнэгүй эхлэх
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button href="/auth/login" variant="outline" size="lg" className="w-full sm:w-auto">
                            Нэвтрэх
                        </Button>
                    </motion.div>

                    <motion.ul
                        {...fade(0.32)}
                        className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start"
                    >
                        {TRUST.map((item) => (
                            <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                                {item}
                            </li>
                        ))}
                    </motion.ul>
                </div>

                {/* Бүтээгдэхүүний дүрслэл */}
                <motion.div
                    {...(reduced
                        ? {}
                        : {
                              initial: { opacity: 0, scale: 0.96, y: 20 },
                              animate: { opacity: 1, scale: 1, y: 0 },
                              transition: { duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const },
                          })}
                    className="mx-auto w-full max-w-lg lg:max-w-none"
                >
                    <DashboardMock />
                </motion.div>
            </div>
        </section>
    );
}
