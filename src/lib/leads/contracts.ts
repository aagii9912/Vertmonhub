/** Хоосон stub болон цуцалсан гэрээг борлуулалт гэж тооцохгүй. */
export function hasRealContractFields(contract: {
    contract_number: string | null;
    total_price: number | string | null;
    contract_status: string | null;
}): boolean {
    return !!contract.contract_number?.trim()
        && Number.isFinite(Number(contract.total_price))
        && Number(contract.total_price) > 0
        && (contract.contract_status === 'active' || contract.contract_status === 'closed');
}
