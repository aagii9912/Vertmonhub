'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export function useRealtimeNotifications() {
    const { shop } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!shop?.id) return;

        const supabase = createSupabaseBrowserClient();
        const channel = supabase
            .channel(`shop-updates-${shop.id}`)
            // 💬 Шинэ мессеж (chat_history-д шинэ мөр = ирсэн харилцаа)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_history',
                filter: `shop_id=eq.${shop.id}`
            }, (payload) => {
                // Ирсэн мессеж ч, ажилтны хариу ч Inbox-ийн «хариу хүлээж буй» тоо, жагсаалтыг өөрчилнө.
                void queryClient.invalidateQueries({ queryKey: ['nav-counts'] });
                void queryClient.invalidateQueries({ queryKey: ['conversations'] });

                const message: string = payload.new?.message || '';
                if (!message) return;

                toast.info('💬 Шинэ мессеж', {
                    description: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                    action: {
                        label: 'Хариулах',
                        onClick: () => router.push(`/dashboard/inbox`)
                    }
                });

                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
                audio.play().catch(() => { /* Audio autoplay blocked */ });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [shop?.id, router, queryClient]);
}
