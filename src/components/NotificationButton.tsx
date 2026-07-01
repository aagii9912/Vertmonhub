'use client';

import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function NotificationButton() {
    const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

    if (!isSupported) return null;

    const denied = permission === 'denied';

    const handleClick = async () => {
        if (denied) return;
        if (isSubscribed) await unsubscribe();
        else await subscribe();
    };

    const title = denied
        ? 'Мэдэгдлийн зөвшөөрөл хаагдсан — хөтчийн тохиргооноос нээнэ үү'
        : isSubscribed
            ? 'Мэдэгдэл идэвхтэй — унтраахын тулд дарна уу'
            : 'Мэдэгдэл идэвхжүүлэх';

    return (
        <button
            onClick={handleClick}
            disabled={isLoading || denied}
            aria-label={title}
            aria-pressed={isSubscribed}
            title={title}
            className={`relative inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed ${denied ? 'text-muted-foreground/50' : isSubscribed ? 'text-brand' : 'text-muted-foreground'}`}
        >
            {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : denied ? (
                <BellOff className="w-5 h-5" />
            ) : isSubscribed ? (
                <BellRing className="w-5 h-5" />
            ) : (
                <Bell className="w-5 h-5" />
            )}
            {isSubscribed && !isLoading && (
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-status-success ring-2 ring-surface" />
            )}
        </button>
    );
}
