'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface RevealProps {
    children: ReactNode;
    className?: string;
    /** Хойшлуулах (секундээр) — stagger-д ашиглана */
    delay?: number;
    /** Доороос дээш гулсах зай (px) */
    y?: number;
    as?: 'div' | 'section' | 'li' | 'span';
}

/**
 * Scroll-д орж ирэхэд нэг удаа гарах "reveal" хөдөлгөөн.
 * useReducedMotion === true үед хөдөлгөөнгүйгээр шууд харагдана (layout shift үүсгэхгүй).
 */
export function Reveal({ children, className, delay = 0, y = 16, as = 'div' }: RevealProps) {
    const reduced = useReducedMotion();
    const MotionTag = motion[as];

    if (reduced) {
        const Tag = as;
        return <Tag className={className}>{children}</Tag>;
    }

    return (
        <MotionTag
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -80px 0px' }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </MotionTag>
    );
}

/**
 * Хүүхэд элементүүдийг дараалан (stagger) гаргах контейнер.
 */
export function RevealStagger({ children, className }: { children: ReactNode; className?: string }) {
    const reduced = useReducedMotion();

    if (reduced) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={className}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -80px 0px' }}
            variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08 } },
            }}
        >
            {children}
        </motion.div>
    );
}

export function RevealStaggerItem({
    children,
    className,
    y = 16,
}: {
    children: ReactNode;
    className?: string;
    y?: number;
}) {
    const reduced = useReducedMotion();

    if (reduced) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={cn(className)}
            variants={{
                hidden: { opacity: 0, y },
                show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
            }}
        >
            {children}
        </motion.div>
    );
}
