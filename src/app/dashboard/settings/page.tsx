'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import {
    Building2, User, Bell, Save, LogOut, Loader2, Check,
    Mail, Phone, MapPin, Globe, Shield
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
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Тохиргоо</h1>
                <p className="text-gray-500 mt-1">Компани болон системийн тохиргоо</p>
            </div>

            {/* Company Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-violet-600" />
                        Компанийн мэдээлэл
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Компанийн нэр
                            </label>
                            <input
                                type="text"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="Vertmon LLC"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Удирдлагын нэр
                            </label>
                            <input
                                type="text"
                                value={ownerName}
                                onChange={(e) => setOwnerName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="Б. Батбаяр"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Phone className="w-3.5 h-3.5 inline mr-1" />
                                Утасны дугаар
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="99112233"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Mail className="w-3.5 h-3.5 inline mr-1" />
                                Имэйл хаяг
                            </label>
                            <input
                                type="email"
                                value={companyEmail}
                                onChange={(e) => setCompanyEmail(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="info@vertmon.mn"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <MapPin className="w-3.5 h-3.5 inline mr-1" />
                                Хаяг
                            </label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="Улаанбаатар хот, Сүхбаатар дүүрэг"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Globe className="w-3.5 h-3.5 inline mr-1" />
                                Вэб сайт
                            </label>
                            <input
                                type="url"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="https://vertmon.mn"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <SaveButton />
                    </div>
                </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-violet-600" />
                        Мэдэгдлийн тохиргоо
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-medium text-gray-900">Имэйл мэдэгдэл</p>
                            <p className="text-sm text-gray-500">Чухал шинэчлэлтүүдийг имэйлээр авах</p>
                        </div>
                        <button
                            onClick={() => setEmailNotif(!emailNotif)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailNotif ? 'bg-violet-600' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailNotif ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-medium text-gray-900">Шинэ Lead мэдэгдэл</p>
                            <p className="text-sm text-gray-500">Шинэ лийд ирсэн үед мэдэгдэл авах</p>
                        </div>
                        <button
                            onClick={() => setLeadNotif(!leadNotif)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${leadNotif ? 'bg-violet-600' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${leadNotif ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-medium text-gray-900">Долоо хоногийн тайлан</p>
                            <p className="text-sm text-gray-500">Борлуулалтын тайланг долоо хоног бүр авах</p>
                        </div>
                        <button
                            onClick={() => setReportNotif(!reportNotif)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reportNotif ? 'bg-violet-600' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${reportNotif ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Account */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="w-5 h-5 text-violet-600" />
                        Хэрэглэгчийн хаяг
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 font-medium">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">{user?.email}</p>
                                <p className="text-sm text-gray-500">Имэйл хаяг</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium"
                        >
                            <LogOut className="w-4 h-4" />
                            Системээс гарах
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
