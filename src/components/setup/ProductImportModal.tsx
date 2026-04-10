'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import {
    Upload, FileSpreadsheet, X, Check,
    AlertCircle, Loader2, Download
} from 'lucide-react';

interface Product {
    name: string;
    price: number;
    description?: string;
    image_url?: string;
}

interface ProductImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (products: Product[]) => Promise<void>;
}

// Parse CSV content
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
        throw new Error('CSV файл хоосон байна');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
        // Handle quoted values
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    });

    return { headers, rows };
}

// Sample CSV template
const SAMPLE_CSV = `name,price,description,image_url
Цамц (Хар),45000,Хар өнгөтэй хөвөн цамц,
Өмд (Цэнхэр),55000,Цэнхэр жинс өмд,
Малгай,15000,Дулаан өвлийн малгай,`;

export function ProductImportModal({ isOpen, onClose, onImport }: ProductImportModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
    const [columnMapping, setColumnMapping] = useState<Record<string, number>>({
        name: -1,
        price: -1,
        description: -1,
        image_url: -1
    });
    const [error, setError] = useState('');
    const [importing, setImporting] = useState(false);
    const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');

    const requiredColumns = ['name', 'price'];
    const optionalColumns = ['description', 'image_url'];

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.csv')) {
            setError('Зөвхөн CSV файл оруулна уу');
            return;
        }

        try {
            const content = await selectedFile.text();
            const parsed = parseCSV(content);

            // Auto-map columns
            const autoMapping: Record<string, number> = {
                name: -1,
                price: -1,
                description: -1,
                image_url: -1
            };

            parsed.headers.forEach((header, index) => {
                const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
                if (normalized.includes('name') || normalized.includes('нэр')) {
                    autoMapping.name = index;
                } else if (normalized.includes('price') || normalized.includes('үнэ')) {
                    autoMapping.price = index;
                } else if (normalized.includes('desc') || normalized.includes('тайлбар')) {
                    autoMapping.description = index;
                } else if (normalized.includes('image') || normalized.includes('зураг')) {
                    autoMapping.image_url = index;
                }
            });

            setFile(selectedFile);
            setParsedData(parsed);
            setColumnMapping(autoMapping);
            setError('');
            setStep('mapping');
        } catch (err: unknown) {
            setError((err instanceof Error ? err.message : String(err)) || 'Файл уншихад алдаа гарлаа');
        }
    };

    const handleColumnMap = (field: string, columnIndex: number) => {
        setColumnMapping(prev => ({ ...prev, [field]: columnIndex }));
    };

    const validateMapping = () => {
        const missing = requiredColumns.filter(col => columnMapping[col] === -1);
        if (missing.length > 0) {
            setError(`Шаардлагатай багана дутуу: ${missing.join(', ')}`);
            return false;
        }
        setError('');
        return true;
    };

    const handleProceedToPreview = () => {
        if (validateMapping()) {
            setStep('preview');
        }
    };

    const getPreviewProducts = (): Product[] => {
        if (!parsedData) return [];

        return parsedData.rows.slice(0, 5).map(row => ({
            name: columnMapping.name >= 0 ? row[columnMapping.name] || '' : '',
            price: columnMapping.price >= 0 ? parseFloat(row[columnMapping.price]) || 0 : 0,
            description: columnMapping.description >= 0 ? row[columnMapping.description] : undefined,
            image_url: columnMapping.image_url >= 0 ? row[columnMapping.image_url] : undefined
        })).filter(p => p.name && p.price > 0);
    };

    const getAllProducts = (): Product[] => {
        if (!parsedData) return [];

        return parsedData.rows.map(row => ({
            name: columnMapping.name >= 0 ? row[columnMapping.name] || '' : '',
            price: columnMapping.price >= 0 ? parseFloat(row[columnMapping.price]) || 0 : 0,
            description: columnMapping.description >= 0 ? row[columnMapping.description] : undefined,
            image_url: columnMapping.image_url >= 0 ? row[columnMapping.image_url] : undefined
        })).filter(p => p.name && p.price > 0);
    };

    const handleImport = async () => {
        const products = getAllProducts();
        if (products.length === 0) {
            setError('Оруулах бүтээгдэхүүн олдсонгүй');
            return;
        }

        setImporting(true);
        try {
            await onImport(products);
            onClose();
        } catch (err: unknown) {
            setError((err instanceof Error ? err.message : String(err)) || 'Import хийхэд алдаа гарлаа');
        } finally {
            setImporting(false);
        }
    };

    const downloadTemplate = () => {
        const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'products_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const resetState = () => {
        setFile(null);
        setParsedData(null);
        setColumnMapping({ name: -1, price: -1, description: -1, image_url: -1 });
        setError('');
        setStep('upload');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-[#0F0B2E] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">CSV Import</h3>
                            <p className="text-xs text-gray-500">
                                {step === 'upload' && 'Файл сонгох'}
                                {step === 'mapping' && 'Багана тохируулах'}
                                {step === 'preview' && 'Урьдчилан харах'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => { resetState(); onClose(); }}
                        className="p-2 hover:bg-gray-100 rounded-full"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    {error && (
                        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-all"
                            >
                                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                                <p className="font-medium text-gray-700">CSV файл оруулах</p>
                                <p className="text-sm text-gray-500 mt-1">Дарж эсвэл чирж оруулна уу</p>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <button
                                onClick={downloadTemplate}
                                className="w-full flex items-center justify-center gap-2 text-sm text-violet-600 hover:text-violet-700 py-2"
                            >
                                <Download className="w-4 h-4" />
                                Загвар файл татах
                            </button>
                        </div>
                    )}

                    {/* Step 2: Column Mapping */}
                    {step === 'mapping' && parsedData && (
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-3 rounded-xl">
                                <p className="text-sm font-medium text-gray-700">
                                    📄 {file?.name} - {parsedData.rows.length} мөр
                                </p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-900">Багана тохируулах:</p>

                                {[...requiredColumns, ...optionalColumns].map(field => (
                                    <div key={field} className="flex items-center gap-3">
                                        <span className={`w-28 text-sm ${requiredColumns.includes(field) ? 'font-medium' : 'text-gray-500'}`}>
                                            {field === 'name' && 'Нэр *'}
                                            {field === 'price' && 'Үнэ *'}
                                            {field === 'description' && 'Тайлбар'}
                                            {field === 'image_url' && 'Зургийн URL'}
                                        </span>
                                        <select
                                            value={columnMapping[field]}
                                            onChange={(e) => handleColumnMap(field, parseInt(e.target.value))}
                                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                        >
                                            <option value={-1}>-- Сонгох --</option>
                                            {parsedData.headers.map((header, idx) => (
                                                <option key={idx} value={idx}>{header}</option>
                                            ))}
                                        </select>
                                        {columnMapping[field] >= 0 && (
                                            <Check className="w-4 h-4 text-green-500" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview */}
                    {step === 'preview' && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-gray-900">
                                Урьдчилан харах ({getAllProducts().length} бүтээгдэхүүн)
                            </p>

                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600">Нэр</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600">Үнэ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {getPreviewProducts().map((product, idx) => (
                                            <tr key={idx}>
                                                <td className="px-3 py-2 text-gray-900">{product.name}</td>
                                                <td className="px-3 py-2 text-right text-gray-600">
                                                    {product.price.toLocaleString()}₮
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {getAllProducts().length > 5 && (
                                <p className="text-xs text-gray-500 text-center">
                                    ... болон {getAllProducts().length - 5} бусад бүтээгдэхүүн
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-4 border-t bg-gray-50">
                    {step === 'upload' && (
                        <Button variant="secondary" className="flex-1" onClick={onClose}>
                            Болих
                        </Button>
                    )}

                    {step === 'mapping' && (
                        <>
                            <Button variant="secondary" onClick={() => setStep('upload')}>
                                Буцах
                            </Button>
                            <Button className="flex-1" onClick={handleProceedToPreview}>
                                Үргэлжлүүлэх
                            </Button>
                        </>
                    )}

                    {step === 'preview' && (
                        <>
                            <Button variant="secondary" onClick={() => setStep('mapping')}>
                                Буцах
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleImport}
                                disabled={importing}
                            >
                                {importing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Import ({getAllProducts().length})
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
