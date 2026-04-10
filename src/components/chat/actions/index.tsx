export { ConfirmationButtons } from './ConfirmationButtons';
export { CartActions } from './CartActions';
export { PaymentMethodButtons } from './PaymentMethodButtons';
export { DeliveryOptions } from './DeliveryOptions';
export { OrderActions } from './OrderActions';
export { SupportActions } from './SupportActions';

import React from 'react';
import type { ChatAction } from '@/types/ai';
import { ConfirmationButtons } from './ConfirmationButtons';
import { CartActions } from './CartActions';
import { PaymentMethodButtons } from './PaymentMethodButtons';
import { DeliveryOptions } from './DeliveryOptions';
import { OrderActions } from './OrderActions';
import { SupportActions } from './SupportActions';

interface ActionRendererProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

/**
 * ActionRenderer - ChatAction type-аар зөв component-ыг render хийнэ
 */
export function ActionRenderer({ action, onAction }: ActionRendererProps) {
    switch (action.type) {
        case 'confirmation':
            return <ConfirmationButtons action={action} onAction={onAction} />;
        case 'cart_actions':
            return <CartActions action={action} onAction={onAction} />;
        case 'payment_method':
            return <PaymentMethodButtons action={action} onAction={onAction} />;
        case 'delivery_option':
            return <DeliveryOptions action={action} onAction={onAction} />;
        case 'order_actions':
            return <OrderActions action={action} onAction={onAction} />;
        case 'support_actions':
            return <SupportActions action={action} onAction={onAction} />;
        case 'quantity_select':
            // Quantity select is handled inline in CartActions for now
            return <CartActions action={action} onAction={onAction} />;
        default:
            return null;
    }
}
