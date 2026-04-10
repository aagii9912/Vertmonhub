'use client';

import confetti from 'canvas-confetti';
import { useCallback } from 'react';

export function useConfetti() {
    const triggerConfetti = useCallback(() => {
        // Center burst
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });

        // Left side
        setTimeout(() => {
            confetti({
                particleCount: 50,
                angle: 60,
                spread: 55,
                origin: { x: 0 }
            });
        }, 150);

        // Right side
        setTimeout(() => {
            confetti({
                particleCount: 50,
                angle: 120,
                spread: 55,
                origin: { x: 1 }
            });
        }, 300);
    }, []);

    const triggerSmall = useCallback(() => {
        confetti({
            particleCount: 40,
            spread: 50,
            origin: { y: 0.7 },
            colors: ['#8B5CF6', '#A78BFA', '#C4B5FD']
        });
    }, []);

    const triggerFinal = useCallback(() => {
        const duration = 2 * 1000;
        const end = Date.now() + duration;

        const frame = () => {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#8B5CF6', '#10B981', '#3B82F6']
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#8B5CF6', '#10B981', '#3B82F6']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        };

        frame();
    }, []);

    return { triggerConfetti, triggerSmall, triggerFinal };
}
