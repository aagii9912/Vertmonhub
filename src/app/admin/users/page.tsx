'use client';

import { useState, useEffect } from 'react';
import { Shield, ChevronDown, Search, UserPlus, Check, X, Loader2, Eye, EyeOff, AlertCircle, Trash2 } from 'lucide-react';

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
    admin: 'bg-status-danger-soft text-status-danger',
    sales_manager: 'bg-status-info-soft text-status-info',
    marketing: 'bg-brand-soft text-brand-strong',
    viewer: 'bg-surface-2 text-foreground',
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserWithRole[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<UserWithRole | null>(null);
    const [deleting, setDeleting] = useState(false);

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
                    color: ROLE_COLORS[r.name] || 'bg-surface-2 text-foreground',
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

    async function deleteUser(user: UserWithRole) {
        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/users?userId=${user.id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (res.ok) {
                setUsers(prev => prev.filter(u => u.id !== user.id));
                setDeleteConfirm(null);
                setCreateSuccess(data.message || 'Хэрэглэгч устгагдлаа');
                setTimeout(() => setCreateSuccess(null), 4000);
            } else {
                alert(data.error || 'Устгах үед алдаа гарлаа');
            }
        } catch {
            alert('Сүлжээний алдаа');
        } finally {
            setDeleting(false);
        }
    }

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const getRoleBadge = (role: string) => {
        const r = roles.find(r => r.value === role);
        return r || { value: role, label: role, color: 'bg-surface-2 text-foreground' };
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Хэрэглэгчид & Дүрүүд</h1>
                    <p className="text-muted-foreground text-sm mt-1">Ажилчдын бүртгэл болон эрх удирдах</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <input
                            type="text"
                            placeholder="Хайх..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-border-strong rounded-lg text-sm w-64 focus:ring-2 focus:ring-brand focus:border-brand"
                        />
                    </div>
                    <button
                        onClick={() => { setShowCreate(true); setCreateError(null); }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl font-medium hover:bg-brand-strong transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Хэрэглэгч нэмэх
                    </button>
                </div>
            </div>

            {/* Success Alert */}
            {createSuccess && (
                <div className="mb-4 p-4 bg-status-success-soft border border-status-success/30 rounded-xl text-status-success flex items-center gap-2">
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
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-surface-2/40 border-b border-border">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Хэрэглэгч</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Дүр</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Бүртгэгдсэн</th>
                            <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Үйлдэл</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Уншиж байна...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                    Хэрэглэгч олдсонгүй
                                </td>
                            </tr>
                        ) : (
                            filtered.map(user => {
                                const badge = getRoleBadge(user.role);
                                const isEditing = editingId === user.id;

                                return (
                                    <tr key={user.id} className="hover:bg-surface-2/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-sm font-bold text-brand-strong">
                                                    {(user.full_name?.[0] || user.email[0]).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{user.full_name || 'Нэргүй'}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
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
                                                        className="px-3 py-1.5 text-sm border border-brand/40 rounded-lg bg-surface focus:ring-2 focus:ring-brand"
                                                    >
                                                        {roles.map(r => (
                                                            <option key={r.value} value={r.value}>{r.label}</option>
                                                        ))}
                                                    </select>
                                                    {saving && <Loader2 className="w-4 h-4 animate-spin text-brand-strong" />}
                                                    <button onClick={() => setEditingId(null)} className="p-1 hover:bg-surface-2 rounded">
                                                        <X className="w-4 h-4 text-muted-foreground/70" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                                                    {badge.label}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            {new Date(user.created_at).toLocaleDateString('mn-MN')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!isEditing && (
                                                    <button
                                                        onClick={() => setEditingId(user.id)}
                                                        className="px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-soft rounded-lg transition-colors"
                                                    >
                                                        Дүр солих
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setDeleteConfirm(user)}
                                                    className="p-1.5 text-muted-foreground/70 hover:text-status-danger hover:bg-status-danger-soft rounded-lg transition-colors"
                                                    title="Устгах"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
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
                    <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-brand-strong" />
                                <h2 className="text-lg font-bold text-foreground">Хэрэглэгч нэмэх</h2>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-surface-2 rounded-xl">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {createError && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {createError}
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Нэр</label>
                                <input
                                    type="text"
                                    value={newUser.full_name}
                                    onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="Нэр оруулах"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Имэйл <span className="text-status-danger">*</span></label>
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="email@example.com"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Нууц үг <span className="text-status-danger">*</span></label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newUser.password}
                                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm pr-10 focus:ring-2 focus:ring-brand focus:border-brand"
                                        placeholder="Хамгийн багадаа 8 тэмдэгт"
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(p => !p)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground/70 mt-1">Хамгийн багадаа 8 тэмдэгт</p>
                            </div>

                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">Дүр (role) сонгох</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {roles.map(r => (
                                        <button
                                            key={r.value}
                                            type="button"
                                            onClick={() => setNewUser(p => ({ ...p, role: r.value }))}
                                            className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition-all text-left ${
                                                newUser.role === r.value
                                                    ? 'border-brand bg-brand-soft text-brand-strong'
                                                    : 'border-border bg-surface text-muted-foreground hover:border-border'
                                            }`}
                                        >
                                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${r.color.split(' ')[0]}`} />
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground/70 mt-2">
                                    Дүр нь module хандалтыг тодорхойлно. Дүр удирдлагыг "Дүрүүд" хуудсаас хийнэ.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-border/60">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2.5 text-sm text-foreground bg-surface-2 rounded-lg hover:bg-surface-3"
                            >
                                Цуцлах
                            </button>
                            <button
                                onClick={createUser}
                                disabled={creating || !newUser.email || !newUser.password}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-brand text-white rounded-lg hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Үүсгэх
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-status-danger-soft rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-6 h-6 text-status-danger" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-2">Хэрэглэгч устгах</h3>
                            <p className="text-sm text-muted-foreground mb-1">
                                <span className="font-medium text-foreground">{deleteConfirm.full_name || deleteConfirm.email}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                                ({deleteConfirm.email}) хэрэглэгчийг устгахдаа итгэлтэй байна уу?
                            </p>
                            <p className="text-xs text-status-danger mt-2">Энэ үйлдлийг буцаах боломжгүй!</p>
                        </div>
                        <div className="flex gap-3 p-4 border-t border-border/60">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="flex-1 px-4 py-2.5 text-sm text-foreground bg-surface-2 rounded-lg hover:bg-surface-3 disabled:opacity-50"
                            >
                                Цуцлах
                            </button>
                            <button
                                onClick={() => deleteUser(deleteConfirm)}
                                disabled={deleting}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-status-danger text-white rounded-lg hover:bg-status-danger disabled:opacity-50 font-medium"
                            >
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Устгах
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
