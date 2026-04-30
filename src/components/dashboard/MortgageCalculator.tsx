'use client';

import { useState, useMemo } from 'react';
import { Calculator, Building2, Percent, Calendar, DollarSign } from 'lucide-react';

interface MortgageCalcProps {
    defaultPrice?: number;
    propertyName?: string;
}

const BANKS = [
    { name: 'ХасБанк', rate: 11.4 },
    { name: 'Хаан Банк', rate: 12.0 },
    { name: 'Голомт Банк', rate: 11.8 },
    { name: 'ХХБ', rate: 12.2 },
    { name: 'Төрийн Банк', rate: 11.0 },
    { name: '8% хөтөлбөр', rate: 8.0 },
];

export function MortgageCalculator({ defaultPrice = 380_000_000, propertyName }: MortgageCalcProps) {
    const [price, setPrice] = useState(defaultPrice);
    const [downPaymentPercent, setDownPaymentPercent] = useState(30);
    const [termYears, setTermYears] = useState(20);
    const [selectedBank, setSelectedBank] = useState(BANKS[5]); // 8% default

    const calc = useMemo(() => {
        const downPayment = price * (downPaymentPercent / 100);
        const loanAmount = price - downPayment;
        const monthlyRate = selectedBank.rate / 100 / 12;
        const totalMonths = termYears * 12;

        if (monthlyRate === 0) {
            return { monthly: loanAmount / totalMonths, total: loanAmount, interest: 0, downPayment, loanAmount };
        }

        const monthly = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) /
            (Math.pow(1 + monthlyRate, totalMonths) - 1);
        const total = monthly * totalMonths;
        const interest = total - loanAmount;

        return { monthly, total, interest, downPayment, loanAmount };
    }, [price, downPaymentPercent, termYears, selectedBank]);

    const formatMoney = (n: number) => {
        if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} тэрбум`;
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} сая`;
        return n.toLocaleString() + '₮';
    };

    return (
        <div className="bg-surface rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-5">
                <Calculator className="w-5 h-5 text-status-success" />
                <h3 className="font-semibold text-foreground">Зээлийн тооцоолуур</h3>
                {propertyName && <span className="text-xs text-muted-foreground/70 ml-auto">{propertyName}</span>}
            </div>

            <div className="space-y-4">
                {/* Price */}
                <div>
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Building2 className="w-3.5 h-3.5" /> Байрны үнэ
                    </label>
                    <input
                        type="number"
                        value={price}
                        onChange={e => setPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <p className="text-xs text-muted-foreground/70 mt-1">{formatMoney(price)}</p>
                </div>

                {/* Down Payment */}
                <div>
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <DollarSign className="w-3.5 h-3.5" /> Урьдчилгаа: {downPaymentPercent}%
                    </label>
                    <input
                        type="range"
                        min={10} max={70} step={5}
                        value={downPaymentPercent}
                        onChange={e => setDownPaymentPercent(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                    />
                    <p className="text-xs text-muted-foreground/70">{formatMoney(calc.downPayment)}</p>
                </div>

                {/* Term */}
                <div>
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Calendar className="w-3.5 h-3.5" /> Хугацаа: {termYears} жил
                    </label>
                    <input
                        type="range"
                        min={5} max={30} step={1}
                        value={termYears}
                        onChange={e => setTermYears(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                    />
                </div>

                {/* Bank Selection */}
                <div>
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Percent className="w-3.5 h-3.5" /> Банк / Хүү
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                        {BANKS.map(bank => (
                            <button
                                key={bank.name}
                                onClick={() => setSelectedBank(bank)}
                                className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${selectedBank.name === bank.name
                                    ? 'border-emerald-600 bg-status-success-soft text-status-success font-medium'
                                    : 'border-border text-muted-foreground hover:border-border-strong'
                                    }`}
                            >
                                {bank.name} ({bank.rate}%)
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results */}
            <div className="mt-6 p-4 bg-status-success-soft rounded-xl border border-status-success/20">
                <div className="text-center mb-3">
                    <p className="text-xs text-status-success font-medium">Сарын төлбөр</p>
                    <p className="text-3xl font-bold text-status-success">{formatMoney(calc.monthly)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                        <p className="text-xs text-muted-foreground">Зээлийн дүн</p>
                        <p className="text-sm font-semibold text-foreground">{formatMoney(calc.loanAmount)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Нийт хүү</p>
                        <p className="text-sm font-semibold text-status-danger">{formatMoney(calc.interest)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
