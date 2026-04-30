'use client';

import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    // Bulk action props
    enableRowSelection?: boolean;
    onBulkAction?: (selectedRows: TData[], action: string) => void;
    bulkActions?: { label: string; value: string; icon?: React.ReactNode }[];
    // Pagination
    pageSize?: number;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    enableRowSelection = false,
    onBulkAction,
    bulkActions = [],
    pageSize = 10,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        enableRowSelection,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
        initialState: {
            pagination: {
                pageSize,
            },
        },
    });

    const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);

    return (
        <div className="space-y-4">
            {/* Bulk Actions Bar */}
            {enableRowSelection && selectedRows.length > 0 && (
                <div className="bg-brand-soft border border-brand/30 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-brand rounded flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-violet-900">
                            {selectedRows.length} сонгогдсон
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {bulkActions.map((action) => (
                            <Button
                                key={action.value}
                                variant="secondary"
                                size="sm"
                                onClick={() => onBulkAction?.(selectedRows, action.value)}
                            >
                                {action.icon}
                                {action.label}
                            </Button>
                        ))}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => table.resetRowSelection()}
                        >
                            Цуцлах
                        </Button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden bg-surface">
                <table className="w-full">
                    <thead className="bg-secondary/50 border-b border-border">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="text-left px-4 py-3 text-sm font-medium text-muted-foreground"
                                    >
                                        {header.isPlaceholder ? null : (
                                            <div
                                                className={
                                                    header.column.getCanSort()
                                                        ? 'flex items-center gap-1 cursor-pointer select-none hover:text-foreground'
                                                        : ''
                                                }
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {header.column.getCanSort() && (
                                                    <span className="text-muted-foreground/50">
                                                        {{
                                                            asc: <ChevronUp className="w-4 h-4" />,
                                                            desc: <ChevronDown className="w-4 h-4" />,
                                                        }[header.column.getIsSorted() as string] ?? (
                                                                <ChevronsUpDown className="w-4 h-4" />
                                                            )}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-border">
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                    className="hover:bg-secondary/30 transition-colors data-[state=selected]:bg-brand-soft"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-4 py-3">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    Өгөгдөл байхгүй
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-2">
                <div className="text-sm text-muted-foreground">
                    {table.getFilteredRowModel().rows.length} -н {table.getState().pagination.pageIndex * pageSize + 1}-
                    {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length)}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Өмнөх
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Дараах
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Checkbox column helper
export function createSelectColumn<T>(): ColumnDef<T, unknown> {
    return {
        id: 'select',
        header: ({ table }) => (
            <input
                type="checkbox"
                checked={table.getIsAllPageRowsSelected()}
                onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
                className="w-4 h-4 rounded border-border-strong text-brand-strong focus:ring-brand"
            />
        ),
        cell: ({ row }) => (
            <input
                type="checkbox"
                checked={row.getIsSelected()}
                onChange={(e) => row.toggleSelected(e.target.checked)}
                className="w-4 h-4 rounded border-border-strong text-brand-strong focus:ring-brand"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    };
}
