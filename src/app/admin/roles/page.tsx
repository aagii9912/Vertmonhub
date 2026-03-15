'use client';

import { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Save, Loader2, X, Check, AlertCircle, Lock } from 'lucide-react';
import { ALL_MODULES, MODULE_LABELS } from '@/lib/rbac';

interface Role {
    id: string;
    name: string;
    display_name: string;
    display_name_mn: string;
    description: string | null;
    can_write: boolean;
    can_delete: boolean;
    can_access_admin: boolean;
    is_system: boolean;
    role_permissions: { id: string; module: string }[];
}

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // New role dialog
    const [showCreate, setShowCreate] = useState(false);
    const [newRole, setNewRole] = useState({
        name: '', display_name: '', display_name_mn: '', description: '',
        can_write: false, can_delete: false, can_access_admin: false,
        modules: ['dashboard'] as string[],
    });

    useEffect(() => { fetchRoles(); }, []);

    async function fetchRoles() {
        try {
            const res = await fetch('/api/admin/roles');
            const data = await res.json();
            if (res.ok) {
                setRoles(data.roles || []);
            } else {
                setError(data.error || 'Failed to load roles');
            }
        } catch { setError('Network error'); }
        finally { setLoading(false); }
    }

    async function toggleModule(roleId: string, module: string) {
        const role = roles.find(r => r.id === roleId);
        if (!role) return;

        const currentModules = role.role_permissions.map(rp => rp.module);
        const newModules = currentModules.includes(module)
            ? currentModules.filter(m => m !== module)
            : [...currentModules, module];

        setSaving(roleId);
        try {
            const res = await fetch(`/api/admin/roles/${roleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modules: newModules }),
            });
            if (res.ok) {
                const data = await res.json();
                setRoles(prev => prev.map(r => r.id === roleId ? data.role : r));
            } else {
                const data = await res.json();
                setError(data.error);
            }
        } catch { setError('Failed to update'); }
        finally { setSaving(null); }
    }

    async function updateRoleField(roleId: string, field: string, value: boolean) {
        setSaving(roleId);
        try {
            const res = await fetch(`/api/admin/roles/${roleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            });
            if (res.ok) {
                const data = await res.json();
                setRoles(prev => prev.map(r => r.id === roleId ? data.role : r));
            }
        } catch { setError('Failed to update'); }
        finally { setSaving(null); }
    }

    async function createRole() {
        if (!newRole.name || !newRole.display_name || !newRole.display_name_mn) {
            setError('Бүх талбарыг бөглөнө үү');
            return;
        }

        setSaving('new');
        try {
            const res = await fetch('/api/admin/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRole),
            });
            const data = await res.json();
            if (res.ok) {
                setRoles(prev => [...prev, data.role]);
                setShowCreate(false);
                setNewRole({
                    name: '', display_name: '', display_name_mn: '', description: '',
                    can_write: false, can_delete: false, can_access_admin: false,
                    modules: ['dashboard'],
                });
                setSuccess('Дүр амжилттай үүсгэлээ');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(data.error || 'Failed to create');
            }
        } catch { setError('Network error'); }
        finally { setSaving(null); }
    }

    async function deleteRole(roleId: string) {
        if (!confirm('Энэ дүрийг устгахдаа итгэлтэй байна уу?')) return;
        setSaving(roleId);
        try {
            const res = await fetch(`/api/admin/roles/${roleId}`, { method: 'DELETE' });
            if (res.ok) {
                setRoles(prev => prev.filter(r => r.id !== roleId));
                setSuccess('Дүр устгагдлаа');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to delete');
            }
        } catch { setError('Network error'); }
        finally { setSaving(null); }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-violet-600" />
                        Дүрүүд удирдах
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Дүр (role) тус бүрт module хандалтын зөвшөөрөл тохируулна
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Шинэ дүр
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-center justify-between">
                    <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5" />{error}</div>
                    <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
                </div>
            )}
            {success && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2">
                    <Check className="w-5 h-5" />{success}
                </div>
            )}

            {/* Permissions Grid */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[180px]">
                                    Module
                                </th>
                                {roles.map(role => (
                                    <th key={role.id} className="text-center px-3 py-3 min-w-[120px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-sm font-semibold text-gray-900">
                                                {role.display_name_mn}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-mono">
                                                {role.name}
                                            </span>
                                            {role.is_system && (
                                                <Lock className="w-3 h-3 text-gray-400" />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ALL_MODULES.map(module => {
                                const label = MODULE_LABELS[module];
                                return (
                                    <tr key={module} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 sticky left-0 bg-white">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{label?.mn || module}</p>
                                                <p className="text-[11px] text-gray-400">{module}</p>
                                            </div>
                                        </td>
                                        {roles.map(role => {
                                            const hasModule = role.role_permissions.some(rp => rp.module === module);
                                            const isSaving = saving === role.id;
                                            return (
                                                <td key={role.id} className="text-center px-3 py-3">
                                                    <button
                                                        onClick={() => toggleModule(role.id, module)}
                                                        disabled={isSaving}
                                                        className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                            hasModule
                                                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                                                : 'bg-white border-gray-200 text-gray-300 hover:border-gray-400'
                                                        } ${isSaving ? 'opacity-50' : ''}`}
                                                    >
                                                        {isSaving ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : hasModule ? (
                                                            <Check className="w-4 h-4" />
                                                        ) : null}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                            {/* Divider */}
                            <tr className="bg-gray-50">
                                <td className="px-4 py-2 text-xs font-bold text-gray-500 uppercase sticky left-0 bg-gray-50">
                                    Эрхүүд
                                </td>
                                {roles.map(role => (
                                    <td key={role.id} className="px-3 py-2" />
                                ))}
                            </tr>
                            {/* canWrite */}
                            <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3 sticky left-0 bg-white">
                                    <p className="text-sm font-medium text-gray-900">Бичих эрх</p>
                                    <p className="text-[11px] text-gray-400">canWrite</p>
                                </td>
                                {roles.map(role => (
                                    <td key={role.id} className="text-center px-3 py-3">
                                        <button
                                            onClick={() => updateRoleField(role.id, 'can_write', !role.can_write)}
                                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                role.can_write
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'bg-white border-gray-200 text-gray-300 hover:border-gray-400'
                                            }`}
                                        >
                                            {role.can_write && <Check className="w-4 h-4" />}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                            {/* canDelete */}
                            <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3 sticky left-0 bg-white">
                                    <p className="text-sm font-medium text-gray-900">Устгах эрх</p>
                                    <p className="text-[11px] text-gray-400">canDelete</p>
                                </td>
                                {roles.map(role => (
                                    <td key={role.id} className="text-center px-3 py-3">
                                        <button
                                            onClick={() => updateRoleField(role.id, 'can_delete', !role.can_delete)}
                                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                role.can_delete
                                                    ? 'bg-red-500 border-red-500 text-white'
                                                    : 'bg-white border-gray-200 text-gray-300 hover:border-gray-400'
                                            }`}
                                        >
                                            {role.can_delete && <Check className="w-4 h-4" />}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                            {/* canAccessAdmin */}
                            <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3 sticky left-0 bg-white">
                                    <p className="text-sm font-medium text-gray-900">Admin хандалт</p>
                                    <p className="text-[11px] text-gray-400">canAccessAdmin</p>
                                </td>
                                {roles.map(role => (
                                    <td key={role.id} className="text-center px-3 py-3">
                                        <button
                                            onClick={() => updateRoleField(role.id, 'can_access_admin', !role.can_access_admin)}
                                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                role.can_access_admin
                                                    ? 'bg-violet-500 border-violet-500 text-white'
                                                    : 'bg-white border-gray-200 text-gray-300 hover:border-gray-400'
                                            }`}
                                        >
                                            {role.can_access_admin && <Check className="w-4 h-4" />}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                            {/* Delete row */}
                            <tr className="bg-gray-50">
                                <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase sticky left-0 bg-gray-50">
                                    Үйлдэл
                                </td>
                                {roles.map(role => (
                                    <td key={role.id} className="text-center px-3 py-3">
                                        {role.is_system ? (
                                            <span className="text-xs text-gray-400">Системийн</span>
                                        ) : (
                                            <button
                                                onClick={() => deleteRole(role.id)}
                                                disabled={saving === role.id}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Role Dialog */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-xl">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-gray-900">Шинэ дүр үүсгэх</h2>
                            <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Код (English)</label>
                                    <input
                                        type="text"
                                        value={newRole.name}
                                        onChange={e => setNewRole(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="sales_agent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Нэр (English)</label>
                                    <input
                                        type="text"
                                        value={newRole.display_name}
                                        onChange={e => setNewRole(p => ({ ...p, display_name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="Sales Agent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Нэр (Монгол)</label>
                                    <input
                                        type="text"
                                        value={newRole.display_name_mn}
                                        onChange={e => setNewRole(p => ({ ...p, display_name_mn: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="Борлуулалтын ажилтан"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Тайлбар</label>
                                    <input
                                        type="text"
                                        value={newRole.description}
                                        onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="Хандалтын тайлбар"
                                    />
                                </div>
                            </div>

                            {/* Module selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Module зөвшөөрөл</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {ALL_MODULES.map(module => {
                                        const label = MODULE_LABELS[module];
                                        const checked = newRole.modules.includes(module);
                                        return (
                                            <button
                                                key={module}
                                                type="button"
                                                onClick={() => {
                                                    setNewRole(p => ({
                                                        ...p,
                                                        modules: checked
                                                            ? p.modules.filter(m => m !== module)
                                                            : [...p.modules, module]
                                                    }));
                                                }}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                                                    checked
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                                                }`}
                                            >
                                                {label?.mn || module}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Permissions toggles */}
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newRole.can_write}
                                        onChange={e => setNewRole(p => ({ ...p, can_write: e.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    <span className="text-sm text-gray-700">Бичих</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newRole.can_delete}
                                        onChange={e => setNewRole(p => ({ ...p, can_delete: e.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-sm text-gray-700">Устгах</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newRole.can_access_admin}
                                        onChange={e => setNewRole(p => ({ ...p, can_access_admin: e.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    <span className="text-sm text-gray-700">Admin хандалт</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Цуцлах
                            </button>
                            <button
                                onClick={createRole}
                                disabled={saving === 'new'}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                            >
                                {saving === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Үүсгэх
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
