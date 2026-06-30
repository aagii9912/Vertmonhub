'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/contexts/AuthContext';
import {
    Building2, User, Bell, Save, LogOut, Loader2, Check,
    Mail, Phone, MapPin, Globe
} from 'lucide-react';

export default function SettingsPage() {
    const { user, shop, refreshShop, signOut } = useAuth();

    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Company Settings
    const [companyName, setCompanyName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [companyEmail, setCompanyEmail] = useState('');
    const [address, setAddress] = useState('');
    const [website, setWebsite] = useState('');

    // Notification Settings
    const [emailNotif, setEmailNotif] = useState(true);
    const [leadNotif, setLeadNotif] = useState(true);
    const [reportNotif, setReportNotif] = useState(false);

    useEffect(() => {
        if (shop) {
            setCompanyName(shop.name || '');
            setOwnerName(shop.owner_name || '');
            setPhone(shop.phone || '');
        }
    }, [shop]);

    async function handleSave() {
        setLoading(true);
        setSaveStatus('saving');

        try {
            const res = await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: companyName,
                    owner_name: ownerName,
                    phone: phone,
                })
            });

            if (!res.ok) throw new Error('Failed to save');

            await refreshShop();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
            setSaveStatus('error');
        } finally {
            setLoading(false);
        }
    }

    async function handleLogout() {
        await signOut();
    }

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
                        <FormField
                            label={<span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Имэйл хаяг</span>}
                            htmlFor="company-email"
                        >
                            <Input
                                id="company-email"
                                type="email"
                                value={companyEmail}
                                onChange={(e) => setCompanyEmail(e.target.value)}
                                placeholder="info@vertmon.mn"
                            />
                        </FormField>
                        <FormField
                            label={<span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Хаяг</span>}
                            htmlFor="company-address"
                            className="md:col-span-2"
                        >
                            <Input
                                id="company-address"
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Улаанбаатар хот, Сүхбаатар дүүрэг"
                            />
                        </FormField>
                        <FormField
                            label={<span className="inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Вэб сайт</span>}
                            htmlFor="company-website"
                            className="md:col-span-2"
                        >
                            <Input
                                id="company-website"
                                type="url"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder="https://vertmon.mn"
                            />
                        </FormField>
                    </div>

                    <div className="flex justify-end">
                        <SaveButton />
                    </div>
                </div>
            </SectionCard>

            {/* Notification Settings */}
            <SectionCard title="Мэдэгдлийн тохиргоо" icon={Bell}>
                <div className="space-y-3">
                    <SettingRow
                        label="Имэйл мэдэгдэл"
                        description="Чухал шинэчлэлтүүдийг имэйлээр авах"
                        control={
                            <Switch
                                checked={emailNotif}
                                onCheckedChange={setEmailNotif}
                                aria-label="Имэйл мэдэгдэл"
                            />
                        }
                    />
                    <SettingRow
                        label="Шинэ Lead мэдэгдэл"
                        description="Шинэ лийд ирсэн үед мэдэгдэл авах"
                        control={
                            <Switch
                                checked={leadNotif}
                                onCheckedChange={setLeadNotif}
                                aria-label="Шинэ Lead мэдэгдэл"
                            />
                        }
                    />
                    <SettingRow
                        label="Долоо хоногийн тайлан"
                        description="Борлуулалтын тайланг долоо хоног бүр авах"
                        control={
                            <Switch
                                checked={reportNotif}
                                onCheckedChange={setReportNotif}
                                aria-label="Долоо хоногийн тайлан"
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
