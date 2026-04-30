'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function NotificationButton() {
    const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

    if (!isSupported) {
        return null;
    }

    const handleClick = async () => {
        if (isSubscribed) {
            await unsubscribe();
        } else {
            await subscribe();
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading || permission === 'denied'}
            className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        transition-all duration-200
        ${isSubscribed
                    ? 'bg-status-success/20 text-green-400 hover:bg-status-success/30'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${permission === 'denied' ? 'opacity-50 cursor-not-allowed' : ''}
      `}
            title={
                permission === 'denied'
                    ? 'Notification зөвшөөрөл хаагдсан байна'
                    : isSubscribed
                        ? 'Notification унтраах'
                        : 'Notification идэвхжүүлэх'
            }
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSubscribed ? (
                <Bell className="w-4 h-4" />
            ) : (
                <BellOff className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
                {isLoading
                    ? 'Түр хүлээнэ үү...'
                    : isSubscribed
                        ? 'Notification ON'
                        : 'Notification OFF'
                }
            </span>
        </button>
    );
}
