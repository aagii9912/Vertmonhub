'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterSelect } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import {
    User,
    Clock,
    Plus,
    AlertCircle,
    Upload,
    Cloud,
    Users,
    RefreshCw,
    Star,
} from 'lucide-react';
import { formatShortDate } from '@/lib/utils/date';
import { CustomerDetailSheet } from './_components/CustomerDetailSheet';
import { CreateCustomerModal } from './_components/CreateCustomerModal';
import { HubSpotImportModal } from './_components/HubSpotImportModal';
import { HubSpotSyncModal } from './_components/HubSpotSyncModal';

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

type LifecycleStage =
    | 'prospect' | 'engaged' | 'qualified' | 'viewing' | 'negotiating' | 'won' | 'lost' | 'dormant';

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
    quality_score?: number;
    quality_tier?: 'A' | 'B' | 'C' | null;
    lifecycle_stage?: LifecycleStage | null;
    chat_history?: Array<{ message: string; response: string; created_at: string }>;
    service_logs?: ServiceLogEntry[];
}

const STAGE_LABELS: Record<LifecycleStage, string> = {
    prospect: 'Шинэ сонирхогч',
    engaged: 'Идэвхтэй',
    qualified: 'Шалгарсан',
    viewing: 'Үзлэг',
    negotiating: 'Хэлэлцээр',
    won: 'Амжилттай',
    lost: 'Алдсан',
    dormant: 'Идэвхгүй',
};

const STAGE_VARIANT: Record<LifecycleStage, 'info' | 'danger' | 'warning' | 'success' | 'brand' | 'default'> = {
    prospect: 'default',
    engaged: 'info',
    qualified: 'info',
    viewing: 'warning',
    negotiating: 'brand',
    won: 'success',
    lost: 'danger',
    dormant: 'default',
};

const TIER_VARIANT: Record<'A' | 'B' | 'C', 'success' | 'warning' | 'default'> = {
    A: 'success',
    B: 'warning',
    C: 'default',
};

const PREDEFINED_TAGS = ['New', 'Lead', 'Inactive', 'Hot', 'Regular'];

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [tierFilter, setTierFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [recomputing, setRecomputing] = useState(false);

    const [health, setHealth] = useState<{
        total: number;
        newThisMonth: number;
        dormant: number;
        avgQualityScore: number;
        tiers: { A: number; B: number; C: number };
        needFollowup: number;
        avgDaysToConvert: number | null;
    } | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // Давхардал нэгтгэх
    const [mergeMode, setMergeMode] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [merging, setMerging] = useState(false);
    const [mergeError, setMergeError] = useState<string | null>(null);

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
    }, [selectedTag, sortBy, tierFilter, stageFilter]);

    useEffect(() => {
        fetchHealth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchHealth() {
        try {
            const res = await fetch('/api/dashboard/customer-health', {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            if (!res.ok) throw new Error('Failed to fetch customer health');
            const data = await res.json();
            setHealth(data.health || null);
        } catch (error) {
            console.error('Failed to fetch customer health:', error);
        }
    }

    async function fetchCustomers() {
        try {
            setLoading(true);
            setLoadError(false);
            const params = new URLSearchParams();
            if (selectedTag) params.set('tag', selectedTag);
            if (tierFilter) params.set('tier', tierFilter);
            if (stageFilter) params.set('stage', stageFilter);
            params.set('sortBy', sortBy);

            const res = await fetch(`/api/dashboard/customers?${params}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            if (!res.ok) throw new Error('Харилцагчдын мэдээлэл татаж чадсангүй');
            const data = await res.json();
            setCustomers(data.customers || []);
        } catch (error) {
            console.error('Failed to fetch customers:', error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }

    async function recomputeScores() {
        setRecomputing(true);
        try {
            const res = await fetch('/api/dashboard/customers/recompute-scores', {
                method: 'POST',
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            if (res.ok) {
                await Promise.all([fetchCustomers(), fetchHealth()]);
            }
        } catch (error) {
            console.error('Failed to recompute scores:', error);
        } finally {
            setRecomputing(false);
        }
    }

    async function fetchCustomerDetail(id: string) {
        try {
            const res = await fetch(`/api/dashboard/customers/${id}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
            });
            if (!res.ok) throw new Error('Харилцагчийн мэдээлэл татаж чадсангүй');
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
            toast.error('Харилцагчийн мэдээлэл татахад алдаа гарлаа');
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

    async function submitMerge() {
        if (!selectedCustomer || !mergeTargetId) return;
        setMerging(true);
        setMergeError(null);
        try {
            const res = await fetch('/api/dashboard/customers/merge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({
                    primaryId: selectedCustomer.id,
                    duplicateId: mergeTargetId,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Нэгтгэхэд алдаа гарлаа');
            }
            setMergeMode(false);
            setMergeTargetId('');
            await fetchCustomers();
            await fetchCustomerDetail(selectedCustomer.id);
        } catch (err) {
            setMergeError(err instanceof Error ? err.message : 'Нэгтгэхэд алдаа гарлаа');
        } finally {
            setMerging(false);
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
            const res = await fetch('/api/dashboard/customers', {
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
            if (!res.ok) {
                toast.error('Хадгалахад алдаа гарлаа');
                return;
            }
            toast.success('Хадгаллаа');
            setEditMode(false);
            fetchCustomers();
            fetchCustomerDetail(selectedCustomer.id);
        } catch (error) {
            console.error('Failed to save customer:', error);
            toast.error('Хадгалахад алдаа гарлаа');
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
        return formatShortDate(date);
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

    const columns: DataTableColumn<Customer>[] = [
        {
            key: 'customer',
            header: 'Харилцагч',
            cell: (customer) => (
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
            ),
        },
        {
            key: 'quality',
            header: 'Чанар',
            cell: (customer) => (
                <div className="flex items-center gap-2">
                    {customer.quality_tier ? (
                        <Badge variant={TIER_VARIANT[customer.quality_tier]} size="sm">
                            <Star className="w-3 h-3" />
                            {customer.quality_score ?? 0} · {customer.quality_tier}
                        </Badge>
                    ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                    {customer.lifecycle_stage && (
                        <Badge variant={STAGE_VARIANT[customer.lifecycle_stage]} size="sm">
                            {STAGE_LABELS[customer.lifecycle_stage]}
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: 'tags',
            header: 'Tags',
            cell: (customer) => (
                <div className="flex flex-wrap gap-1">
                    {(customer.tags || []).map((tag) => (
                        <Badge key={tag} variant="brand" size="sm">
                            {tag}
                        </Badge>
                    ))}
                </div>
            ),
        },
        {
            key: 'last_contact',
            header: 'Сүүлд харьцсан',
            cell: (customer) => (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 text-muted-foreground/70" />
                    {formatTime(customer.last_contact_at || customer.created_at)}
                </div>
            ),
        },
        {
            key: 'message_count',
            header: 'Харилцсан',
            align: 'right',
            cell: (customer) => (
                <span className="text-sm text-muted-foreground tabular-nums">
                    {customer.message_count || 0} удаа
                </span>
            ),
        },
    ];

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
                        <Button variant="secondary" size="sm" onClick={recomputeScores} isLoading={recomputing}>
                            {!recomputing && <RefreshCw className="w-4 h-4" />}
                            Скор шинэчлэх
                        </Button>
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

            {health && health.total > 0 && (
                <StatBar columns={4}>
                    <StatTile
                        label="Нийт харилцагч"
                        value={health.total}
                        helper={`Энэ сард +${health.newThisMonth}`}
                        icon={<Users className="w-5 h-5" />}
                        accent="brand"
                    />
                    <StatTile
                        label="Дундаж чанар"
                        value={health.avgQualityScore}
                        helper={`A: ${health.tiers.A} · B: ${health.tiers.B} · C: ${health.tiers.C}`}
                        icon={<Star className="w-5 h-5" />}
                        accent="success"
                    />
                    <StatTile
                        label="Дагах шаардлагатай"
                        value={health.needFollowup}
                        helper="Чимээгүй чанартай харилцагч"
                        icon={<Clock className="w-5 h-5" />}
                        accent="warning"
                    />
                    <StatTile
                        label="Идэвхгүй (dormant)"
                        value={health.dormant}
                        helper={health.avgDaysToConvert !== null ? `Хөрвөх дундаж: ${health.avgDaysToConvert} хон.` : 'Идэвхжүүлэх боломжтой'}
                        icon={<AlertCircle className="w-5 h-5" />}
                        accent="danger"
                    />
                </StatBar>
            )}

            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэр, утсаар хайх...',
                }}
                showClear={searchQuery !== '' || selectedTag !== null || tierFilter !== '' || stageFilter !== '' || sortBy !== 'created_at'}
                onClear={() => {
                    setSearchQuery('');
                    setSelectedTag(null);
                    setTierFilter('');
                    setStageFilter('');
                    setSortBy('created_at');
                }}
            >
                <FilterSelect
                    label="Tag"
                    value={selectedTag || ''}
                    onChange={(e) => setSelectedTag(e.target.value || null)}
                >
                    <option value="">Бүх Tag</option>
                    {Array.from(new Set([
                        ...PREDEFINED_TAGS,
                        ...customers.flatMap((c) => ((c as { tags?: string[] }).tags) || []),
                    ])).sort().map((tag) => (
                        <option key={tag} value={tag}>
                            {tag}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Чанар" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
                    <option value="">Бүх түвшин</option>
                    <option value="A">A (өндөр)</option>
                    <option value="B">B (дунд)</option>
                    <option value="C">C (бага)</option>
                </FilterSelect>
                <FilterSelect label="Шат" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                    <option value="">Бүх шат</option>
                    {(Object.keys(STAGE_LABELS) as LifecycleStage[]).map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Эрэмбэлэх" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="created_at">Бүртгэсэн огноо</option>
                    <option value="last_contact_at">Сүүлд харьцсан</option>
                    <option value="quality_score">Чанарын оноо</option>
                </FilterSelect>
            </FilterBar>

            {loading ? (
                <Card>
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                </Card>
            ) : loadError ? (
                <Card>
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <AlertCircle className="w-8 h-8 text-status-danger" />
                        <p className="text-sm text-muted-foreground">Харилцагчдын мэдээлэл татахад алдаа гарлаа</p>
                        <Button variant="secondary" size="sm" onClick={fetchCustomers}>Дахин оролдох</Button>
                    </div>
                </Card>
            ) : filteredCustomers.length === 0 ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<User className="w-7 h-7" />} title="Харилцагч олдсонгүй" />
                    </div>
                </Card>
            ) : (
                <DataTable
                    columns={columns}
                    data={filteredCustomers}
                    getRowId={(c) => c.id}
                    caption="Харилцагчдын хүснэгт"
                    onRowClick={(customer) => fetchCustomerDetail(customer.id)}
                    pageSize={filteredCustomers.length || 1}
                    hidePagination
                    showDensityToggle={false}
                />
            )}

            {/* HubSpot Direct Sync Modal */}
            <HubSpotSyncModal
                open={isHubspotSyncOpen}
                hubspotToken={hubspotToken}
                setHubspotToken={setHubspotToken}
                hubspotSaveToken={hubspotSaveToken}
                setHubspotSaveToken={setHubspotSaveToken}
                hubspotPreview={hubspotPreview}
                setHubspotPreview={setHubspotPreview}
                hubspotSyncing={hubspotSyncing}
                hubspotError={hubspotError}
                hubspotResult={hubspotResult}
                onClose={resetHubspotSync}
                onPreview={previewHubspot}
                onConfirm={confirmHubspotSync}
            />

            {/* HubSpot Import Modal */}
            <HubSpotImportModal
                open={isImportOpen}
                importFile={importFile}
                setImportFile={setImportFile}
                importPreview={importPreview}
                setImportPreview={setImportPreview}
                importing={importing}
                importError={importError}
                importResult={importResult}
                onClose={resetImport}
                onPreview={previewImport}
                onConfirm={confirmImport}
            />

            {/* Create Customer Modal */}
            <CreateCustomerModal
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                createForm={createForm}
                setCreateForm={setCreateForm}
                creating={creating}
                createError={createError}
                setCreateError={setCreateError}
                onSubmit={createCustomer}
            />

            {/* Customer Detail Sheet */}
            {isDetailOpen && selectedCustomer && (
                <CustomerDetailSheet
                    open={isDetailOpen}
                    onClose={() => {
                        setIsDetailOpen(false);
                        setEditMode(false);
                        setMergeMode(false);
                    }}
                    selectedCustomer={selectedCustomer}
                    customers={customers}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    saving={saving}
                    onSaveCustomer={saveCustomer}
                    mergeMode={mergeMode}
                    setMergeMode={setMergeMode}
                    mergeTargetId={mergeTargetId}
                    setMergeTargetId={setMergeTargetId}
                    mergeError={mergeError}
                    setMergeError={setMergeError}
                    merging={merging}
                    onSubmitMerge={submitMerge}
                    notesEditing={notesEditing}
                    setNotesEditing={setNotesEditing}
                    notesDraft={notesDraft}
                    setNotesDraft={setNotesDraft}
                    notesSaving={notesSaving}
                    onSaveNotesOnly={saveNotesOnly}
                    logForm={logForm}
                    setLogForm={setLogForm}
                    logSubmitting={logSubmitting}
                    logError={logError}
                    onSubmitServiceLog={submitServiceLog}
                    formatDate={formatDate}
                    formatTime={formatTime}
                />
            )}
        </div>
    );
}
