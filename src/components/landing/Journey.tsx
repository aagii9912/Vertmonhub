'use client';

import { MessageSquare, CalendarCheck, FileSignature, BarChart3, ArrowRight } from 'lucide-react';
import { Reveal, RevealStagger, RevealStaggerItem } from './Reveal';

const STEPS = [
    {
        icon: MessageSquare,
        eyebrow: '01',
        title: 'Лийд',
        desc: 'Messenger-ийн захиа бүрийг AI хариулж, харилцагчийн нэр, утас, сонирхлыг автоматаар бүртгэнэ.',
    },
    {
        icon: CalendarCheck,
        eyebrow: '02',
        title: 'Үзлэг',
        desc: 'Тохирох орон сууцыг санал болгож, үзлэгийн цагийг товлоод менежерт мэдэгдэл илгээнэ.',
    },
    {
        icon: FileSignature,
        eyebrow: '03',
        title: 'Гэрээ',
        desc: 'Гэрээг үүсгэж, төлбөрийн хуваарь, хоцрогдлыг хянаж, хүлээлгэн өгөх актыг бүрдүүлнэ.',
    },
    {
        icon: BarChart3,
        eyebrow: '04',
        title: 'Тайлан',
        desc: 'Менежер бүрийн гүйцэтгэл, орлого, pipeline урьдчилсан тооцоог бодит цагаар харна.',
    },
];

/**
 * Борлуулалтын аяллыг 4 алхмаар өгүүлэх блок.
 */
export function Journey() {
    return (
        <section id="journey" aria-labelledby="journey-title" className="px-5 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-6xl">
                <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="font-mono text-2xs uppercase tracking-[0.16em] text-brand-strong">Үйл явц</p>
                    <h2 id="journey-title" className="heading-display mt-3 text-3xl text-foreground sm:text-4xl">
                        Нэг харилцагчийн бүтэн аялал
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        Эхний захианаас гэрээ хүртэлх бүх алхмыг систем чинь өөрөө хөтөлнө.
                    </p>
                </Reveal>

                <RevealStagger className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {STEPS.map((step, i) => {
                        const Icon = step.icon;
                        const last = i === STEPS.length - 1;
                        return (
                            <RevealStaggerItem key={step.title} className="relative">
                                <div className="group h-full rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-border-strong">
                                    <div className="flex items-center justify-between">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-strong transition-colors group-hover:bg-brand group-hover:text-brand-fg">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="font-mono text-2xs tracking-widest text-muted-foreground">
                                            {step.eyebrow}
                                        </span>
                                    </div>
                                    <h3 className="heading-section mt-5 text-xl text-foreground">{step.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                                </div>

                                {/* Холбоосын сум — зөвхөн desktop-д */}
                                {!last && (
                                    <span
                                        aria-hidden="true"
                                        className="absolute right-[-1.05rem] top-1/2 z-10 hidden -translate-y-1/2 lg:flex"
                                    >
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-brand">
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </span>
                                    </span>
                                )}
                            </RevealStaggerItem>
                        );
                    })}
                </RevealStagger>
            </div>
        </section>
    );
}
