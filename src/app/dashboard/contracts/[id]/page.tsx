'use client';

import { use } from 'react';
import { ContractDetail } from '@/components/contracts/ContractDetail';

/** /dashboard/contracts/[id] — гэрээний бүтэн дэлгэрэнгүй (v2). */
export default function ContractDetailRoute({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <ContractDetail id={id} />;
}
