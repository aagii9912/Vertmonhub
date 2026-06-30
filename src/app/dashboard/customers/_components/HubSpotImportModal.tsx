'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ImportPreview {
    total: number;
    sample: Array<{ name: string; email: string | null; phone: string | null; tags: string[] }>;
}

interface ImportResult {
    imported: number;
    skipped: number;
    errors: Array<{ name: string; reason: string }>;
}

interface HubSpotImportModalProps {
    open: boolean;
    importFile: File | null;
    setImportFile: React.Dispatch<React.SetStateAction<File | null>>;
    importPreview: ImportPreview | null;
    setImportPreview: React.Dispatch<React.SetStateAction<ImportPreview | null>>;
    importing: boolean;
    importError: string | null;
    importResult: ImportResult | null;
    onClose: () => void;
    onPreview: () => void;
    onConfirm: () => void;
}

export function HubSpotImportModal({
    open,
    importFile,
    setImportFile,
    importPreview,
    setImportPreview,
    importing,
    importError,
    importResult,
    onClose,
    onPreview,
    onConfirm,
}: HubSpotImportModalProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent showCloseButton className="rounded-xl sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-0">
                    <DialogTitle className="heading-section text-lg text-foreground">HubSpot CSV импорт</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
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
                                <Button variant="secondary" size="sm" onClick={onClose}>Цуцлах</Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={onPreview}
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
                                    onClick={onConfirm}
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
                                <p className="flex items-center gap-1.5 text-status-success font-medium">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Импорт амжилттай боллоо
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
                                <Button variant="primary" size="sm" onClick={onClose}>Хаах</Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
