'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterSelect } from '@/components/dashboard/FilterBar';
import {
    User,
    Phone,
    Mail,
    Tag,
    X,
    MessageSquare,
    Clock,
    Edit2,
    Save,
    FileText,
    Plus,
    AlertCircle,
    Upload,
    Cloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ServiceLogType = 'inquiry' | 'complaint' | 'maintenance' | 'handover' | 'payment' | 'other';
type ServiceLogStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

interface ServiceLogEntry {
    id: string;
    type: ServiceLogType;
    subject: string;
    description: string | null;
    status: ServiceLogStatus;
    priority: 'low' | 'medium' | 'high' | 'urgent' | string;
    created_at: string;
    resolved_at: string | null;
}

interface Customer {
    id: string;
    name: string | null;
    phone: string | null;
    email?: string | null;
    address: string | null;
    notes?: string | null;
    tags?: string[];
    message_count?: number;
    last_contact_at?: string | null;
    created_at: string;
    chat_history?: Array<{ message: string; response: string; created_at: string }>;
    service_logs?: ServiceLogEntry[];
}

const SERVICE_LOG_TYPE_LABELS: Record<ServiceLogType, string> = {
    inquiry: 'Хүсэлт',
    complaint: 'Гомдол',
    maintenance: 'Засвар',
    handover: 'Хүлээлгэн өгөлт',
    payment: 'Төлбөр',
    other: 'Бичиг / Бусад',
};

const SERVICE_LOG_TYPE_VARIANT: Record<ServiceLogType, 'info' | 'danger' | 'warning' | 'success' | 'brand' | 'default'> = {
    inquiry: 'info',
    complaint: 'danger',
    maintenance: 'warning',
    handover: 'success',
    payment: 'brand',
    other: 'default',
};

const SERVICE_LOG_STATUS_LABELS: Record<ServiceLogStatus, string> = {
    open: 'Шинэ',
    in_progress: 'Шийдэгдэж байгаа',
    resolved: 'Шийдэгдсэн',
    closed: 'Хаасан',
};

const PREDEFINED_TAGS = ['New', 'Lead', 'Inactive', 'Hot', 'Regular'];

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState('created_at');
    const [loading, setLoading] = useState(true);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editForm, setEditForm] = useState({
        name: '',
        phone: '',
        email: '',
        notes: '',
    });

    // Inline notes editor (separate from full edit mode)
    const [notesEditing, setNotesEditing] = useState(false);
    const [notesDraft, setNotesDraft] = useState('');
    const [notesSaving, setNotesSaving] = useState(false);

    // Manual create modal
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
    });
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [logForm, setLogForm] = useState<{ type: ServiceLogType; subject: string; description: string }>({
        type: 'complaint',
        subject: '',
        description: '',
    });
    const [logSubmitting, setLogSubmitting] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);

    // HubSpot import modal
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPreview, setImportPreview] = useState<{ total: number; sample: Array<{ name: string; email: string | null; phone: string | null; tags: string[] }> } | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: Array<{ name: string; reason: string }> } | null>(null);

    // HubSpot direct API sync
    const [isHubspotSyncOpen, setIsHubspotSyncOpen] = useState(false);
    const [hubspotToken, setHubspotToken] = useState('');
    const [hubspotSaveToken, setHubspotSaveToken] = useState(true);
    const [hubspotPreview, setHubspotPreview] = useState<{ sample: Array<{ id: string; name: string; email: string | null; phone: string | null; lifecycle: string | null; lead_status: string | null }>; has_more: boolean } | null>(null);
    const [hubspotSyncing, setHubspotSyncing] = useState(false);
    const [hubspotError, setHubspotError] = useState<string | null>(null);
    const [hubspotResult, setHubspotResult] = useState<{ total: number; imported: number; skipped: number; errors: Array<{ name: string; reason: string }> } | null>(null);

    useEffect(() => {
        fetchCustomers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTag, sortBy]);

    async function fetchCustomers() {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedTag) params.set('tag', selectedTag);
            params.set('sortBy', sortBy);

            const res = await fetch(`/api/dashboard/customers?${params}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            const data = await res.json();
            setCustomers(data.customers || []);
        } catch (error) {
            console.error('Failed to fetch customers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCustomerDetail(id: string) {
        try {
            const res = await fetch(`/api/dashboard/customers/${id}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            const data = await res.json();
            setSelectedCustomer(data.customer);
            setEditForm({
                name: data.customer.name || '',
                phone: data.customer.phone || '',
                email: data.customer.email || '',
                notes: data.customer.notes || '',
            });
            setIsDetailOpen(true);
        } catch (error) {
            console.error('Failed to fetch customer detail:', error);
        }
    }

    async function submitServiceLog() {
        if (!selectedCustomer) return;
        if (!logForm.subject.trim()) {
            setLogError('Гарчиг бичнэ үү');
            return;
        }
        setLogSubmitting(true);
        setLogError(null);
        try {
            const res = await fetch('/api/dashboard/service-logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({
                    customer_id: selectedCustomer.id,
                    customer_name: selectedCustomer.name,
                    customer_phone: selectedCustomer.phone,
                    type: logForm.type,
                    subject: logForm.subject.trim(),
                    description: logForm.description.trim() || null,
                    priority: logForm.type === 'complaint' ? 'high' : 'medium',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Бүртгэхэд алдаа гарлаа');
            }
            setLogForm({ type: 'complaint', subject: '', description: '' });
            await fetchCustomerDetail(selectedCustomer.id);
        } catch (err) {
            setLogError(err instanceof Error ? err.message : 'Бүртгэхэд алдаа гарлаа');
        } finally {
            setLogSubmitting(false);
        }
    }

    async function previewImport() {
        if (!importFile) {
            setImportError('Файл сонгоно уу');
            return;
        }
        setImporting(true);
        setImportError(null);
        try {
            const fd = new FormData();
            fd.append('file', importFile);
            fd.append('preview', 'true');
            const res = await fetch('/api/dashboard/customers/import/hubspot', {
                method: 'POST',
                body: fd,
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Урьдчилан харахад алдаа');
            setImportPreview(data);
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Урьдчилан харахад алдаа');
        } finally {
            setImporting(false);
        }
    }

    async function confirmImport() {
        if (!importFile) return;
        setImporting(true);
        setImportError(null);
        try {
            const fd = new FormData();
            fd.append('file', importFile);
            const res = await fetch('/api/dashboard/customers/import/hubspot', {
                method: 'POST',
                body: fd,
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Импорт амжилтгүй');
            setImportResult(data);
            setImportPreview(null);
            await fetchCustomers();
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Импорт амжилтгүй');
        } finally {
            setImporting(false);
        }
    }

    function resetImport() {
        setIsImportOpen(false);
        setImportFile(null);
        setImportPreview(null);
        setImportResult(null);
        setImportError(null);
    }

    function resetHubspotSync() {
        setIsHubspotSyncOpen(false);
        setHubspotToken('');
        setHubspotPreview(null);
        setHubspotResult(null);
        setHubspotError(null);
    }

    async function previewHubspot() {
        if (!hubspotToken.trim() && !hubspotPreview) {
            // Allow preview without token if shop already has one stored — server checks env/shop
        }
        setHubspotSyncing(true);
        setHubspotError(null);
        try {
            const res = await fetch('/api/integrations/hubspot/sync', {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                    ...(hubspotToken.trim() ? { 'x-hubspot-token': hubspotToken.trim() } : {}),
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Урьдчилан харахад алдаа');
            setHubspotPreview(data);
        } catch (err) {
            setHubspotError(err instanceof Error ? err.message : 'Алдаа');
        } finally {
            setHubspotSyncing(false);
        }
    }

    async function confirmHubspotSync() {
        setHubspotSyncing(true);
        setHubspotError(null);
        try {
            const res = await fetch('/api/integrations/hubspot/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                    ...(hubspotToken.trim() ? { 'x-hubspot-token': hubspotToken.trim() } : {}),
                },
                body: JSON.stringify({
                    save_token: hubspotSaveToken && hubspotToken.trim() ? hubspotToken.trim() : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Sync алдаа');
            setHubspotResult(data);
            setHubspotPreview(null);
            await fetchCustomers();
        } catch (err) {
            setHubspotError(err instanceof Error ? err.message : 'Sync алдаа');
        } finally {
            setHubspotSyncing(false);
        }
    }

    async function createCustomer() {
        if (!createForm.name.trim()) {
            setCreateError('Нэр шаардлагатай');
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/dashboard/customers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({
                    name: createForm.name.trim(),
                    phone: createForm.phone.trim() || null,
                    email: createForm.email.trim() || null,
                    address: createForm.address.trim() || null,
                    notes: createForm.notes.trim() || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Бүртгэхэд алдаа гарлаа');
            }
            setCreateForm({ name: '', phone: '', email: '', address: '', notes: '' });
            setIsCreateOpen(false);
            await fetchCustomers();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'Бүртгэхэд алдаа гарлаа');
        } finally {
            setCreating(false);
        }
    }

    async function saveNotesOnly() {
        if (!selectedCustomer) return;
        setNotesSaving(true);
        try {
            const res = await fetch('/api/dashboard/customers', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({ id: selectedCustomer.id, notes: notesDraft }),
            });
            if (!res.ok) throw new Error('Тэмдэглэл хадгалахад алдаа');
            setSelectedCustomer({ ...selectedCustomer, notes: notesDraft });
            setNotesEditing(false);
        } catch (err) {
            console.error(err);
        } finally {
            setNotesSaving(false);
        }
    }

    async function saveCustomer() {
        if (!selectedCustomer) return;
        setSaving(true);
        try {
            await fetch('/api/dashboard/customers', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({
                    id: selectedCustomer.id,
                    ...editForm,
                }),
            });
            setEditMode(false);
            fetchCustomers();
            fetchCustomerDetail(selectedCustomer.id);
        } catch (error) {
            console.error('Failed to save customer:', error);
        } finally {
            setSaving(false);
        }
    }

    const filteredCustomers = customers.filter((c) => {
        const matchesSearch =
            (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.phone || '').includes(searchQuery);
        return matchesSearch;
    });

    const formatDate = (date: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('mn-MN');
    };

    const formatTime = (date: string | null) => {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Өнөөдөр';
        if (days === 1) return 'Өчигдөр';
        if (days < 7) return `${days} өдрийн өмнө`;
        return formatDate(date);
    };

    return (
        <div>
            <PageHeader
                eyebrow="CRM"
                title="Харилцагчид"
                subtitle={`Нийт ${customers.length} харилцагч бүртгэлтэй`}
                primaryAction={
                    <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Шинэ харилцагч
                    </Button>
                }
                secondaryActions={
                    <>
                        <Button variant="secondary" size="sm" onClick={() => setIsHubspotSyncOpen(true)}>
                            <Cloud className="w-4 h-4" />
                            HubSpot татах
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setIsImportOpen(true)}>
                            <Upload className="w-4 h-4" />
                            HubSpot CSV
                        </Button>
                    </>
                }
            />

            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэр, утсаар хайх...',
                }}
                showClear={searchQuery !== '' || selectedTag !== null || sortBy !== 'created_at'}
                onClear={() => {
                    setSearchQuery('');
                    setSelectedTag(null);
                    setSortBy('created_at');
                }}
            >
                <FilterSelect
                    label="Tag"
                    value={selectedTag || ''}
                    onChange={(e) => setSelectedTag(e.target.value || null)}
                >
                    <option value="">Бүх Tag</option>
                    {PREDEFINED_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                            {tag}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Эрэмбэлэх" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="created_at">Бүртгэсэн огноо</option>
                    <option value="last_contact_at">Сүүлд харьцсан</option>
                </FilterSelect>
            </FilterBar>

            {loading ? (
                <Card>
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                </Card>
            ) : filteredCustomers.length === 0 ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<User className="w-7 h-7" />} title="Харилцагч олдсонгүй" />
                    </div>
                </Card>
            ) : (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface-2/50 border-b border-border">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                        Харилцагч
                                    </th>
                                    <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                        Tags
                                    </th>
                                    <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                        Сүүлд харьцсан
                                    </th>
                                    <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                        Харилцсан
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {filteredCustomers.map((customer) => (
                                    <tr
                                        key={customer.id}
                                        className="hover:bg-surface-2/40 cursor-pointer transition-colors"
                                        onClick={() => fetchCustomerDetail(customer.id)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center">
                                                    <User className="w-5 h-5 text-brand-strong" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-foreground">
                                                        {customer.name || 'Харилцагч'}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">{customer.phone || '-'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {(customer.tags || []).map((tag) => (
                                                    <Badge key={tag} variant="brand" size="sm">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <Clock className="w-4 h-4 text-muted-foreground/70" />
                                                {formatTime(customer.last_contact_at || customer.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm text-muted-foreground tabular-nums">
                                                {customer.message_count || 0} удаа
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* HubSpot Direct Sync Modal */}
            {isHubspotSyncOpen && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="heading-section text-lg text-foreground">HubSpot-аас шууд татах</h2>
                            <button onClick={resetHubspotSync} className="p-2 hover:bg-surface-2 rounded-md transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {!hubspotPreview && !hubspotResult && (
                                <>
                                    <div className="bg-status-info-soft p-3 rounded-md text-sm text-status-info space-y-1">
                                        <p className="font-medium">HubSpot Private App token хэрхэн авах:</p>
                                        <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                                            <li>HubSpot → Settings (⚙️) → Integrations → <strong>Private Apps</strong></li>
                                            <li>"Create a private app" дарна</li>
                                            <li>Scopes таб → <strong>crm.objects.contacts.read</strong> сонгох</li>
                                            <li>Create → Access token-ийг хуулж энд буулгах</li>
                                        </ol>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                            HubSpot Access Token
                                        </label>
                                        <input
                                            type="password"
                                            value={hubspotToken}
                                            onChange={(e) => setHubspotToken(e.target.value)}
                                            placeholder="pat-na1-xxxxxxxx-..."
                                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                        />
                                        <p className="mt-1 text-xs text-muted-foreground/70">
                                            Token хадгалагдсан бол хоосон үлдээж болно — хадгалсан token-ыг автоматаар ашиглана.
                                        </p>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={hubspotSaveToken}
                                            onChange={(e) => setHubspotSaveToken(e.target.checked)}
                                        />
                                        Token-ыг shop-д хадгалах (дараагийн удаа дахин оруулахгүй)
                                    </label>
                                    {hubspotError && (
                                        <p className="flex items-center gap-1.5 text-sm text-status-danger">
                                            <AlertCircle className="w-4 h-4" /> {hubspotError}
                                        </p>
                                    )}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="secondary" size="sm" onClick={resetHubspotSync}>Цуцлах</Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={previewHubspot}
                                            disabled={hubspotSyncing}
                                            isLoading={hubspotSyncing}
                                        >
                                            Урьдчилан харах
                                        </Button>
                                    </div>
                                </>
                            )}

                            {hubspotPreview && !hubspotResult && (
                                <>
                                    <div className="bg-status-success-soft p-3 rounded-md text-sm text-status-success">
                                        ✓ Token хүчинтэй. Эхний {hubspotPreview.sample.length} contact:
                                    </div>
                                    <div className="border border-border rounded-md overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-surface-2/50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Нэр</th>
                                                    <th className="px-3 py-2 text-left">Email</th>
                                                    <th className="px-3 py-2 text-left">Утас</th>
                                                    <th className="px-3 py-2 text-left">Lifecycle</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {hubspotPreview.sample.map((c) => (
                                                    <tr key={c.id}>
                                                        <td className="px-3 py-2">{c.name}</td>
                                                        <td className="px-3 py-2 text-muted-foreground">{c.email || '-'}</td>
                                                        <td className="px-3 py-2 text-muted-foreground">{c.phone || '-'}</td>
                                                        <td className="px-3 py-2 text-muted-foreground">{c.lifecycle || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {hubspotPreview.has_more && (
                                        <p className="text-xs text-muted-foreground">Илүү олон contact байгаа — sync дарвал бүгдийг (5000-аас бага) татна.</p>
                                    )}
                                    {hubspotError && (
                                        <p className="flex items-center gap-1.5 text-sm text-status-danger">
                                            <AlertCircle className="w-4 h-4" /> {hubspotError}
                                        </p>
                                    )}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="secondary" size="sm" onClick={() => setHubspotPreview(null)}>Буцах</Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={confirmHubspotSync}
                                            disabled={hubspotSyncing}
                                            isLoading={hubspotSyncing}
                                        >
                                            Бүх contact-ыг татаж импортлох
                                        </Button>
                                    </div>
                                </>
                            )}

                            {hubspotResult && (
                                <>
                                    <div className="bg-status-success-soft p-4 rounded-md">
                                        <p className="text-status-success font-medium">✓ HubSpot sync амжилттай боллоо</p>
                                        <ul className="mt-2 text-sm text-foreground space-y-1">
                                            <li>HubSpot-ээс татсан: <strong>{hubspotResult.total}</strong></li>
                                            <li>Шинэ нэмэгдсэн: <strong>{hubspotResult.imported}</strong></li>
                                            <li>Алгассан (давхардсан): <strong>{hubspotResult.skipped}</strong></li>
                                            {hubspotResult.errors.length > 0 && (
                                                <li className="text-status-danger">Алдаатай: <strong>{hubspotResult.errors.length}</strong></li>
                                            )}
                                        </ul>
                                    </div>
                                    {hubspotResult.errors.length > 0 && (
                                        <div className="max-h-40 overflow-y-auto bg-status-danger-soft p-3 rounded-md text-xs">
                                            {hubspotResult.errors.slice(0, 10).map((e, i) => (
                                                <p key={i}>{e.name}: {e.reason}</p>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex justify-end pt-2">
                                        <Button variant="primary" size="sm" onClick={resetHubspotSync}>Хаах</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* HubSpot Import Modal */}
            {isImportOpen && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="heading-section text-lg text-foreground">HubSpot CSV импорт</h2>
                            <button onClick={resetImport} className="p-2 hover:bg-surface-2 rounded-md transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {!importPreview && !importResult && (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        HubSpot Contacts хэсгээс экспортолсон CSV/XLSX файл сонгоно уу. Email эсвэл утсаар давхардлыг таниж хасна.
                                    </p>
                                    <input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                        className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-brand file:text-brand-fg file:font-medium hover:file:bg-brand-strong"
                                    />
                                    {importError && (
                                        <p className="flex items-center gap-1.5 text-sm text-status-danger">
                                            <AlertCircle className="w-4 h-4" /> {importError}
                                        </p>
                                    )}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="secondary" size="sm" onClick={resetImport}>Цуцлах</Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={previewImport}
                                            disabled={!importFile || importing}
                                            isLoading={importing}
                                        >
                                            Урьдчилан харах
                                        </Button>
                                    </div>
                                </>
                            )}

                            {importPreview && !importResult && (
                                <>
                                    <div className="bg-status-info-soft p-3 rounded-md text-sm text-status-info">
                                        Нийт <strong>{importPreview.total}</strong> мөр танигдлаа. Эхний {importPreview.sample.length}-г харуулж байна:
                                    </div>
                                    <div className="border border-border rounded-md overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-surface-2/50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Нэр</th>
                                                    <th className="px-3 py-2 text-left">Email</th>
                                                    <th className="px-3 py-2 text-left">Утас</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {importPreview.sample.map((c, i) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-2">{c.name}</td>
                                                        <td className="px-3 py-2 text-muted-foreground">{c.email || '-'}</td>
                                                        <td className="px-3 py-2 text-muted-foreground">{c.phone || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {importError && (
                                        <p className="flex items-center gap-1.5 text-sm text-status-danger">
                                            <AlertCircle className="w-4 h-4" /> {importError}
                                        </p>
                                    )}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="secondary" size="sm" onClick={() => setImportPreview(null)}>Буцах</Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={confirmImport}
                                            disabled={importing}
                                            isLoading={importing}
                                        >
                                            Импорт хийх ({importPreview.total})
                                        </Button>
                                    </div>
                                </>
                            )}

                            {importResult && (
                                <>
                                    <div className="bg-status-success-soft p-4 rounded-md">
                                        <p className="text-status-success font-medium">
                                            ✓ Импорт амжилттай боллоо
                                        </p>
                                        <ul className="mt-2 text-sm text-foreground space-y-1">
                                            <li>Нэмэгдсэн: <strong>{importResult.imported}</strong></li>
                                            <li>Алгассан (давхардсан): <strong>{importResult.skipped}</strong></li>
                                            {importResult.errors.length > 0 && (
                                                <li className="text-status-danger">Алдаатай: <strong>{importResult.errors.length}</strong></li>
                                            )}
                                        </ul>
                                    </div>
                                    {importResult.errors.length > 0 && (
                                        <div className="max-h-40 overflow-y-auto bg-status-danger-soft p-3 rounded-md text-xs">
                                            {importResult.errors.slice(0, 10).map((e, i) => (
                                                <p key={i}>{e.name}: {e.reason}</p>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex justify-end pt-2">
                                        <Button variant="primary" size="sm" onClick={resetImport}>Хаах</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Customer Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="heading-section text-lg text-foreground">Шинэ харилцагч нэмэх</h2>
                            <button
                                onClick={() => {
                                    setIsCreateOpen(false);
                                    setCreateError(null);
                                }}
                                className="p-2 hover:bg-surface-2 rounded-md transition-colors"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                    Нэр <span className="text-status-danger">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                    placeholder="Б. Болд"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                        Утас
                                    </label>
                                    <input
                                        type="text"
                                        value={createForm.phone}
                                        onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                                        placeholder="9999-9999"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                        И-мэйл
                                    </label>
                                    <input
                                        type="email"
                                        value={createForm.email}
                                        onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                                        placeholder="bold@example.com"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                    Хаяг
                                </label>
                                <input
                                    type="text"
                                    value={createForm.address}
                                    onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                                    placeholder="УБ хот, СБД, ..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                    Тэмдэглэл
                                </label>
                                <textarea
                                    value={createForm.notes}
                                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                    rows={3}
                                    placeholder="Хэрэгцээ, хүсэлт, бусад мэдээлэл..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                />
                            </div>
                            {createError && (
                                <p className="flex items-center gap-1.5 text-sm text-status-danger">
                                    <AlertCircle className="w-4 h-4" /> {createError}
                                </p>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        setIsCreateOpen(false);
                                        setCreateError(null);
                                    }}
                                >
                                    Цуцлах
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={createCustomer}
                                    disabled={creating || !createForm.name.trim()}
                                    isLoading={creating}
                                >
                                    {!creating && <Plus className="w-4 h-4" />}
                                    Бүртгэх
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Customer Detail Modal */}
            {isDetailOpen && selectedCustomer && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center">
                                    <User className="w-6 h-6 text-brand-strong" />
                                </div>
                                <div>
                                    <h2 className="heading-section text-lg text-foreground">
                                        {selectedCustomer.name || 'Харилцагч'}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        Бүртгэсэн: {formatDate(selectedCustomer.created_at)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {editMode ? (
                                    <Button
                                        onClick={saveCustomer}
                                        disabled={saving}
                                        variant="primary"
                                        size="sm"
                                        isLoading={saving}
                                    >
                                        {!saving && <Save className="w-4 h-4" />}
                                        Хадгалах
                                    </Button>
                                ) : (
                                    <Button onClick={() => setEditMode(true)} variant="secondary" size="sm">
                                        <Edit2 className="w-4 h-4" />
                                        Засах
                                    </Button>
                                )}
                                <button
                                    onClick={() => {
                                        setIsDetailOpen(false);
                                        setEditMode(false);
                                    }}
                                    className="p-2 hover:bg-surface-2 rounded-md transition-colors"
                                >
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                        Нэр
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                        />
                                    ) : (
                                        <p className="text-foreground">{selectedCustomer.name || '-'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                        Утас
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="text"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                        />
                                    ) : (
                                        <p className="flex items-center gap-2 text-foreground">
                                            <Phone className="w-4 h-4 text-muted-foreground/70" />
                                            {selectedCustomer.phone || '-'}
                                        </p>
                                    )}
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                                        И-мэйл
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                        />
                                    ) : (
                                        <p className="flex items-center gap-2 text-foreground">
                                            <Mail className="w-4 h-4 text-muted-foreground/70" />
                                            {selectedCustomer.email || '-'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-2">
                                    <Tag className="w-3.5 h-3.5" /> Tags
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedCustomer.tags || []).length > 0 ? (
                                        selectedCustomer.tags!.map((tag) => (
                                            <Badge key={tag} variant="brand" size="md">
                                                {tag}
                                            </Badge>
                                        ))
                                    ) : (
                                        <span className="text-sm text-muted-foreground">Tag байхгүй</span>
                                    )}
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
                                        Тэмдэглэл
                                    </label>
                                    {!notesEditing ? (
                                        <button
                                            onClick={() => {
                                                setNotesDraft(selectedCustomer.notes || '');
                                                setNotesEditing(true);
                                            }}
                                            className="text-xs text-brand hover:underline flex items-center gap-1"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                            Засах
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setNotesEditing(false)}
                                                className="text-xs text-muted-foreground hover:underline"
                                            >
                                                Цуцлах
                                            </button>
                                            <button
                                                onClick={saveNotesOnly}
                                                disabled={notesSaving}
                                                className="text-xs text-brand font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                                            >
                                                <Save className="w-3 h-3" />
                                                {notesSaving ? 'Хадгалж байна...' : 'Хадгалах'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {notesEditing ? (
                                    <textarea
                                        value={notesDraft}
                                        onChange={(e) => setNotesDraft(e.target.value)}
                                        rows={5}
                                        placeholder="Харилцагчийн талаар тэмдэглэл бичих..."
                                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                    />
                                ) : (
                                    <p className="text-foreground bg-surface-2/40 border border-border p-3 rounded-md whitespace-pre-wrap min-h-[60px]">
                                        {selectedCustomer.notes || 'Тэмдэглэл байхгүй'}
                                    </p>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-status-success-soft p-4 rounded-md text-center">
                                    <p className="heading-display text-2xl text-status-success tabular-nums">
                                        {selectedCustomer.message_count || 0}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Харилцсан</p>
                                </div>
                                <div className="bg-status-info-soft p-4 rounded-md text-center">
                                    <p className="heading-display text-2xl text-status-info tabular-nums">
                                        {formatTime(selectedCustomer.created_at)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Бүртгэсэн</p>
                                </div>
                            </div>

                            {/* Service Logs */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-3">
                                    <FileText className="w-3.5 h-3.5" />
                                    Хүсэлт / Гомдол / Бичиг
                                    {selectedCustomer.service_logs && selectedCustomer.service_logs.length > 0 && (
                                        <span className="normal-case tracking-normal text-muted-foreground/70">
                                            ({selectedCustomer.service_logs.length})
                                        </span>
                                    )}
                                </label>

                                {/* New entry form */}
                                <div className="bg-surface-2/40 border border-border rounded-md p-3 space-y-2 mb-3">
                                    <div className="flex flex-wrap gap-2">
                                        {(['complaint', 'inquiry', 'other'] as ServiceLogType[]).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setLogForm((f) => ({ ...f, type: t }))}
                                                className={cn(
                                                    'px-3 py-1 rounded-md text-xs font-medium transition-colors border',
                                                    logForm.type === t
                                                        ? 'bg-brand text-brand-fg border-brand'
                                                        : 'bg-surface text-muted-foreground border-border hover:bg-surface-2',
                                                )}
                                            >
                                                {SERVICE_LOG_TYPE_LABELS[t]}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        value={logForm.subject}
                                        onChange={(e) => setLogForm((f) => ({ ...f, subject: e.target.value }))}
                                        placeholder="Гарчиг (заавал)"
                                        className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                    />
                                    <textarea
                                        value={logForm.description}
                                        onChange={(e) => setLogForm((f) => ({ ...f, description: e.target.value }))}
                                        placeholder="Дэлгэрэнгүй текст (хүсэлт / гомдол / бичгийн агуулга)"
                                        rows={3}
                                        className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                                    />
                                    {logError && (
                                        <p className="flex items-center gap-1 text-xs text-status-danger">
                                            <AlertCircle className="w-3 h-3" /> {logError}
                                        </p>
                                    )}
                                    <Button
                                        type="button"
                                        onClick={submitServiceLog}
                                        disabled={logSubmitting || !logForm.subject.trim()}
                                        isLoading={logSubmitting}
                                        variant="primary"
                                        size="sm"
                                    >
                                        {!logSubmitting && <Plus className="w-4 h-4" />}
                                        Бүртгэх
                                    </Button>
                                </div>

                                {/* History */}
                                {selectedCustomer.service_logs && selectedCustomer.service_logs.length > 0 ? (
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {selectedCustomer.service_logs.map((log) => (
                                            <div
                                                key={log.id}
                                                className="border border-border rounded-md p-3 hover:border-border-strong transition-colors bg-surface"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge
                                                            variant={SERVICE_LOG_TYPE_VARIANT[log.type] || 'default'}
                                                            size="sm"
                                                        >
                                                            {SERVICE_LOG_TYPE_LABELS[log.type] || log.type}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {SERVICE_LOG_STATUS_LABELS[log.status] || log.status}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground/70">
                                                        {formatDate(log.created_at)}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-foreground">{log.subject}</p>
                                                {log.description && (
                                                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                                        {log.description}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Бүртгэгдсэн хүсэлт / гомдол / бичиг байхгүй
                                    </p>
                                )}
                            </div>

                            {/* Recent Chat */}
                            {selectedCustomer.chat_history && selectedCustomer.chat_history.length > 0 && (
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-2">
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        Сүүлийн харилцаа
                                    </label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto bg-surface-2/40 border border-border p-3 rounded-md">
                                        {selectedCustomer.chat_history.slice(0, 5).map((chat, i) => (
                                            <div key={i} className="text-sm">
                                                <p className="text-muted-foreground">
                                                    <span className="font-medium text-foreground">Хэрэглэгч:</span>{' '}
                                                    {chat.message}
                                                </p>
                                                <p className="text-brand">
                                                    <span className="font-medium">AI:</span> {chat.response}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
