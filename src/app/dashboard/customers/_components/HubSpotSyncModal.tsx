'use client';

import { AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface HubspotPreview {
    sample: Array<{ id: string; name: string; email: string | null; phone: string | null; lifecycle: string | null; lead_status: string | null }>;
    has_more: boolean;
}

interface HubspotResult {
    total: number;
    imported: number;
    skipped: number;
    errors: Array<{ name: string; reason: string }>;
}

interface HubSpotSyncModalProps {
    open: boolean;
    hubspotToken: string;
    setHubspotToken: React.Dispatch<React.SetStateAction<string>>;
    hubspotSaveToken: boolean;
    setHubspotSaveToken: React.Dispatch<React.SetStateAction<boolean>>;
    hubspotPreview: HubspotPreview | null;
    setHubspotPreview: React.Dispatch<React.SetStateAction<HubspotPreview | null>>;
    hubspotSyncing: boolean;
    hubspotError: string | null;
    hubspotResult: HubspotResult | null;
    onClose: () => void;
    onPreview: () => void;
    onConfirm: () => void;
}

export function HubSpotSyncModal({
    open,
    hubspotToken,
    setHubspotToken,
    hubspotSaveToken,
    setHubspotSaveToken,
    hubspotPreview,
    setHubspotPreview,
    hubspotSyncing,
    hubspotError,
    hubspotResult,
    onClose,
    onPreview,
    onConfirm,
}: HubSpotSyncModalProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent showCloseButton className="rounded-xl sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-0">
                    <DialogTitle className="heading-section text-lg text-foreground">HubSpot-аас шууд татах</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {!hubspotPreview && !hubspotResult && (
                        <>
                            <div className="bg-status-info-soft p-3 rounded-md text-sm text-status-info space-y-1">
                                <p className="font-medium">HubSpot Private App token хэрхэн авах:</p>
                                <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                                    <li>
                                        HubSpot → Settings (
                                        <Settings className="inline w-3 h-3 align-text-bottom" />
                                        ) → Integrations → <strong>Private Apps</strong>
                                    </li>
                                    <li>&quot;Create a private app&quot; дарна</li>
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
                                <Button variant="secondary" size="sm" onClick={onClose}>Цуцлах</Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={onPreview}
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
                            <div className="flex items-center gap-1.5 bg-status-success-soft p-3 rounded-md text-sm text-status-success">
                                <CheckCircle2 className="w-4 h-4 shrink-0" /> Token хүчинтэй. Эхний {hubspotPreview.sample.length} contact:
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
                                    onClick={onConfirm}
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
                                <p className="flex items-center gap-1.5 text-status-success font-medium">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" /> HubSpot sync амжилттай боллоо
                                </p>
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
                                <Button variant="primary" size="sm" onClick={onClose}>Хаах</Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
