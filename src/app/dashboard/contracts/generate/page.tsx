'use client';

import { useState, useRef, useEffect } from 'react';
import { FileText, Download, Loader2, User, Building2, DollarSign, Search, Check } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/Select';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface ContractData {
    contractNumber: string;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    buyerRegister: string;
    propertyName: string;
    propertyAddress: string;
    propertySizeSqm: string;
    propertyFloor: string;
    propertyRooms: string;
    pricePerSqm: string;
    price: string;
    downPayment: string;
    paymentMethod: 'cash' | 'mortgage' | 'installment' | 'leasing' | 'barter';
    contractDate: string;
}

// Мандала Гарден — худалдагч/төслийн тогтмол мэдээлэл
const SELLER = {
    company: 'МОНКОН Констракшн ХХК',
    project: 'Мандала Гарден цогцолбор хороолол',
    address: 'Улаанбаатар, Хан-Уул дүүрэг, 23-р хороо, Яармаг, Арцатын ам',
};

const empty: ContractData = {
    contractNumber: '', buyerName: '', buyerPhone: '', buyerEmail: '', buyerRegister: '',
    propertyName: '', propertyAddress: SELLER.address, propertySizeSqm: '', propertyFloor: '', propertyRooms: '',
    pricePerSqm: '', price: '', downPayment: '',
    paymentMethod: 'cash',
    contractDate: new Date().toISOString().split('T')[0],
};

interface ContractRow {
    id: string; unit_label?: string; block_name?: string; floor?: string; rooms?: number;
    contracted_area?: number; price_per_sqm?: number; total_price?: number; prepayment_due?: number;
    prepayment_condition?: string; bank_status?: string; contract_date?: string; order_date?: string;
    customer_name?: string; customer_phone?: string; customer_registration?: string;
}

function shopHeaders(): HeadersInit {
    return { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' };
}
function money(n: string | number | undefined | null): string {
    const v = Number(n);
    return Number.isFinite(v) && v ? v.toLocaleString('mn-MN') + '₮' : '___';
}
function derivePaymentMethod(c: ContractRow): ContractData['paymentMethod'] {
    const cond = (c.prepayment_condition || '').toLowerCase();
    const bank = (c.bank_status || '').toLowerCase();
    if (bank.includes('зээл') || cond.includes('ипотек')) return 'mortgage';
    if (cond === '100%') return 'cash';
    if (cond.includes('-')) return 'installment';
    return 'cash';
}

export default function ContractGeneratePage() {
    const [data, setData] = useState<ContractData>(empty);
    const [generating, setGenerating] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<ContractRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadedId, setLoadedId] = useState<string | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    const set = (key: keyof ContractData, val: string) => setData(prev => ({ ...prev, [key]: val }));

    // Гэрээ хайх (нэр / код / регистр)
    useEffect(() => {
        if (!search.trim()) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/dashboard/contracts?search=${encodeURIComponent(search.trim())}`, { headers: shopHeaders() });
                const d = await res.json();
                setResults((d.contracts || []).slice(0, 6));
            } catch { /* ignore */ } finally { setSearching(false); }
        }, 350);
        return () => clearTimeout(t);
    }, [search]);

    function loadContract(c: ContractRow) {
        setData({
            contractNumber: c.unit_label || '',
            buyerName: c.customer_name || '',
            buyerPhone: c.customer_phone || '',
            buyerEmail: '',
            buyerRegister: c.customer_registration || '',
            propertyName: c.unit_label || c.block_name || '',
            propertyAddress: SELLER.address,
            propertySizeSqm: c.contracted_area?.toString() || '',
            propertyFloor: c.floor || '',
            propertyRooms: c.rooms?.toString() || '',
            pricePerSqm: c.price_per_sqm?.toString() || '',
            price: c.total_price?.toString() || '',
            downPayment: c.prepayment_due?.toString() || '',
            paymentMethod: derivePaymentMethod(c),
            contractDate: (c.contract_date || c.order_date || new Date().toISOString()).slice(0, 10),
        });
        setLoadedId(c.id);
        setResults([]);
        setSearch('');
    }

    const paymentLabels: Record<string, string> = {
        cash: 'Бэлэн төлбөр', mortgage: 'Банкны зээл', installment: 'Хэсэгчилсэн төлбөр', leasing: 'Хувь лизинг', barter: 'Бартер',
    };

    const generateContract = () => { setGenerating(true); setTimeout(() => setGenerating(false), 600); };

    const printContract = () => {
        const content = previewRef.current;
        if (!content) return;
        const win = window.open('', '', 'width=820,height=1100');
        if (!win) return;
        win.document.write(`
            <html><head><title>Гэрээ ${data.contractNumber || ''}</title>
            <style>
              @page { margin: 24mm 18mm; }
              body{font-family:'Times New Roman',serif;color:#000;line-height:1.7;font-size:13px}
              h1{text-align:center;font-size:18px;margin-bottom:4px}
              h2{font-size:14px;margin-top:18px;border-bottom:1px solid #999;padding-bottom:3px}
              table{width:100%;border-collapse:collapse;margin:8px 0}
              td{padding:5px 8px;border:1px solid #ccc;vertical-align:top}
              p{margin:6px 0}
              .muted{color:#444;text-align:center;margin-bottom:18px}
              .sig{display:flex;justify-content:space-between;margin-top:56px}
              .sig-box{width:45%;text-align:center;border-top:1px solid #000;padding-top:8px}
            </style></head><body>${content.innerHTML}</body></html>
        `);
        win.document.close();
        setTimeout(() => win.print(), 250);
    };

    const balance = (Number(data.price) || 0) - (Number(data.downPayment) || 0);

    return (
        <div className="p-6">
            <div className="max-w-5xl mx-auto">
                <PageHeader
                    eyebrow="Гэрээ"
                    title="Гэрээ үүсгэгч"
                    subtitle="Үл хөдлөх хөрөнгө худалдах-худалдан авах гэрээ — Мандала Гарден"
                />

                {/* Гэрээ хайж дуудах */}
                <Card className="mb-6">
                    <CardContent className="p-4">
                        <label className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                            <Search className="w-4 h-4 text-brand-strong" /> Одоо байгаа гэрээнээс дуудах
                        </label>
                        <div className="relative">
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Худалдан авагчийн нэр, код (ж: 203-305), эсвэл регистрээр хайх..."
                                className="h-auto py-2.5"
                            />
                            {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
                            {results.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                                    {results.map((c) => (
                                        <button key={c.id} onClick={() => loadContract(c)} className="w-full text-left px-3 py-2.5 hover:bg-surface-2 border-b border-border/40 last:border-0">
                                            <div className="text-sm font-medium text-foreground">{c.customer_name || '—'}</div>
                                            <div className="text-xs text-muted-foreground">{c.unit_label || c.block_name} · {money(c.total_price)} · {c.contract_date || c.order_date || ''}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {loadedId && <p className="text-xs text-status-success mt-2 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Гэрээний мэдээлэл дуудагдлаа — доороос засаж болно.</p>}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Form */}
                    <Card>
                        <CardContent className="p-6 space-y-5">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3"><User className="w-4 h-4 text-brand-strong" /> Худалдан авагч</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField className="col-span-2" label="Нэр" htmlFor="cg-buyer-name" required>
                                        <Input id="cg-buyer-name" placeholder="Нэр" value={data.buyerName} onChange={e => set('buyerName', e.target.value)} />
                                    </FormField>
                                    <FormField label="Утас" htmlFor="cg-buyer-phone">
                                        <Input id="cg-buyer-phone" placeholder="Утас" value={data.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} />
                                    </FormField>
                                    <FormField label="Регистр" htmlFor="cg-buyer-register">
                                        <Input id="cg-buyer-register" placeholder="Регистр" value={data.buyerRegister} onChange={e => set('buyerRegister', e.target.value)} />
                                    </FormField>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3"><Building2 className="w-4 h-4 text-status-success" /> Үл хөдлөх</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField className="col-span-2" label="Код / нэр" htmlFor="cg-property-name" required>
                                        <Input id="cg-property-name" placeholder="Код / нэр (203-305)" value={data.propertyName} onChange={e => set('propertyName', e.target.value)} />
                                    </FormField>
                                    <FormField label="Талбай (м²)" htmlFor="cg-property-size">
                                        <Input id="cg-property-size" placeholder="Талбай (м²)" value={data.propertySizeSqm} onChange={e => set('propertySizeSqm', e.target.value)} />
                                    </FormField>
                                    <FormField label="Давхар" htmlFor="cg-property-floor">
                                        <Input id="cg-property-floor" placeholder="Давхар" value={data.propertyFloor} onChange={e => set('propertyFloor', e.target.value)} />
                                    </FormField>
                                    <FormField label="Өрөө" htmlFor="cg-property-rooms">
                                        <Input id="cg-property-rooms" placeholder="Өрөө" value={data.propertyRooms} onChange={e => set('propertyRooms', e.target.value)} />
                                    </FormField>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3"><DollarSign className="w-4 h-4 text-status-info" /> Төлбөр</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="М.кв үнэ (₮)" htmlFor="cg-price-per-sqm">
                                        <Input id="cg-price-per-sqm" placeholder="М.кв үнэ (₮)" value={data.pricePerSqm} onChange={e => set('pricePerSqm', e.target.value)} />
                                    </FormField>
                                    <FormField label="Нийт үнэ (₮)" htmlFor="cg-price" required>
                                        <Input id="cg-price" placeholder="Нийт үнэ (₮)" value={data.price} onChange={e => set('price', e.target.value)} />
                                    </FormField>
                                    <FormField label="Урьдчилгаа (₮)" htmlFor="cg-down-payment">
                                        <Input id="cg-down-payment" placeholder="Урьдчилгаа (₮)" value={data.downPayment} onChange={e => set('downPayment', e.target.value)} />
                                    </FormField>
                                    <FormField label="Төлбөрийн хэлбэр">
                                        <Select value={data.paymentMethod} onValueChange={v => set('paymentMethod', v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">Бэлэн төлбөр</SelectItem>
                                                <SelectItem value="mortgage">Банкны зээл</SelectItem>
                                                <SelectItem value="installment">Хэсэгчилсэн</SelectItem>
                                                <SelectItem value="leasing">Хувь лизинг</SelectItem>
                                                <SelectItem value="barter">Бартер</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormField>
                                    <FormField className="col-span-2" label="Гэрээний огноо" htmlFor="cg-contract-date">
                                        <Input id="cg-contract-date" type="date" value={data.contractDate} onChange={e => set('contractDate', e.target.value)} />
                                    </FormField>
                                </div>
                            </div>
                            <Button
                                onClick={generateContract}
                                disabled={!data.buyerName || !data.propertyName || !data.price}
                                size="lg"
                                className="w-full"
                            >
                                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />} Гэрээ шинэчлэх
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Preview */}
                    <Card className="overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                            <span className="text-sm font-semibold text-foreground">Урьдчилж харах</span>
                            {data.buyerName && data.propertyName && (
                                <Button onClick={printContract} variant="secondary" size="sm">
                                    <Download className="w-3.5 h-3.5" /> PDF / Хэвлэх
                                </Button>
                            )}
                        </div>
                        <div ref={previewRef} className="p-6 text-sm text-foreground leading-relaxed max-h-[700px] overflow-y-auto">
                            <h1 style={{ textAlign: 'center', fontSize: '17px', fontWeight: 'bold', marginBottom: '4px' }}>ҮЛ ХӨДЛӨХ ХӨРӨНГӨ ХУДАЛДАХ-ХУДАЛДАН АВАХ ГЭРЭЭ</h1>
                            <p className="muted" style={{ textAlign: 'center', color: '#444', marginBottom: '20px' }}>
                                Гэрээ №: {data.contractNumber || '________'}<br />Огноо: {data.contractDate || '____'} · Улаанбаатар хот
                            </p>

                            <h2 style={{ fontWeight: 'bold', marginTop: '14px' }}>НЭГ. ГЭРЭЭНИЙ ТАЛУУД</h2>
                            <table><tbody>
                                <tr><td style={{ width: '38%', fontWeight: 'bold' }}>Худалдагч (А тал):</td><td>{SELLER.company} — «{SELLER.project}»</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Худалдан авагч (Б тал):</td><td>{data.buyerName || '___'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Регистрийн дугаар:</td><td>{data.buyerRegister || '___'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Холбоо барих утас:</td><td>{data.buyerPhone || '___'}</td></tr>
                            </tbody></table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '14px' }}>ХОЁР. ГЭРЭЭНИЙ ЗҮЙЛ</h2>
                            <p>2.1. А тал нь дараах үл хөдлөх хөрөнгийг Б талд худалдан борлуулж, Б тал худалдан авна:</p>
                            <table><tbody>
                                <tr><td style={{ width: '38%', fontWeight: 'bold' }}>Байр / код:</td><td>{data.propertyName || '___'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Хаяг:</td><td>{data.propertyAddress || '___'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Талбай:</td><td>{data.propertySizeSqm ? `${data.propertySizeSqm} м²` : '___'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Давхар / өрөө:</td><td>{data.propertyFloor || '___'}-р давхар, {data.propertyRooms || '___'} өрөө</td></tr>
                            </tbody></table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '14px' }}>ГУРАВ. ҮНЭ, ТӨЛБӨРИЙН НӨХЦӨЛ</h2>
                            <table><tbody>
                                <tr><td style={{ width: '38%', fontWeight: 'bold' }}>1 м² үнэ:</td><td>{money(data.pricePerSqm)}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Гэрээний нийт үнэ:</td><td><strong>{money(data.price)}</strong></td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Урьдчилгаа төлбөр:</td><td>{money(data.downPayment)}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Үлдэгдэл төлбөр:</td><td>{balance > 0 ? money(balance) : '0₮'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Төлбөрийн хэлбэр:</td><td>{paymentLabels[data.paymentMethod]}</td></tr>
                            </tbody></table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '14px' }}>ДӨРӨВ. ТАЛУУДЫН ЭРХ, ҮҮРЭГ</h2>
                            <p>4.1. Б тал урьдчилгаа төлбөрийг гэрээ байгуулсан өдрөөс хойш ажлын 3 хоногийн дотор төлнө.</p>
                            <p>4.2. Үлдэгдэл төлбөрийг {paymentLabels[data.paymentMethod].toLowerCase()}-ийн нөхцлөөр, тохиролцсон хуваарийн дагуу төлнө.</p>
                            <p>4.3. А тал төлбөр бүрэн төлөгдсөний дараа үл хөдлөх хөрөнгийг актаар хүлээлгэн өгч, өмчлөх эрхийн бичиг баримтыг шилжүүлнэ.</p>
                            <p>4.4. Б тал гэрээгээр хүлээсэн төлбөрийн үүргээ хугацаандаа биелүүлээгүй тохиолдолд хугацаа хэтэрсэн дүнгийн 0.1%-ийн алданги хоног тутамд тооцно.</p>

                            <h2 style={{ fontWeight: 'bold', marginTop: '14px' }}>ТАВ. БУСАД НӨХЦӨЛ</h2>
                            <p>5.1. Гэрээтэй холбоотой маргааныг талууд харилцан тохиролцох замаар, эс бөгөөс Монгол Улсын хууль тогтоомжийн дагуу шийдвэрлэнэ.</p>
                            <p>5.2. Энэхүү гэрээ нь талууд гарын үсэг зурсан өдрөөс хүчин төгөлдөр болно. Хоёр хувь үйлдэж, тал тус бүр нэг хувийг хадгална.</p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '56px' }}>
                                <div style={{ width: '45%', textAlign: 'center', borderTop: '1px solid #000', paddingTop: '8px' }}>
                                    ХУДАЛДАГЧ<br /><small>{SELLER.company}</small>
                                </div>
                                <div style={{ width: '45%', textAlign: 'center', borderTop: '1px solid #000', paddingTop: '8px' }}>
                                    ХУДАЛДАН АВАГЧ<br /><small>{data.buyerName || '___'}</small>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
