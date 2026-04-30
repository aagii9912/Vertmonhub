'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Settings, Shield, Bell, Save, Loader2, Bot } from 'lucide-react';

interface SettingsData {
    general: {
        site_name: string;
        support_email: string;
    };
    notifications: {
        email_enabled: boolean;
        push_enabled: boolean;
    };
    ai: {
        default_model: string;
        max_tokens: number;
        temperature: number;
    };
}

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [currentAdmin, setCurrentAdmin] = useState<{ email: string; role: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const res = await fetch('/api/admin/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings);
                setCurrentAdmin(data.admin);
            }
        } catch (error) {
            console.error('Settings fetch error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function saveSettings() {
        if (!settings) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
            }
        } catch (error) {
            console.error('Save error:', error);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-brand-strong" />
            </div>
        );
    }

    const isSuperAdmin = currentAdmin?.role === 'super_admin';

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Системийн тохиргоо</h1>
                <p className="text-muted-foreground mt-1">Vertmon Hub платформын тохиргоо</p>
            </div>

            {saveSuccess && (
                <div className="p-3 bg-status-success-soft border border-status-success/30 rounded-lg text-status-success text-sm">
                    ✓ Тохиргоо амжилттай хадгалагдлаа
                </div>
            )}

            {settings && (
                <div className="space-y-6">
                    {/* General */}
                    <Card>
                        <CardContent className="p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-brand-strong" />
                                Ерөнхий тохиргоо
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Платформын нэр</label>
                                    <input
                                        type="text"
                                        value={settings.general.site_name}
                                        onChange={(e) => setSettings({ ...settings, general: { ...settings.general, site_name: e.target.value } })}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Тусламжийн имэйл</label>
                                    <input
                                        type="email"
                                        value={settings.general.support_email}
                                        onChange={(e) => setSettings({ ...settings, general: { ...settings.general, support_email: e.target.value } })}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notifications */}
                    <Card>
                        <CardContent className="p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Bell className="w-5 h-5 text-brand-strong" />
                                Мэдэгдэл
                            </h3>
                            <div className="space-y-3">
                                <label className="flex items-center justify-between p-3 bg-surface-2/40 rounded-lg cursor-pointer">
                                    <span className="text-foreground">Имэйл мэдэгдэл идэвхжүүлэх</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.notifications.email_enabled}
                                        onChange={(e) => setSettings({ ...settings, notifications: { ...settings.notifications, email_enabled: e.target.checked } })}
                                        className="w-4 h-4 text-brand-strong rounded"
                                    />
                                </label>
                                <label className="flex items-center justify-between p-3 bg-surface-2/40 rounded-lg cursor-pointer">
                                    <span className="text-foreground">Push notification идэвхжүүлэх</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.notifications.push_enabled}
                                        onChange={(e) => setSettings({ ...settings, notifications: { ...settings.notifications, push_enabled: e.target.checked } })}
                                        className="w-4 h-4 text-brand-strong rounded"
                                    />
                                </label>
                            </div>
                        </CardContent>
                    </Card>

                    {/* AI Settings */}
                    <Card>
                        <CardContent className="p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Bot className="w-5 h-5 text-brand-strong" />
                                AI тохиргоо
                            </h3>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Модел</label>
                                    <select
                                        value={settings.ai.default_model}
                                        onChange={(e) => setSettings({ ...settings, ai: { ...settings.ai, default_model: e.target.value } })}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                                    >
                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Max Tokens</label>
                                    <input
                                        type="number"
                                        value={settings.ai.max_tokens}
                                        onChange={(e) => setSettings({ ...settings, ai: { ...settings.ai, max_tokens: parseInt(e.target.value) } })}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Temperature</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="2"
                                        value={settings.ai.temperature}
                                        onChange={(e) => setSettings({ ...settings, ai: { ...settings.ai, temperature: parseFloat(e.target.value) } })}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Save */}
                    {isSuperAdmin && (
                        <div className="flex justify-end">
                            <button
                                onClick={saveSettings}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-strong disabled:opacity-50 font-medium"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
