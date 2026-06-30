'use client';

import { Plus, AlertCircle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

interface CreateForm {
    name: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
}

interface CreateCustomerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    createForm: CreateForm;
    setCreateForm: React.Dispatch<React.SetStateAction<CreateForm>>;
    creating: boolean;
    createError: string | null;
    setCreateError: React.Dispatch<React.SetStateAction<string | null>>;
    onSubmit: () => void;
}

export function CreateCustomerModal({
    open,
    onOpenChange,
    createForm,
    setCreateForm,
    creating,
    createError,
    setCreateError,
    onSubmit,
}: CreateCustomerModalProps) {
    const close = () => {
        onOpenChange(false);
        setCreateError(null);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setCreateError(null);
                }
                onOpenChange(next);
            }}
        >
            <DialogContent showCloseButton={false} className="rounded-xl sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <DialogTitle className="heading-section text-lg text-foreground">Шинэ харилцагч нэмэх</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <FormField label="Нэр" htmlFor="create-name" required>
                        <input
                            id="create-name"
                            type="text"
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            placeholder="Б. Болд"
                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                    </FormField>
                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Утас" htmlFor="create-phone">
                            <input
                                id="create-phone"
                                type="text"
                                value={createForm.phone}
                                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                                placeholder="9999-9999"
                                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                            />
                        </FormField>
                        <FormField label="И-мэйл" htmlFor="create-email">
                            <input
                                id="create-email"
                                type="email"
                                value={createForm.email}
                                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                                placeholder="bold@example.com"
                                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                            />
                        </FormField>
                    </div>
                    <FormField label="Хаяг" htmlFor="create-address">
                        <input
                            id="create-address"
                            type="text"
                            value={createForm.address}
                            onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                            placeholder="УБ хот, СБД, ..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                    </FormField>
                    <FormField label="Тэмдэглэл" htmlFor="create-notes">
                        <textarea
                            id="create-notes"
                            value={createForm.notes}
                            onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                            rows={3}
                            placeholder="Хэрэгцээ, хүсэлт, бусад мэдээлэл..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                    </FormField>
                    {createError && (
                        <p className="flex items-center gap-1.5 text-sm text-status-danger">
                            <AlertCircle className="w-4 h-4" /> {createError}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="secondary" size="sm" onClick={close}>
                        Цуцлах
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onSubmit}
                        disabled={creating || !createForm.name.trim()}
                        isLoading={creating}
                    >
                        {!creating && <Plus className="w-4 h-4" />}
                        Бүртгэх
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
