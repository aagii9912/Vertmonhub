'use client';

import { useState, useRef } from 'react';
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
        type: 'properties',
        label: 'Үл хөдлөх',
        desc: 'Байр, газар, оффис',
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
            { name: 'Нэр', required: true },
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
            { name: 'Урьдчилгаа' },
            { name: 'Гэрээний огноо' },
            { name: 'Статус' },
            { name: 'Тэмдэглэл' },
        ],
        templateFn: () =>
            'Гэрээний дугаар,Худалдан авагч,Худалдан авагч утас,Байрны нэр,Нийт үнэ,Урьдчилгаа,Гэрээний огноо,Статус,Тэмдэглэл\n' +
            'MG-2026-001,Бат Болд,99112233,A-301,380000000,114000000,2026-01-15,active,Зээлээр\n' +
            'MG-2026-002,Сараа,88001122,B-501,280000000,84000000,2026-02-01,active,Бэлнээр\n',
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
        desc: 'Компанийн мэдээлэл',
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
            { name: 'Хөсөчилсөн төлбөр' },
            { name: 'Хөсөчлөх хугацаа' },
            { name: 'Бэлнээр хөнгөлөлт (%)' },
        ],
        templateFn: () =>
            'Төсөл,Урьдчилгаа,Хөсөчилсөн төлбөр,Хасагчлэх хугацаа,Бэлнээр хөнгөлөлт,VIP хөнгөлөлт\n' +
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
    violet: { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700', light: 'bg-violet-100' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-100' },
    pink: { bg: 'bg-pink-50', border: 'border-pink-500', text: 'text-pink-700', light: 'bg-pink-100' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-100' },
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-100' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-500', text: 'text-teal-700', light: 'bg-teal-100' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700', light: 'bg-orange-100' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-700', light: 'bg-purple-100' },
};

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    errors?: string[];
    message: string;
}

export default function AdminImportPage() {
    const [selected, setSelected] = useState<ImportCategory>(IMPORT_CATEGORIES[0]);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Project state
    const [projects, setProjects] = useState<{ id: string; name: string; shop_id: string }[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [projectsLoading, setProjectsLoading] = useState(true);
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectLocation, setNewProjectLocation] = useState('');
    const [creatingProject, setCreatingProject] = useState(false);

    // Fetch projects on mount
    useState(() => {
        fetch('/api/admin/projects')
            .then(res => res.json())
            .then(data => {
                if (data.projects) {
                    setProjects(data.projects);
                    if (data.projects.length > 0) setSelectedProject(data.projects[0].id);
                }
                setProjectsLoading(false);
            })
            .catch(() => setProjectsLoading(false));
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setResult(null); }
    };

    const handleImport = async () => {
        const proj = projects.find(p => p.id === selectedProject);
        if (!file || !proj) return;
        setLoading(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('shopId', proj.shop_id);
            formData.append('projectId', proj.id);
            formData.append('projectName', proj.name);
            formData.append('type', selected.type);

            const res = await fetch('/api/admin/import', { method: 'POST', body: formData });
            const data = await res.json();
            setResult(data);
        } catch (error: any) {
            setResult({ success: false, imported: 0, message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const createProject = async () => {
        if (!newProjectName.trim()) return;
        setCreatingProject(true);
        try {
            const res = await fetch('/api/admin/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjectName.trim(),
                    location: newProjectLocation.trim() || null,
                }),
            });
            const data = await res.json();
            if (res.ok && data.project) {
                setProjects(prev => [data.project, ...prev]);
                setSelectedProject(data.project.id);
                setNewProjectName('');
                setNewProjectLocation('');
                setShowNewProject(false);
            }
        } catch (e) {
            console.error('Create project error:', e);
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

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Дата Импорт</h1>
                <p className="text-gray-500 mt-1">CSV/Excel файлаас мэдээлэл бөөнөөр оруулах</p>
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                {IMPORT_CATEGORIES.map(cat => {
                    const cc = COLOR_MAP[cat.color] || COLOR_MAP.violet;
                    const isActive = selected.type === cat.type;
                    return (
                        <button
                            key={cat.type}
                            onClick={() => { setSelected(cat); setResult(null); setFile(null); }}
                            className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                                isActive
                                    ? `${cc.border} ${cc.bg} ${cc.text}`
                                    : 'border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700'
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
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                {/* Selected category header */}
                <div className={`flex items-center gap-3 p-4 ${c.bg} rounded-lg`}>
                    <div className={`w-10 h-10 ${c.light} rounded-lg flex items-center justify-center`}>
                        <selected.icon className={`w-5 h-5 ${c.text}`} />
                    </div>
                    <div>
                        <p className={`font-semibold ${c.text}`}>{selected.label} импорт</p>
                        <p className="text-xs text-gray-500">{selected.desc}</p>
                    </div>
                </div>

                {/* Project Selector */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">Төсөл сонгох</label>
                        <button
                            onClick={() => setShowNewProject(!showNewProject)}
                            className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                        >
                            {showNewProject ? '✕ Хаах' : '+ Шинэ төсөл нэмэх'}
                        </button>
                    </div>

                    {showNewProject && (
                        <div className="mb-3 p-4 bg-violet-50 border border-violet-200 rounded-lg space-y-3">
                            <input
                                type="text"
                                placeholder="Төслийн нэр *"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Байршил (заавал биш)"
                                value={newProjectLocation}
                                onChange={(e) => setNewProjectLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
                            />
                            <button
                                onClick={createProject}
                                disabled={!newProjectName.trim() || creatingProject}
                                className="w-full py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                            >
                                {creatingProject ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Үүсгэж байна...</>
                                ) : (
                                    '+ Төсөл үүсгэх'
                                )}
                            </button>
                        </div>
                    )}

                    {projectsLoading ? (
                        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                    ) : projects.length === 0 ? (
                        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <p className="text-sm text-gray-500">Төсөл байхгүй байна</p>
                            <button
                                onClick={() => setShowNewProject(true)}
                                className="text-sm text-violet-600 font-medium mt-1 hover:underline"
                            >
                                + Эхний төсөл нэмэх
                            </button>
                        </div>
                    ) : (
                        <select
                            value={selectedProject}
                            onChange={(e) => setSelectedProject(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Template Download */}
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <div>
                        <p className="text-sm font-medium text-blue-800">{selected.label} загвар</p>
                        <p className="text-xs text-blue-600 mt-0.5">CSV загвар татаж, мэдээллээ бөглөнө үү</p>
                    </div>
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        <Download className="w-4 h-4" />
                        Загвар татах
                    </button>
                </div>

                {/* Column Guide */}
                <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-2">Шаардлагатай баганууд:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {selected.columns.map(col => (
                            <span
                                key={col.name}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                    col.required ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                                }`}
                            >
                                {col.name}{col.required ? '*' : ''}
                            </span>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">* заавал бөглөх</p>
                </div>

                {/* File Upload */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Файл сонгох</label>
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all"
                    >
                        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        {file ? (
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-gray-600">Файл чирж тавих эсвэл сонгох</p>
                                <p className="text-xs text-gray-400 mt-1">.csv, .xlsx, .xls дэмжинэ</p>
                            </div>
                        )}
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Import Button */}
                <button
                    onClick={handleImport}
                    disabled={!file || !selectedProject || loading}
                    className="w-full py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Импорт хийж байна...</>
                    ) : (
                        <><Upload className="w-5 h-5" /> {selected.label} импорт хийх</>
                    )}
                </button>
            </div>

            {/* Result */}
            {result && (
                <div className={`mt-6 p-6 rounded-xl border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        {result.success ? (
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-red-600" />
                        )}
                        <p className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                            {result.message}
                        </p>
                    </div>
                    {result.success && (result.imported || 0) > 0 && (
                        <p className="text-sm text-green-700">✅ {result.imported} мөр амжилттай оруулсан</p>
                    )}
                    {result.success && (result.updated || 0) > 0 && (
                        <p className="text-sm text-green-700">🔄 {result.updated} мөр шинэчлэгдсэн</p>
                    )}
                    {result.errors && result.errors.length > 0 && (
                        <div className="mt-3 p-3 bg-white rounded-lg border">
                            <p className="text-sm font-medium text-red-700 mb-2">Алдаатай мөрүүд:</p>
                            <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
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
