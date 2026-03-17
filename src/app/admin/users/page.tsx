'use client';

import { useState, useEffect } from 'react';
import { Shield, ChevronDown, Search, UserPlus, Check, X, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface UserWithRole {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    created_at: string;
}

interface RoleOption {
    value: string;
    label: string;
    color: string;
}

const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    sales_manager: 'bg-blue-100 text-blue-700',
    marketing: 'bg-purple-100 text-purple-700',
    viewer: 'bg-gray-100 text-gray-700',
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserWithRole[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Create user modal
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [newUser, setNewUser] = useState({
        email: '',
        password: '',
        full_name: '',
        role: 'viewer',
    });

    useEffect(() => {
        Promise.all([fetchUsers(), fetchRoles()]).finally(() => setLoading(false));
    }, []);

    async function fetchRoles() {
        try {
            const res = await fetch('/api/admin/roles');
            const data = await res.json();
            if (data.roles) {
                setRoles(data.roles.map((r: any) => ({
                    value: r.name,
                    label: r.display_name_mn,
                    color: ROLE_COLORS[r.name] || 'bg-gray-100 text-gray-700',
                })));
            }
        } catch (e) {
            console.error('Failed to fetch roles:', e);
        }
    }

    async function fetchUsers() {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            setUsers(data.users || []);
        } catch (e) {
            console.error('Failed to fetch users:', e);
        }
    }

    async function updateRole(userId: string, role: string) {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
                setEditingId(null);
            }
        } catch (e) {
            console.error('Failed to update role:', e);
        } finally {
            setSaving(false);
        }
    }

    async function createUser() {
        if (!newUser.email || !newUser.password) {
            setCreateError('Имэйл болон нууц үг оруулна уу');
            return;
        }
        if (newUser.password.length < 8) {
            setCreateError('Нууц үг хамгийн багадаа 8 тэмдэгт');
            return;
        }

        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });
            const data = await res.json();

            if (res.ok) {
                setUsers(prev => [...prev, data.user]);
                setShowCreate(false);
                setNewUser({ email: '', password: '', full_name: '', role: 'viewer' });
                setCreateSuccess('Хэрэглэгч амжилттай үүсгэлээ');
                setTimeout(() => setCreateSuccess(null), 4000);
            } else {
                setCreateError(data.error || 'Алдаа гарлаа');
            }
        } catch {
            setCreateError('Сүлжээний алдаа');
        } finally {
            setCreating(false);
        }
    }

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const getRoleBadge = (role: string) => {
        const r = roles.find(r => r.value === role);
        return r || { value: role, label: role, color: 'bg-gray-100 text-gray-700' };
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Хэрэглэгчид & Дүрүүд</h1>
                    <p className="text-gray-500 text-sm mt-1">Ажилчдын бүртгэл болон эрх удирдах</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Хайх..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                    </div>
                    <button
                        onClick={() => { setShowCreate(true); setCreateError(null); }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Хэрэглэгч нэмэх
                    </button>
                </div>
            </div>

            {/* Success Alert */}
            {createSuccess && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2">
                    <Check className="w-5 h-5" />{createSuccess}
                </div>
            )}

            {/* Role Legend */}
            <div className="flex flex-wrap gap-2 mb-6">
                {roles.map(r => (
                    <span key={r.value} className={`px-3 py-1 rounded-full text-xs font-medium ${r.color}`}>
                        {r.label}
                    </span>
                ))}
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Хэрэглэгч</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Дүр</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Бүртгэгдсэн</th>
                            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Үйлдэл</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Уншиж байна...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    Хэрэглэгч олдсонгүй
                                </td>
                            </tr>
                        ) : (
                            filtered.map(user => {
                                const badge = getRoleBadge(user.role);
                                const isEditing = editingId === user.id;

                                return (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-700">
                                                    {(user.full_name?.[0] || user.email[0]).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{user.full_name || 'Нэргүй'}</p>
                                                    <p className="text-xs text-gray-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {isEditing ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        defaultValue={user.role}
                                                        onChange={e => updateRole(user.id, e.target.value)}
                                                        disabled={saving}
                                                        className="px-3 py-1.5 text-sm border border-violet-300 rounded-lg bg-white focus:ring-2 focus:ring-violet-500"
                                                    >
                                                        {roles.map(r => (
                                                            <option key={r.value} value={r.value}>{r.label}</option>
                                                        ))}
                                                    </select>
                                                    {saving && <Loader2 className="w-4 h-4 animate-spin text-violet-600" />}
                                                    <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded">
                                                        <X className="w-4 h-4 text-gray-400" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                                                    {badge.label}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(user.created_at).toLocaleDateString('mn-MN')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {!isEditing && (
                                                <button
                                                    onClick={() => setEditingId(user.id)}
                                                    className="px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                >
                                                    Дүр солих
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create User Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-violet-600" />
                                <h2 className="text-lg font-bold text-gray-900">Хэрэглэгч нэмэх</h2>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {createError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {createError}
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Нэр</label>
                                <input
                                    type="text"
                                    value={newUser.full_name}
                                    onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                    placeholder="Нэр оруулах"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Имэйл <span className="text-red-500">*</span></label>
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                    placeholder="email@example.com"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Нууц үг <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newUser.password}
                                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm pr-10 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                        placeholder="Хамгийн багадаа 8 тэмдэгт"
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(p => !p)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Хамгийн багадаа 8 тэмдэгт</p>
                            </div>

                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Дүр (role) сонгох</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {roles.map(r => (
                                        <button
                                            key={r.value}
                                            type="button"
                                            onClick={() => setNewUser(p => ({ ...p, role: r.value }))}
                                            className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition-all text-left ${
                                                newUser.role === r.value
                                                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                                            }`}
                                        >
                                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${r.color.split(' ')[0]}`} />
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    Дүр нь module хандалтыг тодорхойлно. Дүр удирдлагыг "Дүрүүд" хуудсаас хийнэ.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Цуцлах
                            </button>
                            <button
                                onClick={createUser}
                                disabled={creating || !newUser.email || !newUser.password}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Үүсгэх
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
