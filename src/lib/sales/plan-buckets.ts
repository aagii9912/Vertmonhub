/**
 * Гэрээ → багийн сарын төлөвлөгөөний (team_sales_targets) блок. Гэрээний дүнг төлөвлөгөөтэй харьцуулах БҮХ
 * газар энэ ганц дүрмээр:
 *  • Орон сууц + Б1 блок → b1; Орон сууц + Б2 блок → b2;
 *  • Зогсоол (аль ч блок) → parking;
 *  • бусад (Агуулах, Үйлчилгээ, өөр блокийн орон сууц, блокгүй) → null = «Төлөвлөгөөнд хамаарахгүй».
 * Төлөвлөгөөний блокийн түлхүүр зөвхөн b1/b2/parking (`MONTHLY_SALES_BLOCKS`); шинэ ангилал нэмэх нь эзэмшигчийн шийдвэр.
 */
import type { MonthlySalesBlock } from '@/lib/sales/monthly';

export interface PlanBucketSource {
    product_type?: string | null;
    block_name?: string | null;
}

export const OUTSIDE_PLAN_LABEL = 'Төлөвлөгөөнд хамаарахгүй';

export function planBucketOf(contract: PlanBucketSource): MonthlySalesBlock | null {
    const type = contract.product_type?.trim();
    if (type === 'parking') return 'parking';
    if (type !== 'residential') return null;
    const block = contract.block_name?.trim();
    if (block === 'Б1') return 'b1';
    if (block === 'Б2') return 'b2';
    return null;
}
