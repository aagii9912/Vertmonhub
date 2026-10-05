'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryImportPreview } from '@/lib/admin/import/units-import';
import { unitCategoryLabel, unitStatusLabel } from '@/lib/inventory/labels';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
    Upload, Building2, MessageSquare, CheckCircle2, AlertCircle,
    Download, Loader2, Users, FileText, CreditCard, MapPin,
    Bot, Landmark, Package, ClipboardList
} from 'lucide-react';

interface ImportCategory {
    type: string;
    label: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    columns: { name: string; required?: boolean }[];
    templateFn: () => string;
}

const IMPORT_CATEGORIES: ImportCategory[] = [
    {
        type: 'units',
        label: 'Блокийн байр',
        desc: 'Блокууд дээр харагдах байр, зогсоол',
        icon: Building2,
        color: 'blue',
        columns: [
            { name: 'Код', required: true },
            { name: 'Блок', required: true },
            { name: 'Бүтээгдэхүүний төрөл', required: true },
            { name: 'Бүтээгдэхүүний төлөв', required: true },
            { name: 'Ээлж' },
            { name: 'Давхар' },
            { name: 'Борлуулах талбай' },
            { name: 'Өрөөний тоо' },
            { name: 'Загвар' },
        ],
        templateFn: () =>
            'Код,Блок,Бүтээгдэхүүний төрөл,Бүтээгдэхүүний төлөв,Давхар,Борлуулах талбай,Өрөөний тоо,Загвар,Цонхны харагдац\n' +
            'Б1-201,Б1,Орон сууц,Худалдаанд,2,95,3,A,Өмнөд\n',
    },
    {
        type: 'properties',
        label: 'Үл хөдлөх',
        desc: 'Зурагтай зарын мэдээлэл',
        icon: Building2,
        color: 'violet',
        columns: [
            { name: 'Нэр', required: true },
            { name: 'Үнэ', required: true },
            { name: 'Төрөл' },
            { name: 'Талбай (м²)' },
            { name: 'Өрөө' },
            { name: 'Давхар' },
            { name: 'Хаяг' },
            { name: 'Дүүрэг' },
            { name: 'Статус' },
            { name: 'Блок' },
        ],
        templateFn: () =>
            'Нэр,Төрөл,Үнэ,Талбай,Өрөө,Унтлагын өрөө,Угаалгын өрөө,Давхар,Хаяг,Дүүрэг,Статус,Блок,Тайлбар,1м² үнэ\n' +
            'A-301 3 өрөө,apartment,380000000,95,3,2,1,3/12,Mandala Garden,Хан-Уул,available,A,Өмнөд харагдацтай,4000000\n',
    },
    {
        type: 'project',
        label: 'Төсөл',
        desc: 'Барилгын төсөл, хороолол',
        icon: Landmark,
        color: 'blue',
        columns: [
            { name: 'Төслийн нэр', required: true },
            { name: 'Байршил' },
            { name: 'Дүүрэг' },
            { name: 'Нийт блок' },
            { name: 'Нийт давхар' },
            { name: 'Нийт байр' },
            { name: 'Барилга эхэлсэн' },
            { name: 'Хүлээлгэх огноо' },
            { name: 'Барилгын явц (%)' },
        ],
        templateFn: () =>
            'Төслийн нэр,Байршил,Дүүрэг,Нийт блокийн тоо,Нийт давхарын тоо,Нийт байрны тоо,Баригдаж эхэлсэн огноо,Хүлээлгэж өгөх огноо,Барилгын явц,Төслийн тайлбар\n' +
            'Mandala Garden,Зайсан,Хан-Уул,3,12,360,2024-03-01,2026-06-01,75%,Luxury хороолол\n',
    },
    {
        type: 'leads',
        label: 'Leads (Сонирхогч)',
        desc: 'Сонирхогч, хэрэглэгчид',
        icon: Users,
        color: 'emerald',
        columns: [
            // Нэр хоосон бол нэргүй лид болно (8+ оронтой утас эсвэл и-мэйл шаардана); утас давхардлын түлхүүр тул заавал.
            { name: 'Нэр' },
            { name: 'Утас', required: true },
            { name: 'Имэйл' },
            { name: 'Сонирхож буй' },
            { name: 'Төсөв' },
            { name: 'Эх сурвалж' },
            { name: 'Тэмдэглэл' },
            { name: 'Статус' },
        ],
        templateFn: () =>
            'Нэр,Утас,Имэйл,Сонирхож буй,Төсөв,Эх сурвалж,Тэмдэглэл,Статус\n' +
            'Бат Болд,99112233,bat@email.com,A-301 3 өрөө,350000000,Facebook,Зээлээр авна,new\n' +
            'Сараа,88001122,,2 өрөө хайж байна,280000000,Танил,Эхний давхрын хүсэхгүй,contacted\n',
    },
    {
        type: 'contracts',
        label: 'Гэрээ',
        desc: 'Худалдааны гэрээ',
        icon: ClipboardList,
        color: 'amber',
        columns: [
            { name: 'Гэрээний дугаар', required: true },
            { name: 'Худалдан авагч', required: true },
            { name: 'Байрны нэр', required: true },
            { name: 'Нийт үнэ', required: true },
            { name: 'Блок' },
            { name: 'Урьдчилгаа' },
            { name: 'Гэрээний огноо' },
            { name: 'Статус' },
            { name: 'Тэмдэглэл' },
        ],
        templateFn: () =>
            'Гэрээний дугаар,Худалдан авагч,Худалдан авагч утас,Блок,Байрны нэр,Нийт үнэ,Урьдчилгаа,Гэрээний огноо,Статус,Тэмдэглэл\n' +
            'MG-2026-001,Бат Болд,99112233,A,A-301,380000000,114000000,2026-01-15,active,Зээлээр\n' +
            'MG-2026-002,Сараа,88001122,B,B-501,280000000,84000000,2026-02-01,closed,Бэлнээр\n',
    },
    {
        type: 'faq',
        label: 'FAQ / Мэдлэгийн сан',
        desc: 'Асуулт-хариулт',
        icon: MessageSquare,
        color: 'pink',
        columns: [
            { name: 'Асуулт', required: true },
            { name: 'Хариулт', required: true },
        ],
        templateFn: () =>
            'Асуулт,Хариулт\n' +
            'Урьдчилгаа хэд вэ?,Нийт үнийн 30% урьдчилгаа төлнө.\n' +
            'Зээлийн хүү хэд вэ?,Жилийн 8-12% хүүтэй.\n',
    },
    {
        type: 'company',
        label: 'Компани',
        desc: 'Компанийн ерөнхий мэдээлэл',
        icon: Package,
        color: 'indigo',
        columns: [
            { name: 'Компанийн бүтэн нэр', required: true },
            { name: 'Утас' },
            { name: 'Имэйл' },
            { name: 'Хаяг' },
            { name: 'Вэбсайт' },
            { name: 'Facebook хуудас' },
        ],
        templateFn: () =>
            'Компанийн бүтэн нэр,Үүсгэн байгуулагдсан он,Утас,Имэйл,Вэбсайт,Хаяг,Facebook хуудас,Instagram хуудас,Компанийн товч танилцуулга\n' +
            'Vertmon LLC,2020,77001122,info@vertmon.mn,vertmon.mn,Улаанбаатар Сүхбаатар дүүрэг,facebook.com/vertmon,instagram.com/vertmon,Үл хөдлөх хөрөнгийн компани\n',
    },
    {
        type: 'payment_policy',
        label: 'Төлбөрийн бодлого',
        desc: 'Урьдчилгаа, хөнгөлөлт',
        icon: CreditCard,
        color: 'cyan',
        columns: [
            { name: 'Төсөл', required: true },
            { name: 'Урьдчилгаа (%)' },
            { name: 'Хэсэгчилсэн төлбөр' },
            { name: 'Хэсэгчлэх хугацаа' },
            { name: 'Бэлнээр хөнгөлөлт (%)' },
        ],
        templateFn: () =>
            'Төсөл,Урьдчилгаа,Хэсэгчилсэн төлбөр,Хэсэгчлэх хугацаа,Бэлнээр хөнгөлөлт,VIP хөнгөлөлт\n' +
            'Mandala Garden,30%,Тийм,12 сар,5%,2%\n',
    },
    {
        type: 'loan_info',
        label: 'Зээлийн мэдээлэл',
        desc: 'Банк, хүү, хугацаа',
        icon: Landmark,
        color: 'teal',
        columns: [
            { name: 'Хамтрагч банкууд' },
            { name: 'Зээлийн хүү' },
            { name: 'Зээлийн хугацаа' },
            { name: '8% зээл хөтөлбөр' },
        ],
        templateFn: () =>
            'Хамтрагч банкууд,Зээлийн хүү,Зээлийн хугацаа,"8% зээл" хөтөлбөр,Шаардлагатай бичиг баримт\n' +
            '"Хаан, Голомт, ХХБ",8-12% жилийн,20 жил,Тийм,"Иргэний үнэмлэх, Цалингийн тодорхойлолт"\n',
    },
    {
        type: 'amenities',
        label: 'Тохилог / Онцлог',
        desc: 'Автозогсоол, хүүхдийн тоглоом гм',
        icon: MapPin,
        color: 'orange',
        columns: [
            { name: 'Төсөл', required: true },
            { name: 'Онцлог', required: true },
            { name: 'Тийм/Үгүй' },
            { name: 'Дэлгэрэнгүй' },
        ],
        templateFn: () =>
            'Төсөл,Онцлог,Тийм/Үгүй,Дэлгэрэнгүй\n' +
            'Mandala Garden,Гадна автозогсоол,Тийм,500 машины\n' +
            'Mandala Garden,Хүүхдийн тоглоомын талбай,Тийм,2 ширхэг\n',
    },
    {
        type: 'ai_extra',
        label: 'AI Нэмэлт мэдээлэл',
        desc: 'AI-д заах нэмэлт мэдээлэл',
        icon: Bot,
        color: 'purple',
        columns: [
            { name: 'Мэдээлэл', required: true },
            { name: 'Утга', required: true },
        ],
        templateFn: () =>
            'Мэдээлэл,Утга\n' +
            'Ажлын цаг,Даваа-Баасан 09:00-18:00\n' +
            'Төлбөрийн арга,Бэлэн/Шилжүүлэг/Зээл\n',
    },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; light: string }> = {
    violet: { bg: 'bg-brand-soft', border: 'border-brand', text: 'text-brand-strong', light: 'bg-brand-soft' },
    blue: { bg: 'bg-status-info-soft', border: 'border-status-info', text: 'text-status-info', light: 'bg-status-info-soft' },
    emerald: { bg: 'bg-status-success-soft', border: 'border-status-success', text: 'text-status-success', light: 'bg-status-success-soft' },
    amber: { bg: 'bg-status-pending-soft', border: 'border-status-pending', text: 'text-status-pending', light: 'bg-status-pending-soft' },
    pink: { bg: 'bg-brand-soft', border: 'border-brand', text: 'text-brand-strong', light: 'bg-brand-soft' },
    indigo: { bg: 'bg-status-info-soft', border: 'border-status-info', text: 'text-status-info', light: 'bg-status-info-soft' },
    cyan: { bg: 'bg-status-info-soft', border: 'border-status-info', text: 'text-status-info', light: 'bg-status-info-soft' },
    teal: { bg: 'bg-status-active-soft', border: 'border-status-active', text: 'text-status-active', light: 'bg-status-active-soft' },
    orange: { bg: 'bg-status-pending-soft', border: 'border-status-pending', text: 'text-status-pending', light: 'bg-status-pending-soft' },
    purple: { bg: 'bg-brand-soft', border: 'border-brand', text: 'text-brand-strong', light: 'bg-brand-soft' },
};

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    skipped?: number;
    errors?: string[];
    notes?: string[];
    message: string;
    preview?: InventoryImportPreview;
}

interface AdminProject {
    id: string;
    name: string;
    shop_id: string;
}

const NO_PROJECTS: AdminProject[] = [];

/** Админы жагсаалт уншина; алдааг хоосон жагсаалт болгож нуухгүй. */
async function fetchAdminList<T>(url: string, field: 'projects', fallbackError: string): Promise<T[]> {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error(data?.error || fallbackError);
    return data[field] || [];
}

export default function AdminImportPage() {
    const queryClient = useQueryClient();
    const { shop, user, refreshShops } = useAuth();
    const [selected, setSelected] = useState<ImportCategory>(IMPORT_CATEGORIES[0]);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [inventoryBlock, setInventoryBlock] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    // Project state
    const projectsKey = ['admin-projects', 'import', shop?.id, user?.id, user?.role];
    const projectsQuery = useQuery({
        meta: { inlineError: true },
        queryKey: projectsKey,
        queryFn: () => fetchAdminList<AdminProject>('/api/admin/projects', 'projects', 'Төслүүд ачаалагдсангүй'),
        enabled: !!user?.id,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const projects = projectsQuery.data ?? NO_PROJECTS;
    const projectsLoading = !projectsQuery.data && projectsQuery.isFetching;
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectLocation, setNewProjectLocation] = useState('');
    const [creatingProject, setCreatingProject] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const listError = (!projectsQuery.isFetching && projectsQuery.error) || null;

    // Импорт, шинэ төсөл бусад админ хуудасны тоо, жагсаалтыг өөрчилнө — дараагийн нээлтэд шинээр уншина.
    const markAdminDataStale = () => {
        for (const domain of ['admin-projects', 'admin-dashboard', 'admin-sales-targets']) {
            void queryClient.invalidateQueries({ queryKey: [domain], refetchType: 'none' });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setResult(null); }
    };

    const handleImport = async (preview = false) => {
        const proj = projects.find(p => p.id === selectedProject);
        if (!file || !proj || loading || creatingProject) return;
        setLoading(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('shopId', proj.shop_id);
            formData.append('projectId', proj.id);
            formData.append('projectName', proj.name);
            formData.append('type', selected.type);
            if (selected.type === 'units') {
                formData.append('preview', String(preview));
                formData.append('block', inventoryBlock);
            }

            const res = await fetch('/api/admin/import', { method: 'POST', body: formData });
            if (res.ok && !preview) markAdminDataStale();
            const data = await res.json();
            // Auth/validation алдаа {error} хэлбэрээр ирдэг — үр дүнгийн картад ойлгомжтой харуулна
            if (!res.ok && data && !data.message && data.error) {
                setResult({ success: false, message: data.error });
            } else {
                setResult(data);
            }
        } catch (error) {
            setResult({ success: false, imported: 0, message: error instanceof Error ? error.message : 'Импорт хийхэд алдаа гарлаа' });
        } finally {
            setLoading(false);
        }
    };

    const createProject = async () => {
        if (!newProjectName.trim() || loading || creatingProject) return;
        setCreatingProject(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/admin/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjectName.trim(),
                    // Shop = төсөл: шинэ төсөл өөрийн shop-той үүснэ.
                    location: newProjectLocation.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (res.ok && data.project) {
                // Бусад жагсаалтыг хуучирсан гэж тэмдэглээд, энэ жагсаалтад шинэ төслийг дахин уншилгүй шууд нэмнэ.
                // Явж буй (хуучин) уншилтыг эхлээд цуцална — эс бөгөөс хожуу ирсэн хариу шинэ төслийг арилгана.
                await queryClient.cancelQueries({ queryKey: projectsKey });
                markAdminDataStale();
                void refreshShops();
                queryClient.setQueryData<AdminProject[]>(projectsKey, prev => [data.project, ...(prev ?? []).filter(project => project.id !== data.project.id)]);
                setSelectedProject(data.project.id);
                setResult(null);
                setNewProjectName('');
                setNewProjectLocation('');
                setShowNewProject(false);
            } else {
                setCreateError(data.error || 'Төсөл үүсгэхэд алдаа гарлаа');
            }
        } catch (e) {
            console.error('Create project error:', e);
            setCreateError('Төсөл үүсгэхэд алдаа гарлаа');
        } finally {
            setCreatingProject(false);
        }
    };

    const downloadTemplate = () => {
        const csv = selected.templateFn();
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selected.type}_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const c = COLOR_MAP[selected.color] || COLOR_MAP.violet;
    const inventoryPreview = selected.type === 'units' && result?.success ? result.preview : undefined;

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">Дата Импорт</h1>
                <p className="text-muted-foreground mt-1">CSV/Excel файлаас мэдээлэл бөөнөөр оруулах</p>
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                {IMPORT_CATEGORIES.map(cat => {
                    const cc = COLOR_MAP[cat.color] || COLOR_MAP.violet;
                    const isActive = selected.type === cat.type;
                    return (
                        <button
                            key={cat.type}
                            disabled={loading}
                            onClick={() => { setSelected(cat); setResult(null); setFile(null); setInventoryBlock(''); if (fileRef.current) fileRef.current.value = ''; }}
                            className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                                isActive
                                    ? `${cc.border} ${cc.bg} ${cc.text}`
                                    : 'border-border hover:border-border-strong text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <cat.icon className="w-6 h-6" />
                            <span className="text-sm font-semibold leading-tight">{cat.label}</span>
                            <span className="text-[10px] opacity-70 leading-tight">{cat.desc}</span>
                        </button>
                    );
                })}
            </div>

            {/* Import Form */}
            <div className="bg-surface rounded-xl border border-border p-6 space-y-5">
                {/* Selected category header */}
                <div className={`flex items-center gap-3 p-4 ${c.bg} rounded-lg`}>
                    <div className={`w-10 h-10 ${c.light} rounded-lg flex items-center justify-center`}>
                        <selected.icon className={`w-5 h-5 ${c.text}`} />
                    </div>
                    <div>
                        <p className={`font-semibold ${c.text}`}>{selected.label} импорт</p>
                        <p className="text-xs text-muted-foreground">{selected.desc}</p>
                    </div>
                </div>

                {/* Project Selector */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="import-project" className="block text-sm font-medium text-foreground">Төсөл сонгох</label>
                        <button
                            disabled={loading}
                            onClick={() => setShowNewProject(!showNewProject)}
                            className="text-xs text-brand-strong hover:text-brand-strong font-medium"
                        >
                            {showNewProject ? '✕ Хаах' : '+ Шинэ төсөл нэмэх'}
                        </button>
                    </div>

                    {showNewProject && (
                        <div className="mb-3 p-4 bg-brand-soft border border-brand/30 rounded-lg space-y-3">
                            <input
                                type="text"
                                disabled={loading || creatingProject}
                                placeholder="Төслийн нэр *"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                            />
                            <input
                                type="text"
                                disabled={loading || creatingProject}
                                placeholder="Байршил (заавал биш)"
                                value={newProjectLocation}
                                onChange={(e) => setNewProjectLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                            />
                            {createError && (
                                <p className="text-xs text-status-danger">{createError}</p>
                            )}
                            <button
                                onClick={createProject}
                                disabled={!newProjectName.trim() || loading || creatingProject}
                                className="w-full py-2 bg-brand text-brand-fg rounded-lg hover:bg-brand-hover disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                            >
                                {creatingProject ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Үүсгэж байна...</>
                                ) : (
                                    '+ Төсөл үүсгэх'
                                )}
                            </button>
                        </div>
                    )}

                    {listError && (
                        <Alert variant="danger" className="mb-3">
                            <AlertDescription>{listError.message}</AlertDescription>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mt-1 self-start"
                                onClick={() => {
                                    void projectsQuery.refetch();
                                }}
                            >
                                Дахин оролдох
                            </Button>
                        </Alert>
                    )}

                    {projectsLoading ? (
                        <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
                    ) : !projectsQuery.data ? null : projects.length === 0 ? (
                        <div className="text-center py-6 bg-surface-2/40 rounded-lg border border-dashed border-border-strong">
                            <p className="text-sm text-muted-foreground">Төсөл байхгүй байна</p>
                            <button
                                onClick={() => setShowNewProject(true)}
                                className="text-sm text-brand-strong font-medium mt-1 hover:underline"
                            >
                                + Эхний төсөл нэмэх
                            </button>
                        </div>
                    ) : (
                        <select
                            id="import-project"
                            value={selectedProject}
                            disabled={loading}
                            onChange={(e) => { setSelectedProject(e.target.value); setResult(null); }}
                            className="w-full px-3 py-2.5 border border-border-strong rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                        >
                            <option value="">Төсөл сонгоно уу</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {selected.type === 'units' && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Файлын эхний листээс байрны код, ангилал, төлөвийг уншина. «Ээлж» багана байхгүй бол сонгосон төслийн нэрээр бүлэглэнэ.
                            Шинэ байруудыг нэмнэ. Өмнө бүртгэсэн байрны төлөв, мэдээлэл хадгалагдана.
                        </p>
                        <div>
                            <label htmlFor="inventory-block" className="block text-sm font-medium text-foreground mb-1">Файлд «Блок» багана байхгүй бол блокийн нэр</label>
                            <input
                                id="inventory-block"
                                value={inventoryBlock}
                                maxLength={50}
                                disabled={loading}
                                onChange={event => { setInventoryBlock(event.target.value); setResult(null); }}
                                placeholder="Жишээ: Б1"
                                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Нэг блокийн бүх байр орсон файлд хэрэглэнэ. Олон блоктой файлд мөр бүрийн «Блок» баганыг бөглөнө.</p>
                        </div>
                    </div>
                )}

                {/* Template Download */}
                <div className="flex items-center justify-between p-4 bg-status-info-soft rounded-lg border border-status-info">
                    <div>
                        <p className="text-sm font-medium text-status-info">{selected.label} загвар</p>
                        <p className="text-xs text-status-info mt-0.5">CSV загвар татаж, мэдээллээ бөглөнө үү</p>
                    </div>
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-status-info text-background rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        <Download className="w-4 h-4" />
                        Загвар татах
                    </button>
                </div>

                {/* Column Guide */}
                <div className="p-4 bg-surface-2/40 rounded-lg">
                    <p className="text-sm font-medium text-foreground mb-2">Шаардлагатай баганууд:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {selected.columns.map(col => (
                            <span
                                key={col.name}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                    col.required ? 'bg-status-danger-soft text-status-danger' : 'bg-surface-3 text-muted-foreground'
                                }`}
                            >
                                {col.name}{col.required ? '*' : ''}
                            </span>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">* заавал бөглөх</p>
                </div>

                {/* File Upload */}
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Файл сонгох</label>
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-border-strong rounded-xl p-8 text-center cursor-pointer hover:border-brand hover:bg-brand-soft/50 transition-all"
                    >
                        <Upload className="w-10 h-10 text-muted-foreground/70 mx-auto mb-3" />
                        {file ? (
                            <div>
                                <p className="text-sm font-semibold text-foreground">{file.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-muted-foreground">Файл чирж тавих эсвэл сонгох</p>
                                <p className="text-xs text-muted-foreground/70 mt-1">.csv, .xlsx · 10 MB хүртэл</p>
                            </div>
                        )}
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        aria-label="Импортын файл"
                        disabled={loading}
                        accept=".csv,.xlsx"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Import Button */}
                {inventoryPreview && (
                    <div className="rounded-lg border border-border p-4 space-y-3" aria-label="Блокийн импортын урьдчилсан шалгалт">
                        <p className="font-medium">{projects.find(project => project.id === selectedProject)?.name} · {inventoryPreview.total} байр</p>
                        <p className="text-sm text-muted-foreground">{inventoryPreview.fresh} шинэ байр нэмнэ · {inventoryPreview.existing} бүртгэлтэй байр хадгалагдана</p>
                        <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                            {inventoryPreview.groups.map(group => (
                                <li key={JSON.stringify([group.phase, group.block, group.category])}>
                                    <span className="font-medium">{group.phase} / {group.block} / {unitCategoryLabel(group.category)}: {group.total}</span>
                                    <p className="text-xs text-muted-foreground">Файлын төлөв: {Object.entries(group.statuses).map(([status, count]) => `${unitStatusLabel(status)} ${count}`).join(' · ')}</p>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-muted-foreground">Файлын шалгалт амжилттай. Байруудыг хадгалахын тулд доорх товчийг дарна уу.</p>
                    </div>
                )}
                <button
                    onClick={() => handleImport(selected.type === 'units' && !inventoryPreview)}
                    disabled={!file || !selectedProject || loading || creatingProject || inventoryPreview?.fresh === 0}
                    className="w-full py-3 bg-brand text-brand-fg font-semibold rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Импорт хийж байна...</>
                    ) : (
                        <><Upload className="w-5 h-5" /> {selected.type === 'units' ? inventoryPreview ? `${inventoryPreview.fresh} байр нэмэх` : 'Байрны файлыг шалгах' : `${selected.label} импорт хийх`}</>
                    )}
                </button>
            </div>

            {/* Result */}
            {result && (
                <div className={`mt-6 p-6 rounded-xl border ${result.success ? 'bg-status-success-soft border-status-success/30' : 'bg-status-danger-soft border-status-danger/30'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        {result.success ? (
                            <CheckCircle2 className="w-6 h-6 text-status-success" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-status-danger" />
                        )}
                        <p className={`font-semibold ${result.success ? 'text-status-success' : 'text-status-danger'}`}>
                            {result.message}
                        </p>
                    </div>
                    {result.success && (result.imported || 0) > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm text-status-success">✅ {result.imported} мөр амжилттай оруулсан</p>
                            {selected.type === 'units' && <Link href="/dashboard/properties/blocks" className="text-sm text-brand-strong underline">Блокуудыг нээх</Link>}
                        </div>
                    )}
                    {result.success && (result.updated || 0) > 0 && (
                        <p className="text-sm text-status-success">🔄 {result.updated} мөр шинэчлэгдсэн</p>
                    )}
                    {result.success && (result.skipped || 0) > 0 && (
                        <p className="text-sm text-status-success">⏭️ {result.skipped} давхардсан мөрийг алгассан</p>
                    )}
                    {result.notes && result.notes.length > 0 && (
                        <div className="mt-3 p-3 bg-surface rounded-lg border">
                            <p className="text-sm font-medium text-foreground mb-2">Тэмдэглэл:</p>
                            <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                                {result.notes.map((note, i) => (
                                    <li key={i}>• {note}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {result.errors && result.errors.length > 0 && (
                        <div className="mt-3 p-3 bg-surface rounded-lg border">
                            <p className="text-sm font-medium text-status-danger mb-2">Алдаатай мөрүүд:</p>
                            <ul className="text-xs text-status-danger space-y-1 max-h-40 overflow-y-auto">
                                {result.errors.map((err, i) => (
                                    <li key={i}>• {err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
