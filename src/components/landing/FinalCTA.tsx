'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Reveal } from './Reveal';

/**
 * Сүүлчийн уриалга — бүртгүүлэх / нэвтрэх.
 */
export function FinalCTA() {
    return (
        <section className="px-5 py-16 sm:px-6 sm:py-24">
            <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-brand/20 bg-brand-soft px-6 py-14 text-center sm:px-12 sm:py-20">
                {/* Дэвсгэр чимэглэл */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 20% 0%, var(--brand) 0, transparent 35%), radial-gradient(circle at 90% 100%, var(--brand) 0, transparent 35%)',
                        opacity: 0.08,
                    }}
                />
                <div className="relative">
                    <h2 className="heading-display text-3xl text-foreground sm:text-4xl lg:text-5xl">
                        Борлуулалтаа автоматжуулахад бэлэн үү?
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                        Хэдхэн минутын дотор нэвтэрч, AI борлуулагчаа ажиллуулж эхлээрэй.
                    </p>
                    <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Button href="/auth/register" variant="primary" size="lg" className="w-full sm:w-auto">
                            Үнэгүй эхлэх
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button href="/auth/login" variant="outline" size="lg" className="w-full sm:w-auto">
                            Нэвтрэх
                        </Button>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
