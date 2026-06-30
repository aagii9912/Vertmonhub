'use client';

import {
    User,
    Phone,
    Mail,
    Tag,
    MessageSquare,
    Edit2,
    Save,
    FileText,
    AlertCircle,
    Users,
    X,
} from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
} from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ServiceLogForm } from './ServiceLogForm';

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
    quality_score?: number;
    quality_tier?: 'A' | 'B' | 'C' | null;
    lifecycle_stage?: string | null;
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

interface EditForm {
    name: string;
    phone: string;
    email: string;
    notes: string;
}

interface CustomerDetailSheetProps {
    open: boolean;
    onClose: () => void;
    selectedCustomer: Customer;
    customers: Customer[];

    editMode: boolean;
    setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
    editForm: EditForm;
    setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
    saving: boolean;
    onSaveCustomer: () => void;

    mergeMode: boolean;
    setMergeMode: React.Dispatch<React.SetStateAction<boolean>>;
    mergeTargetId: string;
    setMergeTargetId: React.Dispatch<React.SetStateAction<string>>;
    mergeError: string | null;
    setMergeError: React.Dispatch<React.SetStateAction<string | null>>;
    merging: boolean;
    onSubmitMerge: () => void;

    notesEditing: boolean;
    setNotesEditing: React.Dispatch<React.SetStateAction<boolean>>;
    notesDraft: string;
    setNotesDraft: React.Dispatch<React.SetStateAction<string>>;
    notesSaving: boolean;
    onSaveNotesOnly: () => void;

    logForm: { type: ServiceLogType; subject: string; description: string };
    setLogForm: React.Dispatch<React.SetStateAction<{ type: ServiceLogType; subject: string; description: string }>>;
    logSubmitting: boolean;
    logError: string | null;
    onSubmitServiceLog: () => void;

    formatDate: (date: string | null) => string;
    formatTime: (date: string | null) => string;
}

export function CustomerDetailSheet({
    open,
    onClose,
    selectedCustomer,
    customers,
    editMode,
    setEditMode,
    editForm,
    setEditForm,
    saving,
    onSaveCustomer,
    mergeMode,
    setMergeMode,
    mergeTargetId,
    setMergeTargetId,
    mergeError,
    setMergeError,
    merging,
    onSubmitMerge,
    notesEditing,
    setNotesEditing,
    notesDraft,
    setNotesDraft,
    notesSaving,
    onSaveNotesOnly,
    logForm,
    setLogForm,
    logSubmitting,
    logError,
    onSubmitServiceLog,
    formatDate,
    formatTime,
}: CustomerDetailSheetProps) {
    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <SheetContent side="right" className="w-full sm:max-w-2xl p-0 gap-0 overflow-y-auto" showCloseButton={false}>
                {/* Header */}
                <SheetHeader className="flex-row items-center justify-between gap-3 space-y-0 p-6">
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
                                onClick={onSaveCustomer}
                                disabled={saving}
                                variant="primary"
                                size="sm"
                                isLoading={saving}
                            >
                                {!saving && <Save className="w-4 h-4" />}
                                Хадгалах
                            </Button>
                        ) : (
                            <>
                                <Button onClick={() => setEditMode(true)} variant="secondary" size="sm">
                                    <Edit2 className="w-4 h-4" />
                                    Засах
                                </Button>
                                <Button
                                    onClick={() => { setMergeMode((m) => !m); setMergeError(null); setMergeTargetId(''); }}
                                    variant="secondary"
                                    size="sm"
                                >
                                    <Users className="w-4 h-4" />
                                    Нэгтгэх
                                </Button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-surface-2 rounded-md transition-colors"
                            aria-label="Хаах"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                            <span className="sr-only">Хаах</span>
                        </button>
                    </div>
                </SheetHeader>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Давхардал нэгтгэх panel */}
                    {mergeMode && (
                        <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
                            <div className="flex items-start gap-2">
                                <Users className="w-4 h-4 text-brand-strong mt-0.5" />
                                <div className="text-sm text-muted-foreground">
                                    Энэ харилцагч руу нэгтгэх <span className="font-medium text-foreground">давхардсан</span> харилцагчийг сонгоно уу.
                                    Сонгосон харилцагчийн бүх холбоо энд шилжээд устана.
                                </div>
                            </div>
                            {mergeError && (
                                <p className="text-sm text-status-danger flex items-center gap-1">
                                    <AlertCircle className="w-4 h-4" />{mergeError}
                                </p>
                            )}
                            <div className="flex items-center gap-2">
                                <select
                                    value={mergeTargetId}
                                    onChange={(e) => setMergeTargetId(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-border-strong rounded-lg text-sm bg-surface"
                                >
                                    <option value="">— Давхардсан харилцагч сонгох —</option>
                                    {customers
                                        .filter((c) => c.id !== selectedCustomer.id)
                                        .map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {(c.name || 'Нэргүй')}{c.phone ? ` · ${c.phone}` : ''}
                                            </option>
                                        ))}
                                </select>
                                <Button
                                    onClick={onSubmitMerge}
                                    disabled={!mergeTargetId || merging}
                                    isLoading={merging}
                                    variant="primary"
                                    size="sm"
                                >
                                    Нэгтгэх
                                </Button>
                            </div>
                        </div>
                    )}
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
                                        onClick={onSaveNotesOnly}
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
                        <ServiceLogForm
                            logForm={logForm}
                            setLogForm={setLogForm}
                            logSubmitting={logSubmitting}
                            logError={logError}
                            onSubmit={onSubmitServiceLog}
                        />

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
            </SheetContent>
        </Sheet>
    );
}
