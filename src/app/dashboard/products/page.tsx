'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, X, Upload, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, Product } from '@/hooks/useProducts';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import ProductForm from '@/components/dashboard/products/ProductForm';
import { logger } from '@/lib/utils/logger';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProductsPage() {
    const { data: products = [], isLoading } = useProducts();
    const createProduct = useCreateProduct();
    const updateProduct = useUpdateProduct();
    const deleteProduct = useDeleteProduct();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { t } = useLanguage();

    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [productType, setProductType] = useState<'physical' | 'service' | 'appointment'>('physical');

    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPreview, setImportPreview] = useState<any[]>([]);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        if (showModal) {
            if (editingProduct) {
                setProductType(editingProduct.type || 'physical');
                setImagePreview(editingProduct.images?.[0] || null);
            } else {
                setProductType('physical');
                setImagePreview(null);
            }
            setImageFile(null);
        } else {
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview);
            }
            setImagePreview(null);
        }
    }, [showModal, editingProduct]);

    useEffect(() => {
        return () => {
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const uploadImage = async (file: File) => {
        if (!user) throw new Error(t.products.notLoggedIn);
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/dashboard/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Image upload failed');
        }
        const data = await res.json();
        return data.url;
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    async function handleDelete(id: string) {
        if (!confirm(t.products.confirmDelete)) return;
        try {
            await deleteProduct.mutateAsync(id);
        } catch (error: unknown) {
            logger.error('Failed to delete product:', { error: error });
        }
    }

    async function handleImportFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImportFile(file);
            setImportError(null);
            setImportPreview([]);
            setImporting(true);
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('preview', 'true');
                const res = await fetch('/api/shop/import', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) {
                    setImportError(data.error || 'Preview failed');
                } else {
                    setImportPreview(data.products || []);
                }
            } catch (error: unknown) {
                setImportError(error instanceof Error ? error.message : 'Preview failed');
            } finally {
                setImporting(false);
            }
        }
    }

    async function handleImportConfirm() {
        if (!importFile) return;
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const res = await fetch('/api/shop/import', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) {
                setImportError(data.error || 'Import failed');
            } else {
                alert(`${data.count} ${t.products.importSuccess}`);
                setShowImportModal(false);
                setImportFile(null);
                setImportPreview([]);
                queryClient.invalidateQueries({ queryKey: ['products'] });
            }
        } catch (error: unknown) {
            setImportError(error instanceof Error ? error.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex items-center justify-end gap-1.5">
                <button
                    onClick={() => window.open('/api/dashboard/products/export', '_blank')}
                    className="p-2 md:px-3 md:py-1.5 border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors flex items-center gap-1.5"
                    title="Export Excel"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-white/40" strokeWidth={1.5} />
                    <span className="hidden md:inline text-[12px] font-medium text-foreground tracking-[-0.01em]">Export</span>
                </button>
                <button
                    onClick={() => setShowImportModal(true)}
                    className="p-2 md:px-3 md:py-1.5 border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors flex items-center gap-1.5"
                    title="Import"
                >
                    <Upload className="w-3.5 h-3.5 text-white/40" strokeWidth={1.5} />
                    <span className="hidden md:inline text-[12px] font-medium text-foreground tracking-[-0.01em]">Import</span>
                </button>
                <button
                    onClick={() => { setEditingProduct(null); setShowModal(true); }}
                    className="px-3 py-1.5 bg-foreground text-background rounded-md hover:opacity-80 transition-opacity flex items-center gap-1.5 text-[12px] font-medium tracking-[-0.01em]"
                >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="hidden md:inline">{t.products.addNew}</span>
                    <span className="md:hidden">{t.products.add}</span>
                </button>
            </div>

            {/* Mobile Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredProducts.map((product) => (
                    <div key={product.id} className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-16 h-16 rounded-md bg-[#0F0B2E] flex-shrink-0 overflow-hidden border border-white/[0.08]">
                                {product.images?.[0] ? (
                                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Package className="w-6 h-6 text-white/10" strokeWidth={1.5} />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-medium text-foreground text-[13px] truncate tracking-[-0.01em]">{product.name}</p>
                                        {(product.discount_percent || 0) > 0 ? (
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] text-white/40 line-through">₮{product.price.toLocaleString()}</span>
                                                <span className="text-[13px] font-semibold text-red-500">₮{Math.round(product.price * (1 - product.discount_percent! / 100)).toLocaleString()}</span>
                                            </div>
                                        ) : (
                                            <p className="text-[13px] text-white/50 mt-0.5 tabular-nums">₮{product.price.toLocaleString()}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => { setEditingProduct(product); setShowModal(true); }}
                                            className="p-1.5 hover:bg-[#0F0B2E] rounded-md transition-colors"
                                        >
                                            <Edit2 className="w-3.5 h-3.5 text-white/30" strokeWidth={1.5} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id)}
                                            className="p-1.5 hover:bg-red-900/20 rounded-md transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-red-500" strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#151040] text-white/50">
                                        {product.type === 'service' ? t.products.service : product.type === 'appointment' ? t.products.appointment : t.products.physical}
                                    </span>
                                    {product.type === 'physical' && (() => {
                                        const available = (product.stock || 0) - (product.reserved_stock || 0);
                                        return (
                                            <span className={`text-[11px] ${available > 0 ? 'text-white/40' : 'text-red-500'}`}>
                                                {available > 0 ? `${t.products.stock}: ${available}` : t.products.outOfStock}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-[#0F0B2E] rounded-lg border border-white/[0.08] overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/[0.08]">
                            <th className="text-left px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.productCol}</th>
                            <th className="text-left px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.typeCol}</th>
                            <th className="text-left px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.priceCol}</th>
                            <th className="text-left px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.stockCol}</th>
                            <th className="text-left px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.statusCol}</th>
                            <th className="text-right px-5 py-3 text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.products.actionCol}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {filteredProducts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-5 py-12 text-center">
                                    <Package className="w-10 h-10 text-white/10 mx-auto mb-3" strokeWidth={1.5} />
                                    <p className="text-[13px] text-white/40 tracking-[-0.01em]">{t.products.noProducts}</p>
                                    <p className="text-[11px] text-white/30 mt-1">{t.products.noProductsHint}</p>
                                </td>
                            </tr>
                        ) : (
                            filteredProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-[#0D0928] transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-md bg-[#0F0B2E] flex-shrink-0 overflow-hidden border border-white/[0.08]">
                                                {product.images?.[0] ? (
                                                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Package className="w-4 h-4 text-white/10" strokeWidth={1.5} />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium text-[13px] text-foreground tracking-[-0.01em]">{product.name}</p>
                                                <p className="text-[11px] text-white/40 truncate max-w-[200px]">{product.description}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#151040] text-white/50">
                                            {product.type === 'service' ? t.products.service : product.type === 'appointment' ? t.products.appointment : t.products.physical}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {(product.discount_percent || 0) > 0 ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] text-white/40 line-through tabular-nums">₮{product.price.toLocaleString()}</span>
                                                    <span className="px-1.5 py-0.5 bg-red-900/20 text-red-500 text-[10px] font-medium rounded">-{product.discount_percent}%</span>
                                                </div>
                                                <p className="font-semibold text-[13px] text-red-500 tabular-nums">₮{Math.round(product.price * (1 - product.discount_percent! / 100)).toLocaleString()}</p>
                                            </div>
                                        ) : (
                                            <p className="font-semibold text-[13px] text-foreground tabular-nums">₮{product.price.toLocaleString()}</p>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {product.type === 'physical' ? (
                                            (() => {
                                                const available = (product.stock || 0) - (product.reserved_stock || 0);
                                                return (
                                                    <p className={`font-medium text-[13px] tabular-nums ${available > 0 ? 'text-foreground' : 'text-red-500'}`}>
                                                        {available > 0 ? `${available} ${t.products.pcs}` : t.products.outOfStock}
                                                    </p>
                                                );
                                            })()
                                        ) : (
                                            <span className="text-[12px] text-white/30">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {product.is_active ? (
                                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 text-emerald-400">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                Идэвхтэй
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/40">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                                                {t.products.inactiveStatus}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => { setEditingProduct(product); setShowModal(true); }}
                                                className="p-1.5 hover:bg-[#0F0B2E] rounded-md transition-colors"
                                            >
                                                <Edit2 className="w-3.5 h-3.5 text-white/30" strokeWidth={1.5} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product.id)}
                                                className="p-1.5 hover:bg-red-900/20 rounded-md transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-red-500" strokeWidth={1.5} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto py-10">
                    <div className="bg-[#0A0220] rounded-lg border border-white/[0.08] w-full max-w-2xl p-5 m-4 relative">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.02em]">
                                {editingProduct ? t.products.edit : t.products.newEntry}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-[#0F0B2E] rounded-md transition-colors">
                                <X className="w-4 h-4 text-white/30" strokeWidth={1.5} />
                            </button>
                        </div>

                        <ProductForm
                            product={editingProduct}
                            onSuccess={() => { setShowModal(false); setEditingProduct(null); queryClient.invalidateQueries({ queryKey: ['products'] }); }}
                            onCancel={() => setShowModal(false)}
                        />
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto py-10">
                    <div className="bg-[#0A0220] rounded-lg border border-white/[0.08] w-full max-w-3xl p-5 m-4 relative">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.02em]">
                                {t.products.importFromFile}
                            </h2>
                            <button onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview([]); setImportError(null); }} className="p-1.5 hover:bg-[#0F0B2E] rounded-md transition-colors">
                                <X className="w-4 h-4 text-white/30" strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* File Upload Area */}
                        <div className="border border-dashed border-white/[0.12] rounded-lg p-8 text-center hover:border-[#4A7CE7] transition-colors relative">
                            {importFile ? (
                                <div className="flex items-center justify-center gap-3">
                                    <FileSpreadsheet className="w-6 h-6 text-white/20" strokeWidth={1.5} />
                                    <div className="text-left">
                                        <p className="font-medium text-[13px] text-foreground tracking-[-0.01em]">{importFile.name}</p>
                                        <p className="text-[11px] text-white/40">{(importFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => { setImportFile(null); setImportPreview([]); }} className="ml-4 text-white/30 hover:text-red-500">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <FileSpreadsheet className="w-10 h-10 text-white/10 mx-auto mb-3" strokeWidth={1.5} />
                                    <p className="text-[13px] text-foreground mb-1 tracking-[-0.01em]">{t.products.selectFile}</p>
                                    <p className="text-[11px] text-white/30">xlsx, xls, csv, docx</p>
                                </>
                            )}
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv,.docx"
                                onChange={handleImportFileSelect}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>

                        {importError && (
                            <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-md text-red-400 text-[13px]">
                                {importError}
                            </div>
                        )}

                        {importPreview.length > 0 && (
                            <div className="mt-5">
                                <h3 className="font-medium text-[13px] text-foreground mb-3 tracking-[-0.01em]">{t.products.preview} ({importPreview.length} {t.products.productCol})</h3>
                                <div className="max-h-64 overflow-auto border border-white/[0.08] rounded-md">
                                    <table className="w-full text-[12px]">
                                        <thead>
                                            <tr className="border-b border-white/[0.08]">
                                                <th className="text-left px-3 py-2 font-medium text-white/40 uppercase tracking-[0.05em] text-[10px]">{t.products.name}</th>
                                                <th className="text-left px-3 py-2 font-medium text-white/40 uppercase tracking-[0.05em] text-[10px]">{t.products.type}</th>
                                                <th className="text-left px-3 py-2 font-medium text-white/40 uppercase tracking-[0.05em] text-[10px]">{t.products.price}</th>
                                                <th className="text-left px-3 py-2 font-medium text-white/40 uppercase tracking-[0.05em] text-[10px]">{t.products.quantity}</th>
                                                <th className="text-left px-3 py-2 font-medium text-white/40 uppercase tracking-[0.05em] text-[10px]">{t.products.description}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {importPreview.slice(0, 10).map((p, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-2 text-foreground">{p.name}</td>
                                                    <td className="px-3 py-2">
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#151040] text-white/50">
                                                            {p.type === 'service' ? t.products.service : p.type === 'appointment' ? t.products.appointment : t.products.physical}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-white/50 tabular-nums">₮{p.price?.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-white/50 tabular-nums">{p.stock || 0} {p.unit}</td>
                                                    <td className="px-3 py-2 text-white/40 truncate max-w-[200px]">{p.description || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {importPreview.length > 10 && (
                                    <p className="text-[11px] text-white/30 mt-2">... {t.products.andMore.replace('{count}', String(importPreview.length - 10))}</p>
                                )}
                            </div>
                        )}

                        <div className="mt-5 p-4 bg-[#0D0928] rounded-md border border-white/[0.04]">
                            <h4 className="font-medium text-[12px] text-foreground mb-2 tracking-[-0.01em]">{t.products.formatGuide}</h4>
                            <ul className="text-[11px] text-white/40 space-y-1">
                                <li><strong className="text-foreground">Excel:</strong> {t.products.excelFormat}</li>
                                <li><strong className="text-foreground">Word:</strong> {t.products.wordFormat}</li>
                            </ul>
                        </div>

                        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-white/[0.08]">
                            <button
                                onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview([]); setImportError(null); }}
                                disabled={importing}
                                className="px-3 py-1.5 text-[12px] font-medium border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors text-foreground tracking-[-0.01em]"
                            >
                                {t.orders.cancel}
                            </button>
                            <button
                                onClick={handleImportConfirm}
                                disabled={importing || importPreview.length === 0}
                                className="px-3 py-1.5 text-[12px] font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-50 tracking-[-0.01em]"
                            >
                                {importing ? t.products.importing : `${importPreview.length} ${t.products.importProducts}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
