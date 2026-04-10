'use client';

import { Fragment, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}

function Modal({ open, onOpenChange, children }: ModalProps) {
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            {children}
        </DialogPrimitive.Root>
    );
}

function ModalTrigger({ children, className }: { children: ReactNode; className?: string }) {
    return <DialogPrimitive.Trigger className={className}>{children}</DialogPrimitive.Trigger>;
}

interface ModalContentProps {
    children: ReactNode;
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    showClose?: boolean;
    title?: string;
    description?: string;
}

const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] max-h-[95vh]',
};

function ModalContent({ children, className, size = 'md', showClose = true, title, description }: ModalContentProps) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
            <DialogPrimitive.Content
                className={cn(
                    'fixed left-[50%] top-[50%] z-50 w-full translate-x-[-50%] translate-y-[-50%]',
                    'bg-card border border-border rounded-2xl shadow-2xl',
                    'p-6 animate-scale-in',
                    'focus:outline-none',
                    sizeClasses[size],
                    className
                )}
            >
                {title && (
                    <div className="mb-4">
                        <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                            {title}
                        </DialogPrimitive.Title>
                        {description && (
                            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                                {description}
                            </DialogPrimitive.Description>
                        )}
                    </div>
                )}
                {children}
                {showClose && (
                    <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Хаах</span>
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('mt-6 flex items-center justify-end gap-3', className)}>
            {children}
        </div>
    );
}

export { Modal, ModalTrigger, ModalContent, ModalFooter };
