'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

const isDev = process.env.NODE_ENV === 'development';

interface UsePushNotificationsReturn {
    isSupported: boolean;
    isSubscribed: boolean;
    isLoading: boolean;
    permission: NotificationPermission | null;
    subscribe: () => Promise<boolean>;
    unsubscribe: () => Promise<boolean>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);

    // Check if push notifications are supported
    useEffect(() => {
        const checkSupport = async () => {
            const supported =
                'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window;

            setIsSupported(supported);

            if (supported) {
                setPermission(Notification.permission);

                // Check if already subscribed (with timeout)
                try {
                    const timeoutPromise = new Promise<null>((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 3000)
                    );

                    const registration = await Promise.race([
                        navigator.serviceWorker.ready,
                        timeoutPromise
                    ]) as ServiceWorkerRegistration | null;

                    if (registration) {
                        const subscription = await registration.pushManager.getSubscription();
                        if (subscription) {
                            setIsSubscribed(true);
                            // Sync subscription with server to ensure it's linked to current shop
                            fetch('/api/push/subscribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ subscription: subscription.toJSON() }),
                            }).catch(err => { if (isDev) console.error('Subscription sync error:', err); });
                        }
                    }
                } catch {
                    // Service worker not ready yet - will register on subscribe
                }
            }

            setIsLoading(false);
        };

        checkSupport();
    }, []);

    // Subscribe to push notifications
    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;

        setIsLoading(true);

        try {
            // Request permission
            const permissionResult = await Notification.requestPermission();
            setPermission(permissionResult);

            if (permissionResult !== 'granted') {
                setIsLoading(false);
                return false;
            }

            // Get VAPID public key
            const vapidRes = await fetch('/api/push/vapid');
            if (!vapidRes.ok) {
                throw new Error('VAPID_NOT_CONFIGURED');
            }
            const { publicKey } = await vapidRes.json();

            // Register service worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });

            // Save subscription to server
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: subscription.toJSON() }),
            });

            if (!res.ok) {
                throw new Error('Failed to save subscription');
            }

            setIsSubscribed(true);
            setIsLoading(false);
            return true;
        } catch (err: any) {
            if (isDev) console.error('Subscribe error:', err);
            toast.error('Мэдэгдэл идэвхжүүлж чадсангүй', {
                description: err?.message === 'VAPID_NOT_CONFIGURED'
                    ? 'Серверт мэдэгдлийн тохиргоо (VAPID) дутуу байна. Админд хандана уу.'
                    : (err?.message || 'Дахин оролдоно уу.'),
            });
            setIsLoading(false);
            return false;
        }
    }, [isSupported]);

    // Unsubscribe from push notifications
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;

        setIsLoading(true);

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Unsubscribe locally
                await subscription.unsubscribe();

                // Remove from server
                await fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
            }

            setIsSubscribed(false);
            setIsLoading(false);
            return true;
        } catch (err) {
            if (isDev) console.error('Unsubscribe error:', err);
            setIsLoading(false);
            return false;
        }
    }, [isSupported]);

    return {
        isSupported,
        isSubscribed,
        isLoading,
        permission,
        subscribe,
        unsubscribe,
    };
}

// Helper function to convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
}
