'use client';

import React from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { type ContractRow, useSetContractStatus } from '@/hooks/useContracts';

export type ContractStatusChange = 'cancel' | 'restore';

/** Үйлдэл → PATCH `contract_status` (сервер: Zod allow-list, `contracts` бичих эрх, менежерийн хүрээ, аудит). */
const NEXT_STATUS = { cancel: 'cancelled', restore: 'active' } as const satisfies Record<ContractStatusChange, string>;

/**
 * «Цуцлах»-ыг зөвхөн идэвхтэй гэрээнд санал болгоно: «Сэргээх» үргэлж «Идэвхтэй» болгодог тул андуурсан цуцлалтыг яг буцаана.
 * Хаагдсан («Гэрээ хаасан»), ERP-ийн «Тоот шилжсэн» эсвэл төлөвгүй гэрээг энд цуцалбал сэргээхэд анхны төлөв алдагдана
 * (PATCH-ийн allow-list-д `transferred` байхгүй, HUB импорт ч «Тоот шилжсэн»-ийг өөрчилдөггүй).
 */
export function canCancelContract(status: string | null | undefined): boolean {
    return status === 'active';
}

/**
 * Цонхны бичвэр — кодоор шалгасан үр дагавар: гэрээний тоо, дүнг тоолдог тайлангууд цуцалсан гэрээг хасдаг;
 * давхрын зураглал гэрээг зөвхөн HUB горимд (сүүлийн HUB импорт ERP экспортоос шинэ) давхарлана; захирлын
 * «Хугацаа хэтэрсэн» төлбөрийн графикийг гэрээний төлөвгүйгээр уншдаг; `mutate_contract_payment` цуцалсан гэрээнд
 * төлбөр бүртгэхгүй; төлөвт хариу үйлдэл хийх DB trigger байхгүй тул байр, лид, төлбөрийн мөр хэвээр.
 * «Орсон мөнгө»-ийг (дэвтэр эсвэл HUB «Нийт төлсөн дүн» — төслөөс хамаарна) энд амлахгүй.
 */
const COPY: Record<ContractStatusChange, { title: (label: string) => string; description: string; points: string[]; confirm: string; success: string }> = {
    cancel: {
        title: (label) => `«${label}» гэрээг цуцлах уу?`,
        description: 'Гэрээ устахгүй — жагсаалтад «Цуцалсан» төлөвтэй үлдэнэ.',
        points: [
            'Гэрээний тоо, дүн төлөвлөгөөний биелэлт, захирлын самбарын борлуулалт, менежерийн гүйцэтгэл ба KPI тайлан, Лхагвын тайлангийн CRM гэрээ ба «Огноогүй» тоонд тооцогдохгүй. Импортолсон ERP экспорт өөрчлөгдөхгүй.',
            'Давхрын зураглалын «Гэрээтэй»-гээс зөвхөн HUB гэрээний жагсаалт импортолсон төсөлд хасагдана — бусад төсөлд зураглал ERP экспорт, байрны бүртгэлээс уншдаг.',
            'Бүртгэсэн төлбөр, төлбөрийн график устахгүй — төлөгдөөгүй хугацаа хэтэрсэн хуваарь захирлын самбарын «Хугацаа хэтэрсэн»-д хэвээр харагдана. Цуцалсан гэрээнд шинэ төлбөр бүртгэхгүй.',
            'Байрны төлөв, холбоотой лидийн төлөв энэ үйлдлээр өөрчлөгдөхгүй — шаардлагатай бол тусад нь засна.',
            'Өөрчлөлт аудитын түүхэнд бичигдэнэ. Андуурч цуцалсан бол «Сэргээх»-ээр «Идэвхтэй» төлөвт буцаана.',
        ],
        confirm: 'Гэрээг цуцлах',
        success: 'Гэрээ цуцлагдлаа',
    },
    restore: {
        title: (label) => `«${label}» гэрээг сэргээх үү?`,
        description: 'Гэрээ «Идэвхтэй» төлөвтэй болно.',
        points: [
            'Гэрээний тоо, дүн төлөвлөгөөний биелэлт, тайлангуудад (HUB гэрээний жагсаалт импортолсон төсөлд давхрын зураглалд ч) дахин тооцогдоно.',
            'Байранд өөр идэвхтэй гэрээ байвал сэргээхгүй — нэг байранд хоёр идэвхтэй гэрээ үүсгэхгүй.',
            'Байрны төлөв, холбоотой лидийн төлөв өөрчлөгдөхгүй. Өөрчлөлт аудитын түүхэнд бичигдэнэ.',
        ],
        confirm: 'Сэргээх',
        success: 'Гэрээ сэргээгдлээ',
    },
};

/**
 * «Цуцлах» / «Сэргээх» баталгаажуулах цонх: юу болохыг үнэнээр хэлж, батлахад л PATCH илгээнэ.
 * Алдааг цонхонд харуулж (дахин оролдох эсвэл болих), амжилттай бол хаагдана.
 */
export function ContractStatusDialog({ contract, change, open, onOpenChange }: {
    contract: ContractRow;
    change: ContractStatusChange;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const mutation = useSetContractStatus(contract.id);
    const copy = COPY[change];
    const label = contract.contract_number || contract.unit_label || contract.customer_name || 'Гэрээ';
    const close = (next: boolean) => {
        if (mutation.isPending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
    };
    const confirm = () => {
        mutation.mutate(NEXT_STATUS[change], {
            onSuccess: () => { toast.success(copy.success); mutation.reset(); onOpenChange(false); },
        });
    };
    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{copy.title(label)}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-fg-2">
                    {copy.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                {mutation.isError && (
                    <p role="alert" className="text-[13px] text-status-danger">
                        {mutation.error instanceof Error && mutation.error.message ? mutation.error.message : 'Хадгалж чадсангүй'}
                    </p>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={mutation.isPending} onClick={() => close(false)}>Болих</Button>
                    <Button variant={change === 'cancel' ? 'danger' : 'primary'} disabled={mutation.isPending} onClick={confirm}>
                        {mutation.isPending && <Loader2 className="animate-spin" />}{copy.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
