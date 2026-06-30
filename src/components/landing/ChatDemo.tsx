'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Sparkles, User } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Reveal } from './Reveal';
import { cn } from '@/lib/utils';

type Msg = { from: 'customer' | 'ai'; text: string };

const SCRIPT: Msg[] = [
    { from: 'customer', text: 'Сайн байна уу, Хан-Уул дүүрэгт 2 өрөө байр байгаа юу?' },
    {
        from: 'ai',
        text: 'Сайн байна уу! Тийм ээ, Хан-Уулд 3 хувилбар байна. 145–185 сая₮. Зургийг нь явуулах уу?',
    },
    { from: 'customer', text: 'Тийм, зээлийн төлбөр хэд болохыг бас хэлээч.' },
    {
        from: 'ai',
        text: '160 сая₮ байрны хувьд 6%-ийн орон сууцны зээлээр сард ≈980,000₮. Уулзалт товлох уу? 😊',
    },
];

/**
 * Messenger AI demo — хэрэглэгчийн мессеж → AI хариу-г дараалан гаргана.
 * useReducedMotion үед бүх мессеж шууд харагдаж, цикл явагдахгүй.
 */
export function ChatDemo() {
    const reduced = useReducedMotion();
    const [visible, setVisible] = useState(reduced ? SCRIPT.length : 0);
    const [typing, setTyping] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (reduced) {
            setVisible(SCRIPT.length);
            return;
        }

        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];

        const run = () => {
            setVisible(0);
            SCRIPT.forEach((msg, i) => {
                // typing indicator AI хариунаас өмнө
                if (msg.from === 'ai') {
                    timers.push(
                        setTimeout(() => {
                            if (!cancelled) setTyping(true);
                        }, i * 1700 + 200),
                    );
                }
                timers.push(
                    setTimeout(() => {
                        if (cancelled) return;
                        setTyping(false);
                        setVisible(i + 1);
                    }, i * 1700 + 1400),
                );
            });
            // циклийг дахин эхлүүлэх
            timers.push(
                setTimeout(() => {
                    if (!cancelled) run();
                }, SCRIPT.length * 1700 + 2600),
            );
        };

        run();
        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    }, [reduced]);

    return (
        <section aria-labelledby="chat-demo-title" className="px-5 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal>
                    <p className="font-mono text-2xs uppercase tracking-[0.16em] text-brand-strong">Messenger AI</p>
                    <h2
                        id="chat-demo-title"
                        className="heading-display mt-3 text-3xl text-foreground sm:text-4xl"
                    >
                        Захиа бүрийг борлуулалт болгоно
                    </h2>
                    <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                        Харилцагч асуумагц AI борлуулагч хариулж, орон сууц санал болгож, зээлийн тооцоо хийж, уулзалт
                        товлоно. Шөнө дунд ч таны нэрийн өмнөөс ажиллана.
                    </p>
                    <ul className="mt-6 space-y-2.5">
                        {['Автомат хариу 3 секундын дотор', 'Орон сууц + зээлийн тооцоо', 'Шаардлагатай үед менежерт шилжүүлнэ'].map(
                            (item) => (
                                <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                                        <Sparkles className="h-3 w-3" />
                                    </span>
                                    {item}
                                </li>
                            ),
                        )}
                    </ul>
                </Reveal>

                {/* Чат цонх */}
                <Reveal delay={0.1}>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
                        {/* Толгой */}
                        <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-fg">
                                <Bot className="h-4.5 w-4.5" />
                            </span>
                            <div>
                                <p className="text-sm font-medium text-foreground">Vertmon AI борлуулагч</p>
                                <p className="flex items-center gap-1.5 text-2xs text-status-success">
                                    <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                                    Онлайн · Messenger
                                </p>
                            </div>
                        </div>

                        {/* Мессежүүд */}
                        <div ref={containerRef} className="flex h-[340px] flex-col justify-end gap-3 p-4">
                            <AnimatePresence initial={false}>
                                {SCRIPT.slice(0, visible).map((msg, i) => (
                                    <Bubble key={i} msg={msg} reduced={reduced} />
                                ))}
                                {typing && !reduced && <TypingBubble key="typing" />}
                            </AnimatePresence>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

function Bubble({ msg, reduced }: { msg: Msg; reduced: boolean }) {
    const isAi = msg.from === 'ai';
    return (
        <motion.div
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn('flex items-end gap-2', isAi ? 'flex-row' : 'flex-row-reverse')}
        >
            <span
                className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    isAi ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-muted-foreground',
                )}
            >
                {isAi ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </span>
            <p
                className={cn(
                    'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    isAi
                        ? 'rounded-bl-md bg-brand-soft text-brand-strong'
                        : 'rounded-br-md bg-surface-2 text-foreground',
                )}
            >
                {msg.text}
            </p>
        </motion.div>
    );
}

function TypingBubble() {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-end gap-2"
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg">
                <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-brand-soft px-4 py-3">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-brand-strong"
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                    />
                ))}
            </span>
        </motion.div>
    );
}
