'use client';

import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { ubDateStr } from '@/lib/utils/date';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useTransferContract, type ContractRow } from '@/hooks/useContracts';
import { CONTRACT_TRANSFER_KIND_META } from '@/lib/contracts/labels';
import {
    TransferContractSchema, transferDateError, transferInputError,
    type ContractTransferKind, type TransferContractInput,
} from '@/lib/contracts/transfer';

interface Form {
    name: string;
    lastName: string;
    firstName: string;
    registration: string;
    phone: string;
    effectiveDate: string;
    reason: string;
}

const emptyForm = (): Form => ({ name: '', lastName: '', firstName: '', registration: '', phone: '', effectiveDate: ubDateStr(), reason: '' });

/** Овог + нэрээс гэрээнд харагдах бүтэн нэр (гараар засаагүй үед л). */
const composeName = (lastName: string, firstName: string) => [lastName.trim(), firstName.trim()].filter(Boolean).join(' ');

/**
 * «Гэрээ шилжүүлэх» цонх: өөр хүнд шилжүүлэх эсвэл ижил хүний нэрийг засах.
 * Гэрээний мөр, төлсөн дүн, график, менежерийн борлуулалт, дугаар хэвээр үлдэнэ;
 * зөвхөн эзэмшигч солигдож түүх, аудит хадгалагдана (transfer_contract RPC).
 */
export function ContractTransferDialog({ contract, open, onOpenChange }: { contract: ContractRow; open: boolean; onOpenChange: (open: boolean) => void }) {
    const transfer = useTransferContract(contract.id);
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!transfer.isPending) onOpenChange(next); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Гэрээ шилжүүлэх</DialogTitle>
                    <DialogDescription>Төлсөн дүн, төлбөрийн график, менежерийн борлуулалт, гэрээний дугаар хэвээр үлдэж, гэрээ шинэ эзэмшигчид шилжинэ.</DialogDescription>
                </DialogHeader>
                {/* Цонх хаагдахад маягт unmount болно — дараагийн нээлт шинэ төлөв, шинэ хүсэлтийн UUID-тай эхэлнэ. */}
                <TransferForm contract={contract} transfer={transfer} onClose={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    );
}

/** Нэг нээлтэд нэг UUID — давтан дарах/дахин оролдох нь давхар шилжүүлэг үүсгэхгүй. */
function TransferForm({ contract, transfer, onClose }: { contract: ContractRow; transfer: ReturnType<typeof useTransferContract>; onClose: () => void }) {
    const requestId = useRef<string | null>(null);
    const [kind, setKind] = useState<ContractTransferKind>('transfer');
    const [form, setForm] = useState<Form>(emptyForm);
    const [nameEdited, setNameEdited] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const current = contract.customer_name || composeName(contract.customer_last_name || '', contract.customer_first_name || '') || '—';
    const paid = Number(contract.paid_amount) || 0;
    const total = Number(contract.total_price) || 0;
    const balance = contract.balance ?? Math.max(0, total - paid);

    const chooseKind = (next: ContractTransferKind) => {
        setKind(next);
        setError(null);
        setNameEdited(next === 'rename');
        setForm(next === 'rename'
            ? { ...emptyForm(), name: contract.customer_name || '', lastName: contract.customer_last_name || '', firstName: contract.customer_first_name || '' }
            : emptyForm());
    };
    const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setError(null);
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if ((key === 'lastName' || key === 'firstName') && !nameEdited) next.name = composeName(next.lastName, next.firstName);
            return next;
        });
        if (key === 'name') setNameEdited(true);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        requestId.current ??= crypto.randomUUID();
        const input: TransferContractInput = {
            client_request_id: requestId.current,
            kind,
            customer_name: form.name,
            customer_last_name: form.lastName.trim() || null,
            customer_first_name: form.firstName.trim() || null,
            effective_date: form.effectiveDate,
            reason: form.reason.trim() || null,
            expected_customer_name: contract.customer_name ?? null,
            ...(kind === 'transfer' ? { customer_registration: form.registration, customer_phone: form.phone.trim() || null } : {}),
        };
        const parsed = TransferContractSchema.safeParse(input);
        const problem = !parsed.success ? transferInputError(parsed.error) : transferDateError(form.effectiveDate, contract.contract_date, ubDateStr());
        if (problem) { setError(problem); return; }
        try {
            const result = await transfer.mutateAsync(input);
            toast.success(result.message || 'Гэрээ шилжүүлэгдлээ');
            onClose();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Гэрээ шилжүүлж чадсангүй';
            setError(message);
            toast.error(message);
        }
    };

    return (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
            <dl className="grid grid-cols-3 gap-3 rounded-md border border-border bg-surface-2 p-3 text-[12.5px]">
                <div className="col-span-3 min-w-0 sm:col-span-1"><dt className="text-muted-foreground">Одоогийн эзэмшигч</dt><dd className="truncate font-medium text-foreground">{current}</dd></div>
                <div><dt className="text-muted-foreground">Төлсөн (хэвээр)</dt><dd className="num font-medium text-foreground">{formatMNT(paid)}</dd></div>
                <div><dt className="text-muted-foreground">Үлдэгдэл</dt><dd className="num font-medium text-foreground">{formatMNT(balance)}</dd></div>
            </dl>

            <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Төрөл</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(CONTRACT_TRANSFER_KIND_META) as ContractTransferKind[]).map((value) => (
                        <label key={value} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] focus-within:ring-[3px] focus-within:ring-ring/40',
                            kind === value ? 'border-brand bg-brand-soft text-foreground' : 'border-border-strong text-fg-2 hover:bg-surface-2')}>
                            <input type="radio" name="transfer-kind" value={value} checked={kind === value} onChange={() => chooseKind(value)} className="size-4 accent-brand" />
                            {CONTRACT_TRANSFER_KIND_META[value].action}
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Овог" htmlFor="transfer-last-name"><Input id="transfer-last-name" value={form.lastName} onChange={set('lastName')} maxLength={100} autoComplete="off" /></FormField>
                <FormField label="Нэр" htmlFor="transfer-first-name"><Input id="transfer-first-name" value={form.firstName} onChange={set('firstName')} maxLength={100} autoComplete="off" /></FormField>
            </div>
            <FormField label={kind === 'transfer' ? 'Шинэ эзэмшигчийн нэр' : 'Зассан нэр'} htmlFor="transfer-name" required hint="Гэрээнд харагдах бүтэн нэр">
                <Input id="transfer-name" value={form.name} onChange={set('name')} maxLength={255} required autoComplete="off" />
            </FormField>
            {kind === 'transfer' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Регистр / паспорт" htmlFor="transfer-registration" required>
                        <Input id="transfer-registration" value={form.registration} onChange={set('registration')} maxLength={24} className="mono-label uppercase" autoComplete="off" required />
                    </FormField>
                    <FormField label="Утас" htmlFor="transfer-phone">
                        <Input id="transfer-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={50} className="mono-label" autoComplete="off" />
                    </FormField>
                </div>
            )}
            <FormField label="Шилжүүлсэн огноо" htmlFor="transfer-date" required>
                <Input id="transfer-date" type="date" value={form.effectiveDate} onChange={set('effectiveDate')} max={ubDateStr()} min={contract.contract_date?.slice(0, 10) || undefined} className="mono-label" required />
            </FormField>
            <FormField label="Шалтгаан / тэмдэглэл" htmlFor="transfer-reason" required={kind === 'transfer'}
                hint="Шилжүүлгийн хураамжийг «Төлбөр бүртгэх»-ээр «Бусад төлбөр» төрлөөр бүртгэнэ.">
                <Textarea id="transfer-reason" value={form.reason} onChange={set('reason')} maxLength={2000} rows={3} />
            </FormField>

            {error && <p role="alert" className="text-[12.5px] text-status-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={transfer.isPending}>Цуцлах</Button>
                <Button type="submit" isLoading={transfer.isPending}>{kind === 'transfer' ? 'Шилжүүлэх' : 'Нэр засах'}</Button>
            </DialogFooter>
        </form>
    );
}
