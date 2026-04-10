import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { getProductFromDB } from '../../../helpers/stockHelpers';
import type { UpdateOrderArgs } from '../../definitions';
import type { ToolExecutionResult, ToolExecutionContext } from '../../../services/ToolExecutor';

export async function executeUpdateOrder(
    args: UpdateOrderArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();
    const { action, product_name, new_quantity, notes } = args;

    try {
        const { data: pendingOrder, error: orderError } = await supabase
            .from('orders')
            .select('id, status, notes, order_items(id, product_id, product_name, quantity, unit_price)')
            .eq('shop_id', context.shopId)
            .eq('customer_id', context.customerId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (orderError || !pendingOrder) {
            return {
                success: false,
                error: 'Өөрчлөх боломжтой захиалга олдсонгүй. Зөвхөн "Хүлээгдэж буй" статустай захиалгыг өөрчилнө.'
            };
        }

        const orderId = pendingOrder.id;

        switch (action) {
            case 'change_quantity': {
                if (!product_name || !new_quantity || new_quantity < 1) {
                    return { success: false, error: 'Барааны нэр болон шинэ тоо хэмжээг оруулна уу.' };
                }

                const orderItems = pendingOrder.order_items as { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }[];
                const item = orderItems?.find((i: { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }) =>
                    i.product_name.toLowerCase().includes(product_name.toLowerCase())
                );

                if (!item) {
                    return { success: false, error: `"${product_name}" захиалгад олдсонгүй.` };
                }

                const { error: updateError } = await supabase
                    .from('order_items')
                    .update({ quantity: new_quantity })
                    .eq('id', item.id);

                if (updateError) throw updateError;

                const newTotal = orderItems.reduce((sum: number, i: any) => {
                    const qty = i.id === item.id ? new_quantity : i.quantity;
                    return sum + (i.unit_price * qty);
                }, 0);

                await supabase.from('orders').update({ total: newTotal }).eq('id', orderId);

                return {
                    success: true,
                    message: `✅ "${item.product_name}" тоо хэмжээг ${new_quantity} болгож өөрчиллөө. Шинэ нийт дүн: ${newTotal.toLocaleString()}₮`,
                    data: { order_id: orderId, new_quantity, new_total: newTotal }
                };
            }

            case 'remove_item': {
                if (!product_name) {
                    return { success: false, error: 'Хасах барааны нэрийг оруулна уу.' };
                }

                const orderItems = pendingOrder.order_items as { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }[];
                const item = orderItems?.find((i: { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }) =>
                    i.product_name.toLowerCase().includes(product_name.toLowerCase())
                );

                if (!item) {
                    return { success: false, error: `"${product_name}" захиалгад олдсонгүй.` };
                }

                await supabase.from('order_items').delete().eq('id', item.id);

                const remainingItems = orderItems.filter((i: { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }) => i.id !== item.id);
                const newTotal = remainingItems.reduce((sum: number, i: any) =>
                    sum + (i.unit_price * i.quantity), 0
                );

                if (remainingItems.length === 0) {
                    await supabase
                        .from('orders')
                        .update({ status: 'cancelled', notes: 'Бүх бараа хасагдсан' })
                        .eq('id', orderId);

                    return {
                        success: true,
                        message: `✅ "${item.product_name}" хасагдлаа. Захиалгад бараа үлдээгүй тул цуцлагдлаа.`,
                        data: { order_id: orderId, cancelled: true }
                    };
                }

                await supabase.from('orders').update({ total: newTotal }).eq('id', orderId);

                return {
                    success: true,
                    message: `✅ "${item.product_name}" захиалгаас хасагдлаа. Шинэ нийт дүн: ${newTotal.toLocaleString()}₮`,
                    data: { order_id: orderId, new_total: newTotal }
                };
            }

            case 'update_notes': {
                const newNotes = notes || '';
                await supabase.from('orders').update({ notes: newNotes }).eq('id', orderId);

                return {
                    success: true,
                    message: `✅ Захиалгын тэмдэглэл шинэчлэгдлээ.`,
                    data: { order_id: orderId, notes: newNotes }
                };
            }

            case 'add_item': {
                if (!product_name) {
                    return { success: false, error: 'Нэмэх барааны нэрийг оруулна уу.' };
                }

                const quantity = new_quantity || 1;
                const product = await getProductFromDB(context.shopId, product_name);

                if (!product) {
                    return { success: false, error: `"${product_name}" бараа олдсонгүй.` };
                }

                const unitPrice = product.discount_percent
                    ? Math.round(product.price * (1 - product.discount_percent / 100))
                    : product.price;

                await supabase.from('order_items').insert({
                    order_id: orderId,
                    product_id: product.id,
                    product_name: product.name,
                    quantity,
                    unit_price: unitPrice
                });

                const orderItems = pendingOrder.order_items as { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }[];
                const currentTotal = orderItems.reduce((sum: number, i: any) =>
                    sum + (i.unit_price * i.quantity), 0
                );
                const newTotal = currentTotal + (unitPrice * quantity);

                await supabase.from('orders').update({ total: newTotal }).eq('id', orderId);

                return {
                    success: true,
                    message: `✅ "${product.name}" x${quantity} захиалгад нэмэгдлээ. Шинэ нийт дүн: ${newTotal.toLocaleString()}₮`,
                    data: { order_id: orderId, added_product: product.name, quantity, new_total: newTotal }
                };
            }

            default:
                return { success: false, error: `Тодорхойгүй үйлдэл: ${action}` };
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Update order error:', { error: errorMessage });
        return { success: false, error: 'Захиалга өөрчлөхөд алдаа гарлаа' };
    }
}
