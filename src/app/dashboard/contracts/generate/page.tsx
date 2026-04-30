'use client';

import { useState, useRef } from 'react';
import { FileText, Download, Loader2, User, Building2, DollarSign, Calendar } from 'lucide-react';

interface ContractData {
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    buyerRegister: string;
    propertyName: string;
    propertyAddress: string;
    propertySizeSqm: string;
    propertyFloor: string;
    propertyRooms: string;
    price: string;
    downPayment: string;
    paymentMethod: 'cash' | 'mortgage' | 'installment';
    contractDate: string;
}

const empty: ContractData = {
    buyerName: '', buyerPhone: '', buyerEmail: '', buyerRegister: '',
    propertyName: '', propertyAddress: '', propertySizeSqm: '', propertyFloor: '', propertyRooms: '',
    price: '', downPayment: '',
    paymentMethod: 'cash',
    contractDate: new Date().toISOString().split('T')[0],
};

export default function ContractsPage() {
    const [data, setData] = useState<ContractData>(empty);
    const [generating, setGenerating] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    const set = (key: keyof ContractData, val: string) =>
        setData(prev => ({ ...prev, [key]: val }));

    const paymentLabels: Record<string, string> = {
        cash: 'Бэлэн мөнгө', mortgage: 'Банкны зээл', installment: 'Хэсэгчлэн',
    };

    const generateContract = () => {
        setGenerating(true);
        setTimeout(() => setGenerating(false), 800);
    };

    const printContract = () => {
        const content = previewRef.current;
        if (!content) return;
        const win = window.open('', '', 'width=800,height=1000');
        if (!win) return;
        win.document.write(`
            <html><head><title>Гэрээ - ${data.propertyName}</title>
            <style>body{font-family:Arial,sans-serif;padding:40px;color:#333;line-height:1.8}
            h1{text-align:center;font-size:20px}h2{font-size:16px;border-bottom:1px solid #ccc;padding-bottom:4px}
            table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 8px;border:1px solid #ddd}
            .sig{display:flex;justify-content:space-between;margin-top:60px}
            .sig-box{width:45%;text-align:center;border-top:1px solid #333;padding-top:8px}
            </style></head><body>${content.innerHTML}</body></html>
        `);
        win.document.close();
        win.print();
    };

    return (
        <div className="min-h-screen bg-surface-2/40 p-6">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-2xl font-bold text-foreground mb-1">Гэрээ үүсгэгч</h1>
                <p className="text-muted-foreground text-sm mb-6">Үл хөдлөх хөрөнгийн худалдах-худалдан авах гэрээ</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Form */}
                    <div className="bg-surface rounded-xl border border-border p-6 space-y-5">
                        {/* Buyer */}
                        <div>
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                                <User className="w-4 h-4 text-brand-strong" /> Худалдан авагч
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Нэр *" value={data.buyerName} onChange={e => set('buyerName', e.target.value)} className="col-span-2 px-3 py-2 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-brand" />
                                <input placeholder="Утас" value={data.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Имэйл" value={data.buyerEmail} onChange={e => set('buyerEmail', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Регистрийн дугаар" value={data.buyerRegister} onChange={e => set('buyerRegister', e.target.value)} className="col-span-2 px-3 py-2 border border-border-strong rounded-lg text-sm" />
                            </div>
                        </div>

                        {/* Property */}
                        <div>
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                                <Building2 className="w-4 h-4 text-status-success" /> Үл хөдлөх
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Нэр (A-301) *" value={data.propertyName} onChange={e => set('propertyName', e.target.value)} className="col-span-2 px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Хаяг *" value={data.propertyAddress} onChange={e => set('propertyAddress', e.target.value)} className="col-span-2 px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Талбай (м²)" value={data.propertySizeSqm} onChange={e => set('propertySizeSqm', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Давхар" value={data.propertyFloor} onChange={e => set('propertyFloor', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Өрөө" value={data.propertyRooms} onChange={e => set('propertyRooms', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                            </div>
                        </div>

                        {/* Payment */}
                        <div>
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                                <DollarSign className="w-4 h-4 text-status-info" /> Төлбөр
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Үнэ (₮) *" value={data.price} onChange={e => set('price', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <input placeholder="Урьдчилгаа (₮)" value={data.downPayment} onChange={e => set('downPayment', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                                <select value={data.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm">
                                    <option value="cash">Бэлэн мөнгө</option>
                                    <option value="mortgage">Банкны зээл</option>
                                    <option value="installment">Хэсэгчлэн</option>
                                </select>
                                <input type="date" value={data.contractDate} onChange={e => set('contractDate', e.target.value)} className="px-3 py-2 border border-border-strong rounded-lg text-sm" />
                            </div>
                        </div>

                        <button
                            onClick={generateContract}
                            disabled={!data.buyerName || !data.propertyName || !data.price}
                            className="w-full py-3 bg-brand text-white font-semibold rounded-lg hover:bg-brand-strong disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                            Гэрээ үүсгэх
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="bg-surface rounded-xl border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                            <span className="text-sm font-semibold text-foreground">Урьдчилж харах</span>
                            {data.buyerName && data.propertyName && (
                                <button onClick={printContract} className="flex items-center gap-1.5 px-3 py-1.5 bg-status-success text-white rounded-lg text-xs font-medium hover:opacity-90 transition-colors">
                                    <Download className="w-3.5 h-3.5" /> PDF / Хэвлэх
                                </button>
                            )}
                        </div>
                        <div ref={previewRef} className="p-6 text-sm text-foreground leading-relaxed max-h-[700px] overflow-y-auto">
                            <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                                ҮЛ ХӨДЛӨХ ХӨРӨНГИЙН ХУДАЛДАХ-ХУДАЛДАН АВАХ ГЭРЭЭ
                            </h1>
                            <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>
                                № ___ / {data.contractDate || '____'}
                            </p>

                            <h2 style={{ fontWeight: 'bold', marginTop: '16px' }}>1. ТАЛУУД</h2>
                            <table>
                                <tbody>
                                    <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Худалдагч:</td><td>Vertmon LLC</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Худалдан авагч:</td><td>{data.buyerName || '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Регистр:</td><td>{data.buyerRegister || '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Утас:</td><td>{data.buyerPhone || '___'}</td></tr>
                                </tbody>
                            </table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '16px' }}>2. ЗҮЙЛ</h2>
                            <table>
                                <tbody>
                                    <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Байрны нэр:</td><td>{data.propertyName || '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Хаяг:</td><td>{data.propertyAddress || '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Талбай:</td><td>{data.propertySizeSqm ? `${data.propertySizeSqm} м²` : '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Давхар / Өрөө:</td><td>{data.propertyFloor || '___'} давхар, {data.propertyRooms || '___'} өрөө</td></tr>
                                </tbody>
                            </table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '16px' }}>3. ТӨЛБӨР</h2>
                            <table>
                                <tbody>
                                    <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Нийт үнэ:</td><td>{data.price ? `${Number(data.price).toLocaleString()}₮` : '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Урьдчилгаа:</td><td>{data.downPayment ? `${Number(data.downPayment).toLocaleString()}₮` : '___'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Төлбөрийн хэлбэр:</td><td>{paymentLabels[data.paymentMethod]}</td></tr>
                                </tbody>
                            </table>

                            <h2 style={{ fontWeight: 'bold', marginTop: '16px' }}>4. НӨХЦӨЛ</h2>
                            <p>4.1. Худалдагч нь дээрх үл хөдлөх хөрөнгийг худалдан авагчид гэрээнд заасан нөхцлөөр шилжүүлнэ.</p>
                            <p>4.2. Урьдчилгаа төлбөрийг гэрээ байгуулсан өдрөөс хойш 3 хоногийн дотор төлнө.</p>
                            <p>4.3. Үлдэгдэл төлбөрийг {paymentLabels[data.paymentMethod].toLowerCase()}-өөр төлнө.</p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px' }}>
                                <div style={{ width: '45%', textAlign: 'center', borderTop: '1px solid #333', paddingTop: '8px' }}>
                                    Худалдагч<br /><small>Vertmon LLC</small>
                                </div>
                                <div style={{ width: '45%', textAlign: 'center', borderTop: '1px solid #333', paddingTop: '8px' }}>
                                    Худалдан авагч<br /><small>{data.buyerName || '___'}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
