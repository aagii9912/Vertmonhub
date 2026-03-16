'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X, Building2, Home, CreditCard, Landmark, Sparkles, HelpCircle, TreePine, Info } from 'lucide-react';

// ============================================
// TYPES
// ============================================

type ImportType = 'properties' | 'faq' | 'company' | 'project' | 'payment_policy' | 'loan_info' | 'amenities' | 'ai_extra';

interface ImportOption {
    value: ImportType;
    label: string;
    labelMN: string;
    description: string;
    icon: any;
    color: string;
}

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    errors?: string[];
    message: string;
}

// ============================================
// CONSTANTS
// ============================================

const IMPORT_OPTIONS: ImportOption[] = [
    {
        value: 'properties',
        label: 'Properties',
        labelMN: 'Байрны мэдээлэл',
        description: 'Байрны нэр, блок, давхар, өрөө, талбай, үнэ, статус',
        icon: Home,
        color: 'from-blue-500 to-cyan-500',
    },
    {
        value: 'company',
        label: 'Company',
        labelMN: 'Компанийн мэдээлэл',
        description: 'Нэр, утас, имэйл, вэб, хаяг, соц.сүлжээ',
        icon: Building2,
        color: 'from-violet-500 to-purple-500',
    },
    {
        value: 'project',
        label: 'Project',
        labelMN: 'Төслийн мэдээлэл',
        description: 'Төслийн нэр, байршил, блок, давхар, барилгын явц',
        icon: TreePine,
        color: 'from-emerald-500 to-green-500',
    },
    {
        value: 'faq',
        label: 'FAQ',
        labelMN: 'Түгээмэл асуулт',
        description: 'Асуулт-хариулт (AI chatbot-д зориулсан)',
        icon: HelpCircle,
        color: 'from-orange-500 to-amber-500',
    },
    {
        value: 'payment_policy',
        label: 'Payment Policy',
        labelMN: 'Төлбөрийн бодлого',
        description: 'Урьдчилгаа, хөнгөлөлт, хасагчлах хугацаа',
        icon: CreditCard,
        color: 'from-pink-500 to-rose-500',
    },
    {
        value: 'loan_info',
        label: 'Loan Info',
        labelMN: 'Зээлийн мэдээлэл',
        description: 'Банк, хүү, хугацаа, 8% хөтөлбөр',
        icon: Landmark,
        color: 'from-teal-500 to-cyan-500',
    },
    {
        value: 'amenities',
        label: 'Amenities',
        labelMN: 'Тохилог / Онцлог',
        description: 'Лифт, паркинг, хамгаалалт, gym гэх мэт',
        icon: Sparkles,
        color: 'from-indigo-500 to-blue-500',
    },
    {
        value: 'ai_extra',
        label: 'AI Extra',
        labelMN: 'AI нэмэлт мэдээлэл',
        description: 'Менежерийн утас, ажлын цаг, бусад',
        icon: Info,
        color: 'from-gray-500 to-slate-500',
    },
];

// ============================================
// COMPONENT
// ============================================

export default function ImportTab() {
    const [selectedType, setSelectedType] = useState<ImportType | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [importing, setImporting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---- File handlers ----
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && isValidFile(droppedFile)) {
            setFile(droppedFile);
            setResult(null);
        }
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected && isValidFile(selected)) {
            setFile(selected);
            setResult(null);
        }
    };

    const isValidFile = (f: File): boolean => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ['xlsx', 'xls', 'csv'].includes(ext || '');
    };

    // ---- Template download ----
    const downloadTemplate = async (type: ImportType) => {
        setDownloading(true);
        try {
            const res = await fetch(`/api/admin/import/templates?type=${type}`);
            if (!res.ok) throw new Error('Template татах алдаа');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}_template.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setResult({ success: false, message: err.message });
        } finally {
            setDownloading(false);
        }
    };

    // ---- Import ----
    const handleImport = async () => {
        if (!selectedType || !file) return;
        setImporting(true);
        setResult(null);

        try {
            // Get shopId
            const shopRes = await fetch('/api/shop');
            const shopData = await shopRes.json();
            const shopId = shopData.shop?.id;
            if (!shopId) throw new Error('Shop олдсонгүй');

            const formData = new FormData();
            formData.append('file', file);
            formData.append('shopId', shopId);
            formData.append('type', selectedType);

            const res = await fetch('/api/admin/import', { method: 'POST', body: formData });
            const data = await res.json();

            if (!res.ok) {
                setResult({ success: false, message: data.error || 'Алдаа гарлаа', errors: data.errors });
            } else {
                setResult(data);
            }
        } catch (err: any) {
            setResult({ success: false, message: err.message });
        } finally {
            setImporting(false);
        }
    };

    const resetState = () => {
        setFile(null);
        setResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const selectedOption = IMPORT_OPTIONS.find(o => o.value === selectedType);

    return (
        <div className="space-y-6">
            {/* Step 1: Select Type */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">1. Import төрөл сонгох</h3>
                <p className="text-sm text-gray-500 mb-4">PDF маягтын хэсгүүдэд тохирсон өгөгдлийн төрөл</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {IMPORT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const isSelected = selectedType === option.value;
                        return (
                            <button
                                key={option.value}
                                onClick={() => { setSelectedType(option.value); resetState(); }}
                                className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200
                                    ${isSelected
                                        ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${option.color} flex items-center justify-center mb-2`}>
                                    <Icon className="w-5 h-5 text-white" />
                                </div>
                                <div className="font-medium text-gray-900 text-sm">{option.labelMN}</div>
                                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{option.description}</div>
                                {isSelected && (
                                    <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Step 2: Template & Upload (shown after type selection) */}
            {selectedType && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Template download */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">2. Template татах & Файл оруулах</h3>
                        <p className="text-sm text-gray-500 mb-3">
                            Эхлээд template татаж, мэдээллээ бөглөөд буцааж upload хийнэ үү
                        </p>

                        <button
                            onClick={() => downloadTemplate(selectedType)}
                            disabled={downloading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-green-600 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {selectedOption?.labelMN} Template татах
                        </button>
                    </div>

                    {/* File upload zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                            ${dragging
                                ? 'border-violet-400 bg-violet-50'
                                : file
                                    ? 'border-emerald-300 bg-emerald-50'
                                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleFileSelect}
                        />

                        {file ? (
                            <div className="flex items-center justify-center gap-3">
                                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                    <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-gray-900">{file.name}</p>
                                    <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); resetState(); }}
                                    className="ml-4 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Upload className="w-8 h-8 text-gray-400" />
                                </div>
                                <p className="font-medium text-gray-700">Файлаа энд чирж оруулна уу</p>
                                <p className="text-sm text-gray-500 mt-1">эсвэл дарж сонгоно</p>
                                <p className="text-xs text-gray-400 mt-2">.xlsx, .xls, .csv файлууд</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Import Button */}
            {selectedType && file && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">3. Import эхлүүлэх</h3>
                    
                    <div className="flex items-center gap-4">
                        <div className="flex-1 bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                {selectedOption && (
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedOption.color} flex items-center justify-center`}>
                                        <selectedOption.icon className="w-4 h-4 text-white" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{selectedOption?.labelMN}</p>
                                    <p className="text-xs text-gray-500">{file.name}</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-200 hover:shadow-violet-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Импорт хийж байна...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5" />
                                    Импорт хийх
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className={`rounded-2xl border p-5 animate-in fade-in duration-300 ${
                    result.success
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-red-50 border-red-200'
                }`}>
                    <div className="flex items-start gap-3">
                        {result.success ? (
                            <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                            <p className={`font-semibold ${result.success ? 'text-emerald-800' : 'text-red-800'}`}>
                                {result.success ? 'Амжилттай!' : 'Алдаа!'}
                            </p>
                            <p className={`text-sm mt-1 ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
                                {result.message}
                            </p>

                            {/* Stats */}
                            {result.success && (result.imported || result.updated) && (
                                <div className="flex gap-4 mt-3">
                                    {result.imported !== undefined && result.imported > 0 && (
                                        <div className="px-3 py-1.5 bg-emerald-100 rounded-lg text-sm font-medium text-emerald-700">
                                            +{result.imported} шинэ
                                        </div>
                                    )}
                                    {result.updated !== undefined && result.updated > 0 && (
                                        <div className="px-3 py-1.5 bg-blue-100 rounded-lg text-sm font-medium text-blue-700">
                                            ↻ {result.updated} шинэчлэгдсэн
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Errors */}
                            {result.errors && result.errors.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    <p className="text-sm font-medium text-amber-700">⚠️ Алдаанууд:</p>
                                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                                        {result.errors.map((err, i) => (
                                            <p key={i} className="text-xs text-amber-600 pl-4">• {err}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Info box */}
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Info className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                        <p className="font-medium text-gray-900 text-sm">Ашиглах зааварчилгаа</p>
                        <ul className="text-xs text-gray-600 mt-1.5 space-y-1 list-disc pl-4">
                            <li>Import төрөл сонгоод Template татна уу</li>
                            <li>Template-д мэдээллээ бөглөнө (жишээ мөрийг устгах эсвэл дээрээс нь бичих)</li>
                            <li>Бөглөсөн файлаа upload хийж, Import товч дарна</li>
                            <li>Компани, Төсөл, Зээл зэрэг мэдээлэл аль хэдийн байвал шинэчлэгдэнэ (upsert)</li>
                            <li>Зөвхөн <strong>Super Admin</strong> болон зөвшөөрөгдсөн хүмүүс ашиглах боломжтой</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
