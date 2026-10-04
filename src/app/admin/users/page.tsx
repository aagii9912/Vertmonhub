'use client';

import { useState, useEffect } from 'react';
import { Shield, Search, UserPlus, Check, X, Loader2, Eye, EyeOff, AlertCircle, Trash2, Link as LinkIcon, Copy, Mail, KeyRound, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog';
import { MANAGER_NAME_REQUIRED, STAFF_PHONE_ERROR, formatStaffPhone, managerNameMissing, parseStaffPhone } from '@/lib/admin/staff-profile';

interface UserWithRole {
    id: string;
    email: string;
    full_name: string | null;
    phone?: string | null;
    role: string;
    created_at: string;
    email_confirmed?: boolean;
    last_sign_in_at?: string | null;
    shops?: Array<{ id: string; name: string; is_owner: boolean }>;
    manager_shops?: Array<{ shop_id: string; name: string }>;
}

interface RoleOption {
    value: string;
    label: string;
    color: string;
}

interface ShopOption {
    id: string;
    name: string;
}

const ROLE_COLORS: Record<string, string> = {
    super_admin: 'bg-status-pending-soft text-status-pending',
    admin: 'bg-status-danger-soft text-status-danger',
    sales_manager: 'bg-status-info-soft text-status-info',
    marketing: 'bg-brand-soft text-brand-strong',
    viewer: 'bg-surface-2 text-foreground',
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserWithRole[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [shops, setShops] = useState<ShopOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [roleError, setRoleError] = useState<string | null>(null);
    const [shopError, setShopError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [actorId, setActorId] = useState<string | null>(null);
    const [roleChange, setRoleChange] = useState<{ user: UserWithRole; role: string; shop_id: string } | null>(null);
    const [projectEdit, setProjectEdit] = useState<{ user: UserWithRole; shopIds: string[] } | null>(null);
    const [profileEdit, setProfileEdit] = useState<{ user: UserWithRole; full_name: string; phone: string } | null>(null);
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
        phone: '',
        role: 'viewer',
        shop_id: '',
    });

    // Password reset modal
    const [pwUser, setPwUser] = useState<UserWithRole | null>(null);
    const [pwValue, setPwValue] = useState('');
    const [pwShow, setPwShow] = useState(false);
    const [pwSaving, setPwSaving] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    // Invite link modal
    const [showInvite, setShowInvite] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', phone: '', role: 'sales_manager', shop_id: '' });
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteResult, setInviteResult] = useState<{ link: string; mode: string; emailed: boolean } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        Promise.all([fetchUsers(), fetchRoles(), fetchShops()]).finally(() => setLoading(false));
    }, []);

    async function fetchShops() {
        try {
            const res = await fetch('/api/admin/shops');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Төслүүд ачаалагдсангүй');
            const list: ShopOption[] = data.shops || [];
            setShops(list);
            setShopError(null);
            // Ганц төсөл (shop) байвал автоматаар сонгож тавьна
            if (list.length === 1) {
                setNewUser(p => ({ ...p, shop_id: list[0].id }));
                setInviteForm(p => ({ ...p, shop_id: list[0].id }));
            }
        } catch (e) {
            setShopError(e instanceof Error ? e.message : 'Төслүүд ачаалагдсангүй');
        }
    }

    async function fetchRoles() {
        try {
            const res = await fetch('/api/admin/roles');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Дүрүүд ачаалагдсангүй');
            const options: RoleOption[] = (data.roles || []).map((r: { name: string; display_name_mn: string }) => ({
                value: r.name,
                label: r.display_name_mn,
                color: ROLE_COLORS[r.name] || 'bg-surface-2 text-foreground',
            }));
            // Сервер super_admin-ийн missing-row fallback-ийг зөвшөөрдөг.
            // Дүр хүснэгтэд байхгүй орчинд ч эрхийг өөр хүнд олгох боломжтой.
            if (!options.some(role => role.value === 'super_admin')) options.unshift({
                value: 'super_admin', label: 'Super Admin', color: ROLE_COLORS.super_admin,
            });
            setRoles(options);
            const safeDefault = options.find(role => role.value !== 'super_admin')?.value || '';
            setNewUser(form => ({ ...form, role: options.some(role => role.value === form.role) ? form.role : safeDefault }));
            setInviteForm(form => ({ ...form, role: options.some(role => role.value === form.role) ? form.role : safeDefault }));
            setRoleError(null);
        } catch (e) {
            setRoleError(e instanceof Error ? e.message : 'Дүрүүд ачаалагдсангүй');
        }
    }

    async function fetchUsers() {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Хэрэглэгчдийн жагсаалт ачаалагдсангүй');
            setUsers(data.users || []);
            setActorId(data.actor_id || null);
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Хэрэглэгчдийн жагсаалт ачаалагдсангүй');
        }
    }

    async function updateRole() {
        if (!roleChange) return;
        const { user, role, shop_id } = roleChange;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, role, ...(role === 'sales_manager' ? { shop_id } : {}) }),
            });
            if (res.ok) {
                await fetchUsers();
                setRoleChange(null);
                toast.success('Дүр шинэчлэгдлээ');
            } else {
                const data = await res.json();
                toast.error(data.error || 'Дүр шинэчлэгдсэнгүй');
            }
        } catch (e) {
            toast.error('Дүр шинэчлэхэд сүлжээний алдаа гарлаа');
        } finally {
            setSaving(false);
        }
    }

    function openRoleChange(user: UserWithRole, role = user.role) {
        setRoleChange({ user, role, shop_id: user.shops?.length === 1 ? user.shops[0].id : shops.length === 1 ? shops[0].id : '' });
    }

    /** Shop = төсөл: ажилтны хандах төслүүдийг нэг дор тохируулна. */
    async function saveProjects() {
        if (!projectEdit) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/users/projects', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: projectEdit.user.id, shopIds: projectEdit.shopIds }),
            });
            const data = await res.json().catch(() => ({}));
            await fetchUsers();
            if (!res.ok) { toast.error(data.error || 'Төслийн эрх хадгалагдсангүй'); return; }
            setProjectEdit(null);
            toast.success('Төслийн эрх шинэчлэгдлээ');
        } catch {
            toast.error('Төслийн эрх хадгалахад сүлжээний алдаа гарлаа');
        } finally {
            setSaving(false);
        }
    }

    /** Нэр, утас засах. Идэвхтэй менежерийн нэрийг сервер 409-өөр хамгаална. */
    async function saveProfile() {
        if (!profileEdit) return;
        const { user, full_name, phone } = profileEdit;
        const nameLocked = Boolean(user.manager_shops?.length);
        setSaving(true);
        try {
            const res = await fetch('/api/admin/users/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, ...(nameLocked ? {} : { full_name }), phone: parseStaffPhone(phone) || null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data.error || 'Профайл хадгалагдсангүй'); return; }
            await fetchUsers();
            setProfileEdit(null);
            toast.success('Профайл шинэчлэгдлээ');
        } catch {
            toast.error('Профайл хадгалахад сүлжээний алдаа гарлаа');
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
        if (managerNameMissing(newUser.role, newUser.full_name, newUser.email)) {
            setCreateError(MANAGER_NAME_REQUIRED);
            return;
        }
        const phone = parseStaffPhone(newUser.phone);
        if (phone === false) {
            setCreateError(STAFF_PHONE_ERROR);
            return;
        }

        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newUser, phone: phone || undefined }),
            });
            const data = await res.json();

            if (res.ok) {
                await fetchUsers();
                setShowCreate(false);
                setNewUser({ email: '', password: '', full_name: '', phone: '', role: 'viewer', shop_id: shops.length === 1 ? shops[0].id : '' });
                const verifyNote = data.login_verified ? ' Нэвтрэлт шалгагдлаа ✓' : '';
                setCreateSuccess(
                    data.warning
                        ? `Хэрэглэгч үүслээ (анхааруулга: ${data.warning})`
                        : `Хэрэглэгч амжилттай үүсгэлээ.${verifyNote}`,
                );
                setTimeout(() => setCreateSuccess(null), 8000);
            } else {
                setCreateError(data.error || 'Алдаа гарлаа');
            }
        } catch {
            setCreateError('Сүлжээний алдаа');
        } finally {
            setCreating(false);
        }
    }

    async function sendInvite() {
        if (!inviteForm.email) {
            setInviteError('Имэйл оруулна уу');
            return;
        }
        if (!shops.some(shop => shop.id === inviteForm.shop_id)) {
            setInviteError('Төсөл сонгоно уу');
            return;
        }
        if (managerNameMissing(inviteForm.role, inviteForm.full_name, inviteForm.email)) {
            setInviteError(MANAGER_NAME_REQUIRED);
            return;
        }
        const phone = parseStaffPhone(inviteForm.phone);
        if (phone === false) {
            setInviteError(STAFF_PHONE_ERROR);
            return;
        }
        setInviting(true);
        setInviteError(null);
        setInviteResult(null);
        try {
            const res = await fetch('/api/admin/users/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...inviteForm, phone: phone || undefined }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setInviteResult({ link: data.action_link || '', mode: data.mode, emailed: !!data.emailed });
                fetchUsers();
            } else {
                setInviteError(data.error || 'Холбоос үүсгэхэд алдаа гарлаа');
            }
        } catch {
            setInviteError('Сүлжээний алдаа');
        } finally {
            setInviting(false);
        }
    }

    async function copyInviteLink() {
        if (!inviteResult?.link) return;
        try {
            await navigator.clipboard.writeText(inviteResult.link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard блоклогдсон бол input-ыг сонгох
        }
    }

    async function resetPassword() {
        if (!pwUser) return;
        if (pwValue.length < 8) {
            setPwError('Нууц үг хамгийн багадаа 8 тэмдэгт');
            return;
        }
        setPwSaving(true);
        setPwError(null);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: pwUser.id, password: pwValue }),
            });
            const data = await res.json();
            if (res.ok) {
                setPwUser(null);
                setPwValue('');
                setCreateSuccess(
                    data.warning
                        ? `Нууц үг шинэчлэгдлээ (анхааруулга: ${data.warning})`
                        : 'Нууц үг шинэчлэгдлээ. Нэвтрэлт шалгагдлаа ✓',
                );
                setTimeout(() => setCreateSuccess(null), 8000);
            } else {
                setPwError(data.error || 'Алдаа гарлаа');
            }
        } catch {
            setPwError('Сүлжээний алдаа');
        } finally {
            setPwSaving(false);
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
                toast.error(data.error || 'Устгах үед алдаа гарлаа');
            }
        } catch {
            toast.error('Сүлжээний алдаа');
        } finally {
            setDeleting(false);
        }
    }

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase())
    );

    // Шууд шалгалт: менежерт бодит нэр, утас 8 оронтой (заавал биш).
    const newPhoneInvalid = parseStaffPhone(newUser.phone) === false;
    const newNameMissing = managerNameMissing(newUser.role, newUser.full_name, newUser.email);
    const invitePhoneInvalid = parseStaffPhone(inviteForm.phone) === false;
    const inviteNameMissing = managerNameMissing(inviteForm.role, inviteForm.full_name, inviteForm.email);
    const profilePhoneInvalid = profileEdit ? parseStaffPhone(profileEdit.phone) === false : false;
    const profileNameLocked = Boolean(profileEdit?.user.manager_shops?.length);
    const profileNameInvalid = profileEdit && !profileNameLocked
        ? !profileEdit.full_name.trim() || managerNameMissing(profileEdit.user.role, profileEdit.full_name, profileEdit.user.email)
        : false;

    const getRoleBadge = (role: string) => {
        const r = roles.find(r => r.value === role);
        return r || { value: role, label: role, color: 'bg-surface-2 text-foreground' };
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Хэрэглэгчид & Дүрүүд</h1>
                    <p className="text-muted-foreground text-sm mt-1">Ажилтны бүртгэл, төслийн хандалт болон Super Admin эрх удирдах</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <input
                            type="text"
                            aria-label="Хэрэглэгч хайх"
                            placeholder="Хайх..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-border-strong rounded-lg text-sm w-full sm:w-64 focus:ring-2 focus:ring-brand focus:border-brand"
                        />
                    </div>
                    <button
                        onClick={() => { setShowInvite(true); setInviteError(null); setInviteResult(null); }}
                        disabled={!!roleError || !!shopError || roles.length === 0 || shops.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-surface-2 text-foreground border border-border rounded-xl font-medium hover:bg-surface-3 transition-colors disabled:opacity-50"
                    >
                        <LinkIcon className="w-4 h-4" />
                        Урих холбоос
                    </button>
                    <button
                        onClick={() => { setShowCreate(true); setCreateError(null); }}
                        disabled={!!roleError || !!shopError || roles.length === 0 || shops.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-brand text-brand-fg rounded-xl font-medium hover:bg-brand-strong transition-colors disabled:opacity-50"
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
            {loadError && <div role="alert" className="mb-4 rounded-lg border border-status-danger/30 bg-status-danger-soft p-3 text-sm text-status-danger">{loadError} <button onClick={fetchUsers} className="ml-2 font-semibold underline">Дахин ачаалах</button></div>}
            {roleError && <div role="alert" className="mb-4 rounded-lg border border-status-danger/30 bg-status-danger-soft p-3 text-sm text-status-danger">{roleError} <button onClick={fetchRoles} className="ml-2 font-semibold underline">Дахин ачаалах</button></div>}
            {shopError && <div role="alert" className="mb-4 rounded-lg border border-status-danger/30 bg-status-danger-soft p-3 text-sm text-status-danger">{shopError} <button onClick={fetchShops} className="ml-2 font-semibold underline">Дахин ачаалах</button></div>}
            {!shopError && !roleError && !loading && (shops.length === 0 || roles.length === 0) && <div role="status" className="mb-4 rounded-lg border border-status-pending/30 bg-status-pending-soft p-3 text-sm text-status-pending">Хэрэглэгч нэмэхийн өмнө төсөл болон дүрийг тохируулна уу.</div>}

            {/* Role Legend */}
            <div className="flex flex-wrap gap-2 mb-6">
                {roles.map(r => (
                    <span key={r.value} className={`px-3 py-1 rounded-full text-xs font-medium ${r.color}`}>
                        {r.label}
                    </span>
                ))}
            </div>

            {/* Users Table */}
            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
                <table className="min-w-[1100px] w-full">
                    <thead className="bg-surface-2/40 border-b border-border">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Хэрэглэгч</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Дүр</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Төсөл / төлөв</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Бүртгэгдсэн</th>
                            <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Үйлдэл</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Уншиж байна...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                    Хэрэглэгч олдсонгүй
                                </td>
                            </tr>
                        ) : (
                            filtered.map(user => {
                                const badge = getRoleBadge(user.role);
                                const isSelf = actorId === user.id;
                                const ownsShop = user.shops?.some(shop => shop.is_owner);

                                return (
                                    <tr key={user.id} className="hover:bg-surface-2/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-sm font-bold text-brand-strong">
                                                    {(user.full_name?.[0] || user.email[0]).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{user.full_name || 'Нэргүй'}{isSelf && <span className="ml-2 text-xs text-muted-foreground">(Та)</span>}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                    {user.phone && <p className="num text-xs text-muted-foreground">{formatStaffPhone(user.phone)}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-muted-foreground">
                                            <p>{user.shops?.map(shop => `${shop.name}${shop.is_owner ? ' (эзэмшигч)' : ''}`).join(', ') || (user.role === 'super_admin' ? 'Админ хэсэгт бүх төсөл' : 'Төслийн хандалтгүй')}</p>
                                            <p className="mt-1">{user.last_sign_in_at ? 'Нэвтэрсэн' : user.email_confirmed ? 'Имэйл баталгаажсан · нэвтрээгүй' : 'Урилга / имэйл баталгаажаагүй'}</p>
                                            {user.role === 'sales_manager' && !user.manager_shops?.length && <p className="mt-1 text-status-pending">Идэвхтэй менежерийн холбоосгүй</p>}
                                            {user.role === 'sales_manager' && user.shops?.some(shop => !user.manager_shops?.some(link => link.shop_id === shop.id)) && <p className="mt-1 text-status-pending">Зарим төсөлд менежерээр бүртгэгдээгүй</p>}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            {new Date(user.created_at).toLocaleDateString('mn-MN')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {user.role !== 'super_admin' && !isSelf && (
                                                    <button onClick={() => openRoleChange(user, 'super_admin')} disabled={saving || !!roleError}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-status-pending hover:bg-status-pending-soft rounded-lg disabled:opacity-50">
                                                        <Shield className="w-3.5 h-3.5" />Super Admin эрх өгөх
                                                    </button>
                                                )}
                                                    <button
                                                        onClick={() => setProjectEdit({ user, shopIds: (user.shops || []).map(shop => shop.id) })}
                                                        disabled={saving || !!shopError || shops.length === 0}
                                                        className="px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-soft rounded-lg transition-colors disabled:opacity-50"
                                                        aria-label={`${user.full_name || user.email}: төслүүд`}
                                                    >
                                                        Төслүүд
                                                    </button>
                                                    <button
                                                        onClick={() => setProfileEdit({ user, full_name: user.full_name || '', phone: formatStaffPhone(user.phone) })}
                                                        disabled={saving}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-soft rounded-lg transition-colors disabled:opacity-50"
                                                        aria-label={`${user.full_name || user.email}: профайл засах`}
                                                        title="Нэр, утас засах"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />Засах
                                                    </button>
                                                    <button
                                                        onClick={() => openRoleChange(user)}
                                                        disabled={isSelf || saving || !!roleError || roles.length === 0}
                                                        title={isSelf ? 'Өөрийн дүрийг өөрчлөх боломжгүй' : 'Дүр солих'}
                                                        className="px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-soft rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        Дүр солих
                                                    </button>
                                                <button
                                                    onClick={() => { setPwUser(user); setPwValue(''); setPwError(null); setPwShow(false); }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-lg transition-colors"
                                                    title="Нууц үг тавих / шинэчлэх"
                                                >
                                                    <KeyRound className="w-3.5 h-3.5" />
                                                    Нууц үг
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(user)}
                                                    disabled={isSelf || ownsShop}
                                                    className="p-1.5 text-muted-foreground/70 hover:text-status-danger hover:bg-status-danger-soft rounded-lg transition-colors disabled:opacity-40"
                                                    title={isSelf ? 'Өөрийгөө устгах боломжгүй' : ownsShop ? 'Эзэмшлийг шилжүүлсний дараа устгана' : 'Устгах'}
                                                    aria-label={`${user.full_name || user.email} хэрэглэгчийг устгах`}
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

            {roleChange && (
                <Dialog open onOpenChange={open => { if (!open && !saving) setRoleChange(null); }}>
                    <DialogContent className="max-w-md">
                        <DialogTitle>Хэрэглэгчийн эрх өөрчлөх</DialogTitle>
                        <DialogDescription>{roleChange.user.full_name || roleChange.user.email} ({roleChange.user.email})</DialogDescription>
                        <label htmlFor="admin-user-role" className="text-sm font-medium">Шинэ дүр</label>
                        <select id="admin-user-role" value={roleChange.role} disabled={saving}
                            onChange={event => setRoleChange({ ...roleChange, role: event.target.value })}
                            className="rounded-lg border border-border bg-surface p-2.5 text-sm">
                            <option value="">Дүр сонгох</option>
                            {roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                        {roleChange.role === 'super_admin' && <p role="status" className="rounded-lg bg-status-pending-soft p-3 text-sm text-status-pending">
                            Энэ хүн бүх төслийн админ хэсэгт нэвтэрч, хүн нэмэх, эрх өөрчлөх, төсөл болон тохиргоо удирдах бүрэн эрхтэй болно.
                            Таны Super Admin эрх хадгалагдана.
                        </p>}
                        {roleChange.role === 'sales_manager' && <>
                            <label htmlFor="admin-user-role-shop" className="text-sm font-medium">Менежерийн төсөл</label>
                            <select id="admin-user-role-shop" value={roleChange.shop_id} disabled={saving || !!shopError}
                                onChange={event => setRoleChange({ ...roleChange, shop_id: event.target.value })}
                                className="rounded-lg border border-border bg-surface p-2.5 text-sm">
                                <option value="">Төсөл сонгох</option>
                                {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                            </select>
                            <p className="text-xs text-muted-foreground">Профайлын нэрээр идэвхтэй борлуулалтын менежер холбож, төслийн хандалт олгоно.
                                Менежерийн холбоосыг <a href="/admin/sales-targets" className="ml-1 text-brand-strong underline">Борлуулалтын төлөвлөгөө</a> хэсэгт шалгана.</p>
                        </>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRoleChange(null)} disabled={saving} className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm">Цуцлах</button>
                            <button onClick={updateRole} disabled={saving || !!roleError || !roles.some(role => role.value === roleChange.role) || (roleChange.role === 'sales_manager' && (!roleChange.shop_id || !!shopError))}
                                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50">
                                {saving ? 'Хадгалж байна...' : roleChange.role === 'super_admin' ? 'Super Admin эрх олгох' : 'Эрх хадгалах'}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {projectEdit && (
                <Dialog open onOpenChange={open => { if (!open && !saving) setProjectEdit(null); }}>
                    <DialogContent className="max-w-md">
                        <DialogTitle>Төслийн хандалт</DialogTitle>
                        <DialogDescription>{projectEdit.user.full_name || projectEdit.user.email} — аль төсөлд ажиллахыг сонгоно уу.</DialogDescription>
                        <fieldset disabled={saving} className="space-y-1">
                            <legend className="sr-only">Төслүүд</legend>
                            {shops.map(shop => {
                                const owner = projectEdit.user.shops?.some(item => item.id === shop.id && item.is_owner);
                                const checked = projectEdit.shopIds.includes(shop.id);
                                return <label key={shop.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-2">
                                    <input type="checkbox" checked={checked} disabled={owner || (projectEdit.user.id === actorId && checked)}
                                        onChange={event => setProjectEdit({ ...projectEdit, shopIds: event.target.checked
                                            ? [...projectEdit.shopIds, shop.id] : projectEdit.shopIds.filter(id => id !== shop.id) })} />
                                    <span className="flex-1">{shop.name}</span>
                                    {owner && <span className="text-xs text-muted-foreground">эзэмшигч</span>}
                                </label>;
                            })}
                        </fieldset>
                        {projectEdit.user.role === 'sales_manager' ? <p className="text-xs text-muted-foreground">
                            Сонгосон төсөлд менежерийн бүртгэл профайлын нэрээр холбогдож, тухайн төслийн өөрт хуваарилсан лидийг харна.
                            Хассан төслийн лид нь менежерийн нэрээр үлдэх тул <a href="/admin/sales-targets" className="text-brand-strong underline">Борлуулалтын төлөвлөгөө</a> болон Лид хэсэгт дахин хуваарилна.
                        </p> : <p className="text-xs text-muted-foreground">Сонгосон төслүүдийн мэдээллийг дүрийнх нь эрхээр харна.</p>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setProjectEdit(null)} disabled={saving} className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm">Цуцлах</button>
                            <button onClick={saveProjects} disabled={saving} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50">
                                {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {profileEdit && (
                <Dialog open onOpenChange={open => { if (!open && !saving) setProfileEdit(null); }}>
                    <DialogContent className="max-w-md">
                        <DialogTitle>Профайл засах</DialogTitle>
                        <DialogDescription>{profileEdit.user.email}</DialogDescription>
                        <label htmlFor="admin-profile-name" className="text-sm font-medium">Нэр</label>
                        <input id="admin-profile-name" type="text" value={profileEdit.full_name} disabled={saving || profileNameLocked}
                            onChange={event => setProfileEdit({ ...profileEdit, full_name: event.target.value })}
                            aria-describedby={profileNameLocked ? 'admin-profile-name-hint' : undefined}
                            className="rounded-lg border border-border bg-surface p-2.5 text-sm disabled:bg-surface-2 disabled:text-muted-foreground" />
                        {profileNameLocked && <p id="admin-profile-name-hint" className="text-xs text-muted-foreground">
                            Идэвхтэй борлуулалтын менежерийн нэрээр ERP, KPI болон лидийн хариуцагч холбогддог тул энд солихгүй.
                            Нэрийг <a href="/admin/sales-targets" className="text-brand-strong underline">Борлуулалтын төлөвлөгөө</a> хэсэгт менежерийн холбоосоор удирдана.
                        </p>}
                        {profileNameInvalid && <p className="text-xs text-status-danger">{profileEdit.full_name.trim() ? MANAGER_NAME_REQUIRED : 'Нэр оруулна уу'}</p>}
                        <label htmlFor="admin-profile-phone" className="text-sm font-medium">Утас</label>
                        <input id="admin-profile-phone" type="tel" inputMode="numeric" autoComplete="off" value={profileEdit.phone} disabled={saving}
                            onChange={event => setProfileEdit({ ...profileEdit, phone: event.target.value })}
                            aria-invalid={profilePhoneInvalid} aria-describedby="admin-profile-phone-hint"
                            className="num rounded-lg border border-border bg-surface p-2.5 text-sm" placeholder="9911 2233" />
                        <p id="admin-profile-phone-hint" className={`text-xs ${profilePhoneInvalid ? 'text-status-danger' : 'text-muted-foreground'}`}>
                            {profilePhoneInvalid ? STAFF_PHONE_ERROR : '8 оронтой. Хоосон үлдээвэл утсыг арилгана.'}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setProfileEdit(null)} disabled={saving} className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm">Цуцлах</button>
                            <button onClick={saveProfile} disabled={saving || profilePhoneInvalid || profileNameInvalid}
                                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50">
                                {saving ? 'Хадгалж байна...' : 'Хадгалах'}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Invite Link Modal */}
            {showInvite && (
                <Dialog open onOpenChange={open => { if (!open && !inviting) setShowInvite(false); }}>
                    <DialogContent showCloseButton={false} className="bg-surface max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto p-0 gap-0 rounded-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <LinkIcon className="w-5 h-5 text-brand-strong" />
                                <DialogTitle className="text-lg font-bold text-foreground">Урих / нэвтрэх холбоос</DialogTitle>
                            </div>
                            <button onClick={() => setShowInvite(false)} disabled={inviting} aria-label="Хаах" className="p-2 hover:bg-surface-2 rounded-xl disabled:opacity-50">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <DialogDescription className="sr-only">Ажилтанд нэвтрэх урилга илгээх</DialogDescription>

                        <div className="p-6 space-y-4">
                            {inviteError && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{inviteError}
                                </div>
                            )}

                            {!inviteResult ? (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Имэйл оруулахад ажилтанд урилга (нэвтрэх холбоос) <b>имэйлээр автоматаар илгээгдэнэ</b> — нэвтрэхэд нууц үг шаардахгүй. Шаардвал холбоосыг доор хуулж болно.
                                    </p>
                                    <div>
                                        <label htmlFor="invite-full-name" className="block text-sm font-medium text-foreground mb-1">Нэр{inviteForm.role === 'sales_manager' && <span className="text-status-danger"> *</span>}</label>
                                        <input
                                            id="invite-full-name"
                                            type="text"
                                            value={inviteForm.full_name}
                                            onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                            placeholder="Бодит бүтэн нэр"
                                        />
                                    </div>
                                    {inviteForm.role === 'sales_manager' && <p className="text-xs text-muted-foreground">Борлуулалтын менежерт бодит бүтэн нэр заавал — ERP-ийн «Борлуулалтын менежер» бичлэгтэй яг ижил бичнэ. Бүртгэлтэй хүний профайлын нэрээр менежер холбогдоно.
                                        Менежерийн холбоосыг <a href="/admin/sales-targets" className="ml-1 text-brand-strong underline">Борлуулалтын төлөвлөгөө</a> хэсэгт шалгана.</p>}
                                    <div>
                                        <label htmlFor="invite-email" className="block text-sm font-medium text-foreground mb-1">Имэйл <span className="text-status-danger">*</span></label>
                                        <input
                                            id="invite-email"
                                            type="email"
                                            value={inviteForm.email}
                                            onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                            placeholder="manager@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="invite-phone" className="block text-sm font-medium text-foreground mb-1">Утас</label>
                                        <input
                                            id="invite-phone"
                                            type="tel"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            value={inviteForm.phone}
                                            onChange={e => setInviteForm(p => ({ ...p, phone: e.target.value }))}
                                            aria-invalid={invitePhoneInvalid}
                                            aria-describedby="invite-phone-hint"
                                            className="num w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                            placeholder="9911 2233"
                                        />
                                        <p id="invite-phone-hint" className={`mt-1 text-xs ${invitePhoneInvalid ? 'text-status-danger' : 'text-muted-foreground/70'}`}>
                                            {invitePhoneInvalid ? STAFF_PHONE_ERROR : '8 оронтой, заавал биш. Имэйл хүрэхгүй бол холбоосыг энэ дугаараар дамжуулна.'}
                                        </p>
                                    </div>
                                    <div>
                                        <label htmlFor="invite-role" className="block text-sm font-medium text-foreground mb-1">Дүр</label>
                                        <select
                                            id="invite-role"
                                            value={inviteForm.role}
                                            onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface focus:ring-2 focus:ring-brand focus:border-brand"
                                        >
                                            <option value="">Дүр сонгох</option>
                                            {roles.map(r => (
                                                <option key={r.value} value={r.value}>{r.label}</option>
                                            ))}
                                        </select>
                                        {inviteForm.role === 'super_admin' && <p className="mt-2 text-xs text-status-pending">Super Admin нь бүх төслийн хэрэглэгч, эрх болон тохиргоог удирдана.</p>}
                                    </div>
                                    {shops.length > 0 && (
                                        <div>
                                            <label htmlFor="invite-shop" className="block text-sm font-medium text-foreground mb-1">Төсөл</label>
                                            <select
                                                id="invite-shop"
                                                value={inviteForm.shop_id}
                                                onChange={e => setInviteForm(p => ({ ...p, shop_id: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface focus:ring-2 focus:ring-brand"
                                            >
                                                {shops.length > 1 && <option value="">— Төсөл сонгох —</option>}
                                                {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className={`p-3 rounded-lg text-sm flex items-center gap-2 border ${inviteResult.emailed ? 'bg-status-success-soft border-status-success/30 text-status-success' : 'bg-status-pending-soft border-status-pending/30 text-status-pending'}`}>
                                        {inviteResult.emailed ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                                        {inviteResult.emailed
                                            ? (inviteResult.mode === 'invite' ? `Урилга ${inviteForm.email} руу имэйлээр илгээгдлээ` : 'Нэвтрэх холбоос имэйлээр илгээгдлээ')
                                            : 'Имэйл илгээгдсэнгүй — доорх холбоосыг гараар илгээнэ үү'}
                                    </div>
                                    <label htmlFor="invite-link" className="block text-sm font-medium text-foreground">Холбоос (нөөц — шаардвал гараар илгээнэ)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="invite-link"
                                            readOnly
                                            value={inviteResult.link}
                                            onFocus={(e) => e.currentTarget.select()}
                                            className="flex-1 px-3 py-2.5 border border-border-strong rounded-lg text-xs bg-surface-2 text-foreground"
                                        />
                                        <button
                                            onClick={copyInviteLink}
                                            className="flex items-center gap-1.5 px-3 py-2.5 bg-brand text-brand-fg rounded-lg text-sm font-medium hover:bg-brand-strong"
                                        >
                                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            {copied ? 'Хуулсан' : 'Хуулах'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground/70">Энэ холбоос нэг удаа, хязгаарлагдмал хугацаанд хүчинтэй.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-border/60">
                            <button
                                onClick={() => setShowInvite(false)}
                                className="px-4 py-2.5 text-sm text-foreground bg-surface-2 rounded-lg hover:bg-surface-3"
                            >
                                {inviteResult ? 'Хаах' : 'Цуцлах'}
                            </button>
                            {!inviteResult && (
                                <button
                                    onClick={sendInvite}
                                    disabled={inviting || !inviteForm.email || !inviteForm.shop_id || !roles.some(role => role.value === inviteForm.role) || inviteNameMissing || invitePhoneInvalid}
                                    className="flex items-center gap-2 px-5 py-2.5 text-sm bg-brand text-brand-fg rounded-lg hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                    Урилга илгээх
                                </button>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Create User Modal */}
            {showCreate && (
                <Dialog open onOpenChange={open => { if (!open && !creating) setShowCreate(false); }}>
                    <DialogContent showCloseButton={false} className="bg-surface max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto p-0 gap-0 rounded-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-brand-strong" />
                                <DialogTitle className="text-lg font-bold text-foreground">Хэрэглэгч нэмэх</DialogTitle>
                            </div>
                            <button onClick={() => setShowCreate(false)} disabled={creating} aria-label="Хаах" className="p-2 hover:bg-surface-2 rounded-xl disabled:opacity-50">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <DialogDescription className="sr-only">Шинэ хэрэглэгчийн мэдээлэл болон эрхийг оруулах</DialogDescription>

                        <div className="p-6 space-y-4">
                            {createError && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {createError}
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label htmlFor="new-user-name" className="block text-sm font-medium text-foreground mb-1">Нэр{newUser.role === 'sales_manager' && <span className="text-status-danger"> *</span>}</label>
                                <input
                                    id="new-user-name"
                                    type="text"
                                    value={newUser.full_name}
                                    onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="Нэр оруулах"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label htmlFor="new-user-email" className="block text-sm font-medium text-foreground mb-1">Имэйл <span className="text-status-danger">*</span></label>
                                <input
                                    id="new-user-email"
                                    type="email"
                                    autoComplete="off"
                                    value={newUser.email}
                                    onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="email@example.com"
                                    required
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label htmlFor="new-user-phone" className="block text-sm font-medium text-foreground mb-1">Утас</label>
                                <input
                                    id="new-user-phone"
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={newUser.phone}
                                    onChange={e => setNewUser(p => ({ ...p, phone: e.target.value }))}
                                    aria-invalid={newPhoneInvalid}
                                    aria-describedby="new-user-phone-hint"
                                    className="num w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                                    placeholder="9911 2233"
                                />
                                <p id="new-user-phone-hint" className={`mt-1 text-xs ${newPhoneInvalid ? 'text-status-danger' : 'text-muted-foreground/70'}`}>
                                    {newPhoneInvalid ? STAFF_PHONE_ERROR : '8 оронтой, заавал биш. Түр нууц үгийг имэйлээр бус энэ дугаараар дамжуулна.'}
                                </p>
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="new-user-password" className="block text-sm font-medium text-foreground mb-1">Нууц үг <span className="text-status-danger">*</span></label>
                                <div className="relative">
                                    <input
                                        id="new-user-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={newUser.password}
                                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm pr-10 focus:ring-2 focus:ring-brand focus:border-brand"
                                        placeholder="Хамгийн багадаа 8 тэмдэгт"
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Нууц үг нуух' : 'Нууц үг харах'}
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
                                            aria-pressed={newUser.role === r.value}
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
                                {newUser.role === 'super_admin' && <p className="mt-2 text-xs text-status-pending">Super Admin нь бүх төслийн хэрэглэгч, эрх болон тохиргоог удирдана.</p>}
                                {newUser.role === 'sales_manager' && <p className="mt-2 text-xs text-muted-foreground">Бодит бүтэн нэр заавал — ERP-ийн «Борлуулалтын менежер» бичлэгтэй яг ижил бичнэ. Энэ нэрээр идэвхтэй борлуулалтын менежер автоматаар холбогдоно.
                                    Менежерийн холбоосыг <a href="/admin/sales-targets" className="ml-1 text-brand-strong underline">Борлуулалтын төлөвлөгөө</a> хэсэгт шалгана.</p>}
                            </div>

                            {/* Project (shop = төсөл) membership */}
                            {shops.length > 0 && (
                                <div>
                                    <label htmlFor="new-user-shop" className="block text-sm font-medium text-foreground mb-1">Төсөл</label>
                                    <select
                                        id="new-user-shop"
                                        value={newUser.shop_id}
                                        onChange={e => setNewUser(p => ({ ...p, shop_id: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface focus:ring-2 focus:ring-brand focus:border-brand"
                                    >
                                        {shops.length > 1 && <option value="">— Төсөл сонгох —</option>}
                                        {shops.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground/70 mt-1">
                                        Ажилтан энэ төслийн самбарт хандана. Бусад төслийг «Төслүүд» товчоор нэмнэ.
                                        {shops.length === 1 && ' (Ганц төсөл тул автоматаар сонгогдсон.)'}
                                    </p>
                                </div>
                            )}
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
                                disabled={creating || !newUser.email || !newUser.password || !newUser.shop_id || !roles.some(role => role.value === newUser.role) || newNameMissing || newPhoneInvalid}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-brand text-brand-fg rounded-lg hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Үүсгэх
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Password Reset Modal */}
            {pwUser && (
                <Dialog open onOpenChange={open => { if (!open && !pwSaving) setPwUser(null); }}>
                    <DialogContent showCloseButton={false} className="bg-surface max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto p-0 gap-0 rounded-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <KeyRound className="w-5 h-5 text-brand-strong" />
                                <DialogTitle className="text-lg font-bold text-foreground">Нууц үг тавих / шинэчлэх</DialogTitle>
                            </div>
                            <button onClick={() => setPwUser(null)} disabled={pwSaving} aria-label="Хаах" className="p-2 hover:bg-surface-2 rounded-xl disabled:opacity-50">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <DialogDescription className="sr-only">Сонгосон хэрэглэгчийн нууц үгийг шинэчлэх</DialogDescription>

                        <div className="p-6 space-y-4">
                            {pwError && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {pwError}
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{pwUser.full_name || pwUser.email}</span>{' '}
                                ({pwUser.email}) хэрэглэгчид шинэ нууц үг тавина. Урилгаар үүссэн
                                (нууц үггүй) бүртгэлд нэвтрэх нууц үг өгөхөд мөн энэ хэсгийг ашиглана.
                            </p>

                            <div>
                                <label htmlFor="reset-password" className="block text-sm font-medium text-foreground mb-1">
                                    Шинэ нууц үг <span className="text-status-danger">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        id="reset-password"
                                        type={pwShow ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={pwValue}
                                        onChange={e => setPwValue(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm pr-10 focus:ring-2 focus:ring-brand focus:border-brand"
                                        placeholder="Хамгийн багадаа 8 тэмдэгт"
                                        minLength={8}
                                    />
                                    <button
                                        type="button"
                                        aria-label={pwShow ? 'Нууц үг нуух' : 'Нууц үг харах'}
                                        onClick={() => setPwShow(p => !p)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
                                    >
                                        {pwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    Хадгалсны дараа систем нэвтрэлтийг автоматаар шалгаж баталгаажуулна.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-border/60">
                            <button
                                onClick={() => setPwUser(null)}
                                disabled={pwSaving}
                                className="px-4 py-2.5 text-sm text-foreground bg-surface-2 rounded-lg hover:bg-surface-3 disabled:opacity-50"
                            >
                                Цуцлах
                            </button>
                            <button
                                onClick={resetPassword}
                                disabled={pwSaving || pwValue.length < 8}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-brand text-brand-fg rounded-lg hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                Хадгалах
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <Dialog open onOpenChange={open => { if (!open && !deleting) setDeleteConfirm(null); }}>
                    <DialogContent showCloseButton={false} className="bg-surface max-w-sm p-0 gap-0 rounded-2xl">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-status-danger-soft rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-6 h-6 text-status-danger" />
                            </div>
                            <DialogTitle className="text-lg font-bold text-foreground mb-2">Хэрэглэгч устгах</DialogTitle>
                            <DialogDescription className="sr-only">Энэ үйлдлийг буцаах боломжгүй. Устгах хэрэглэгчийг баталгаажуулах</DialogDescription>
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
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-status-danger text-background rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                            >
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Устгах
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
