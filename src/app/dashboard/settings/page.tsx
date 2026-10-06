'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { LeadCategoriesSettings } from '@/components/settings/LeadCategoriesSettings';
import {
    Building2, User, Bell, Save, LogOut, Loader2, Check, Phone
} from 'lucide-react';

// Имэйл, хаяг, вэб сайтын талбар `shops` хүснэгтэд байхгүй тул хадгалагдахгүй
// удирдлага харуулахгүй. Мэдэгдлийн цорын ганц хадгалагддаг тохиргоо бол энэ
// төхөөрөмжийн push бүртгэл (/api/push/subscribe, «Миний ажлууд»-тай ижил).

export default function SettingsPage() {
    const { user, shop, refreshShop, signOut } = useAuth();
    const push = usePushNotifications();

    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    // Company Settings
    const [companyName, setCompanyName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        if (shop) {
            setCompanyName(shop.name || '');
            setOwnerName(shop.owner_name || '');
            setPhone(shop.phone || '');
        }
    }, [shop]);

    async function handleSave() {
        const name = companyName.trim();
        if (!name) {
            setSaveStatus('error');
            setSaveError('Төслийн нэрийг оруулна уу.');
            return;
        }

        setLoading(true);
        setSaveStatus('saving');
        setSaveError(null);

        try {
            let res: Response;
            try {
                res = await dashboardFetch('/api/shop', {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name,
                        owner_name: ownerName.trim() || null,
                        phone: phone.trim() || null,
                    })
                });
            } catch {
                throw new Error('Сүлжээний алдаа. Дахин оролдоно уу.');
            }

            if (!res.ok) {
                const detail = await res.json().catch(() => null) as { error?: string } | null;
                throw new Error(detail?.error || `Хүсэлт амжилтгүй (${res.status}). Дахин оролдоно уу.`);
            }

            await refreshShop();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (error) {
            setSaveStatus('error');
            setSaveError(`Хадгалж чадсангүй: ${error instanceof Error ? error.message : 'Дахин оролдоно уу.'}`);
        } finally {
            setLoading(false);
        }
    }

    async function togglePush(next: boolean) {
        if (next) {
            // subscribe() алдаагаа өөрөө toast-оор мэдэгдэнэ
            await push.subscribe();
            return;
        }
        if (!await push.unsubscribe()) toast.error('Мэдэгдлийг унтрааж чадсангүй. Дахин оролдоно уу.');
    }

    async function handleLogout() {
        await signOut();
    }

    // Hook дэмжлэгийг mount-ийн дараа шалгадаг тул шалгаж дуусаагүй үед «дэмжихгүй» гэж харуулахгүй.
    const pushDescription = !push.isSupported && !push.isLoading
        ? 'Энэ хөтөч push мэдэгдэл дэмжихгүй байна.'
        : push.permission === 'denied'
            ? 'Хөтчийн тохиргоонд мэдэгдлийг хориглосон байна. Тэндээс зөвшөөрсний дараа асаана уу.'
            : 'Шинэ лид, даалгаврын сануулга зэрэг мэдэгдлийг энэ төхөөрөмж дээр авах';

    const SaveButton = () => (
        <Button onClick={handleSave} disabled={loading}>
            {saveStatus === 'saving' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Хадгалж байна...</>
            ) : saveStatus === 'saved' ? (
                <><Check className="w-4 h-4 mr-2" /> Хадгалагдлаа!</>
            ) : (
                <><Save className="w-4 h-4 mr-2" /> Хадгалах</>
            )}
        </Button>
    );

    return (
        <div className="space-y-6 max-w-4xl">
            <PageHeader
                title="Тохиргоо"
                subtitle="Төсөл болон системийн тохиргоо"
            />

            {/* Company Information */}
            <SectionCard title="Төслийн мэдээлэл" icon={Building2}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Төслийн нэр" htmlFor="company-name">
                            <Input
                                id="company-name"
                                type="text"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                placeholder="Vertmon LLC"
                            />
                        </FormField>
                        <FormField label="Удирдлагын нэр" htmlFor="owner-name">
                            <Input
                                id="owner-name"
                                type="text"
                                value={ownerName}
                                onChange={(e) => setOwnerName(e.target.value)}
                                placeholder="Б. Батбаяр"
                            />
                        </FormField>
                        <FormField
                            label={<span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Утасны дугаар</span>}
                            htmlFor="company-phone"
                        >
                            <Input
                                id="company-phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="99112233"
                            />
                        </FormField>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <SaveButton />
                        {saveError && (
                            <p role="alert" className="text-sm text-status-danger">{saveError}</p>
                        )}
                    </div>
                </div>
            </SectionCard>

            {/* Лидийн ангилал (төсөл бүрийн жагсаалт) */}
            <LeadCategoriesSettings />

            {/* Notification Settings */}
            <SectionCard title="Мэдэгдлийн тохиргоо" icon={Bell}>
                <div className="space-y-3">
                    <SettingRow
                        label="Push мэдэгдэл"
                        description={pushDescription}
                        control={
                            <Switch
                                checked={push.isSubscribed}
                                disabled={!push.isSupported || push.isLoading || push.permission === 'denied'}
                                onCheckedChange={(next) => void togglePush(next)}
                                aria-label="Push мэдэгдэл"
                            />
                        }
                    />
                </div>
            </SectionCard>

            {/* Account */}
            <SectionCard title="Хэрэглэгчийн хаяг" icon={User}>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-surface-2/40 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-brand-soft rounded-xl flex items-center justify-center text-brand-strong font-medium">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p className="font-medium text-foreground">{user?.email}</p>
                                <p className="text-sm text-muted-foreground">Имэйл хаяг</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-border/60">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-status-danger hover:text-status-danger font-medium"
                        >
                            <LogOut className="w-4 h-4" />
                            Системээс гарах
                        </button>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
