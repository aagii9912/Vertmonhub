'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectColumn } from '@/components/ui/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils/date';
import { useOrders, OrderWithDetails } from '@/hooks/useOrders';
import { useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useUpdateOrder';
import {
  Package,
  User,
  Phone,
  MapPin,
  Clock,
  Check,
  Truck,
  X,
  RefreshCw,
  MessageSquare,
  FileSpreadsheet,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function OrdersPage() {
  const [filter, setFilter] = useState<string>('all');
  const { t } = useLanguage();

  const statusOptions = [
    { value: 'pending', label: t.orders.statusPending, icon: Clock, color: 'bg-yellow-500' },
    { value: 'confirmed', label: t.orders.statusConfirmed, icon: Check, color: 'bg-blue-500' },
    { value: 'processing', label: t.orders.statusProcessing, icon: Package, color: 'bg-purple-500' },
    { value: 'shipped', label: t.orders.statusShipped, icon: Truck, color: 'bg-indigo-500' },
    { value: 'delivered', label: t.orders.statusDelivered, icon: Check, color: 'bg-green-500' },
    { value: 'cancelled', label: t.orders.statusCancelled, icon: X, color: 'bg-red-500' },
  ];
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const { data: orders = [], isLoading, refetch, isRefetching } = useOrders(dateRange);
  const { mutate: updateStatus } = useUpdateOrder();
  const { mutate: bulkUpdateStatus } = useBulkUpdateOrders();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkSelectedOrders, setBulkSelectedOrders] = useState<OrderWithDetails[]>([]);
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');

  const selectedOrder = orders.find(o => o.id === selectedOrderId) || null;

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  const columns: ColumnDef<OrderWithDetails, unknown>[] = useMemo(() => [
    createSelectColumn<OrderWithDetails>(),
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="text-[13px] text-white/40 font-mono tracking-[-0.01em]">
          #{row.original.id.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t.orders.status,
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      filterFn: (row, _columnId, filterValue) => {
        if (filterValue === 'all') return true;
        return row.original.status === filterValue;
      },
    },
    {
      id: 'products',
      header: t.orders.products,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          {row.original.order_items.slice(0, 2).map((item, idx) => (
            <p key={idx} className="text-[13px] font-medium text-foreground tracking-[-0.01em]">
              {item.products?.name || t.orders.products} x{item.quantity}
            </p>
          ))}
          {row.original.order_items.length > 2 && (
            <p className="text-[11px] text-white/30">+{row.original.order_items.length - 2} {t.orders.others}</p>
          )}
        </div>
      ),
    },
    {
      id: 'customer',
      header: t.orders.customer,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-white/20" strokeWidth={1.5} />
          <span className="text-[13px] text-foreground tracking-[-0.01em]">
            {row.original.customers?.name || t.orders.anonymous}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 text-[11px] uppercase tracking-[0.05em] text-white/40"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          {t.orders.amount}
          {column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ),
      cell: ({ row }) => (
        <p className="font-semibold text-[13px] text-foreground tabular-nums tracking-[-0.01em]">
          ₮{Number(row.original.total_amount).toLocaleString()}
        </p>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 text-[11px] uppercase tracking-[0.05em] text-white/40"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          {t.orders.date}
          {column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-white/40 tracking-[-0.01em]">{formatDate(row.original.created_at)}</span>
      ),
    },
  ], []);

  const handleBulkAction = (selectedRows: OrderWithDetails[], action: string) => {
    if (action === 'status') {
      setBulkSelectedOrders(selectedRows);
      setShowBulkStatusModal(true);
    }
  };

  const [tableKey, setTableKey] = useState(0);

  const handleBulkStatusUpdate = (newStatus: string) => {
    const orderIds = bulkSelectedOrders.map(o => o.id);
    bulkUpdateStatus({ orderIds, status: newStatus });
    setShowBulkStatusModal(false);
    setBulkSelectedOrders([]);
    setTableKey(prev => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[13px] text-white/40 tracking-[-0.01em]">{t.orders.loading}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-white/50 border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors tracking-[-0.01em]"
          onClick={() => window.open('/api/orders/export', '_blank')}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.5} />
          Export
        </button>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="p-1.5 border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap gap-4 items-end bg-[#0F0B2E] p-4 rounded-lg border border-white/[0.08]">
        <div>
          <label className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em] mb-1 block">{t.orders.startDate}</label>
          <input
            type="date"
            value={dateFromInput}
            className="px-3 py-2 border border-white/[0.08] rounded-md text-[13px] bg-transparent focus:outline-none focus:border-[#4A7CE7] transition-colors tracking-[-0.01em]"
            onChange={(e) => {
              setDateFromInput(e.target.value);
              setDateRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : undefined }));
            }}
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em] mb-1 block">{t.orders.endDate}</label>
          <input
            type="date"
            value={dateToInput}
            className="px-3 py-2 border border-white/[0.08] rounded-md text-[13px] bg-transparent focus:outline-none focus:border-[#4A7CE7] transition-colors tracking-[-0.01em]"
            onChange={(e) => {
              setDateToInput(e.target.value);
              setDateRange(prev => ({ ...prev, to: e.target.value ? new Date(new Date(e.target.value).setHours(23, 59, 59, 999)) : undefined }));
            }}
          />
        </div>
        {(dateRange.from || dateRange.to) && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#4A7CE7]/10 text-[#4A7CE7] rounded-md text-[11px] font-medium mb-0.5">
            <span>{t.orders.filterActive}</span>
            <button onClick={() => {
              setDateFromInput('');
              setDateToInput('');
              setDateRange({ from: undefined, to: undefined });
            }} className="hover:bg-[#4A7CE7]/20 rounded p-0.5 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-md font-medium text-[12px] whitespace-nowrap transition-all tracking-[-0.01em] ${filter === 'all'
            ? 'bg-[#1C1650] text-foreground'
            : 'text-white/40 hover:bg-[#0F0B2E]'
            }`}
        >
          {t.orders.all} ({orders.length})
        </button>
        {statusOptions.map((status) => {
          const count = orders.filter(o => o.status === status.value).length;
          return (
            <button
              key={status.value}
              onClick={() => setFilter(status.value)}
              className={`px-3 py-1.5 rounded-md font-medium text-[12px] whitespace-nowrap transition-all tracking-[-0.01em] ${filter === status.value
                ? 'bg-[#1C1650] text-foreground'
                : 'text-white/40 hover:bg-[#0F0B2E]'
                }`}
            >
              {status.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Orders DataTable - Desktop */}
        <div className="lg:col-span-2 hidden md:block">
          <DataTable
            key={tableKey}
            columns={columns}
            data={filteredOrders}
            enableRowSelection
            onBulkAction={handleBulkAction}
            bulkActions={[
              { label: t.orders.changeStatusAction, value: 'status', icon: <Truck className="w-4 h-4 mr-1" /> },
            ]}
            pageSize={10}
          />
        </div>

        {/* Orders List - Mobile Cards */}
        <div className="lg:col-span-2 md:hidden space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] py-12 text-center">
              <Package className="w-10 h-10 mx-auto mb-4 text-white/15" strokeWidth={1.5} />
              <p className="text-[13px] text-white/40 tracking-[-0.01em]">{t.orders.noOrders}</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div
                key={order.id}
                className={`bg-[#0F0B2E] rounded-lg border cursor-pointer transition-colors ${selectedOrderId === order.id
                  ? 'border-[#4A7CE7]/40'
                  : 'border-white/[0.08] hover:border-[#4A7CE7]/20'
                  }`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <OrderStatusBadge status={order.status} />
                        <span className="text-[11px] text-white/30 font-mono">
                          #{order.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {order.order_items.map((item, idx) => (
                          <p key={idx} className="font-medium text-[13px] text-foreground tracking-[-0.01em]">
                            {item.products?.name || t.orders.products} x{item.quantity}
                          </p>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-[12px] text-white/40">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {order.customers?.name || t.orders.customer}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {formatDate(order.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-foreground tabular-nums tracking-[-0.02em]">
                        ₮{Number(order.total_amount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Detail */}
        <div className="lg:col-span-1">
          {selectedOrder ? (
            <div className="sticky top-6 bg-[#0F0B2E] rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <span className="text-sm font-semibold text-foreground tracking-[-0.01em]">{t.orders.details}</span>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>
              <div className="p-5 space-y-5">
                {/* Customer Info */}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.orders.customerInfo}</h3>
                  <div className="bg-[#0F0B2E] rounded-md p-3 space-y-2">
                    <p className="font-medium text-[13px] text-foreground tracking-[-0.01em]">{selectedOrder.customers?.name || t.orders.noName}</p>
                    {selectedOrder.customers?.phone && (
                      <p className="text-[12px] text-white/40 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {selectedOrder.customers.phone}
                      </p>
                    )}
                    {(selectedOrder.delivery_address || selectedOrder.customers?.address) && (
                      <p className="text-[12px] text-white/40 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {selectedOrder.delivery_address || selectedOrder.customers?.address}
                      </p>
                    )}
                    {selectedOrder.customers?.facebook_id && (
                      <p className="text-[12px] text-white/40 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
                        Messenger
                      </p>
                    )}
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.orders.products}</h3>
                  <div className="space-y-1.5">
                    {selectedOrder.order_items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-[#0F0B2E] rounded-md p-3">
                        <div>
                          <p className="font-medium text-[13px] text-foreground tracking-[-0.01em]">{item.products?.name}</p>
                          <p className="text-[11px] text-white/40">
                            ₮{Number(item.unit_price).toLocaleString()} x {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-[13px] tabular-nums tracking-[-0.01em]">
                          ₮{(Number(item.unit_price) * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/[0.08] pt-3 flex justify-between items-center">
                    <span className="font-medium text-[13px] tracking-[-0.01em]">{t.orders.totalAmount}</span>
                    <span className="text-lg font-semibold text-foreground tracking-[-0.02em]">
                      ₮{Number(selectedOrder.total_amount).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {selectedOrder.notes && (
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.orders.notes}</h3>
                    <p className="text-[13px] text-white/60 bg-[#0F0B2E] rounded-md p-3 tracking-[-0.01em]">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {/* Status Update */}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-[0.05em]">{t.orders.changeStatus}</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {statusOptions.map((status) => {
                      const Icon = status.icon;
                      const isActive = selectedOrder.status === status.value;

                      return (
                        <button
                          key={status.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStatus({ orderId: selectedOrder.id, status: status.value });
                          }}
                          disabled={isActive}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium transition-all tracking-[-0.01em] ${isActive
                            ? 'bg-[#4A7CE7]/10 text-[#4A7CE7] cursor-default'
                            : 'bg-[#0F0B2E] text-white/50 hover:bg-[#151040]'
                            }`}
                        >
                          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {status.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="text-[11px] text-white/30 space-y-1 pt-4 border-t border-white/[0.08]">
                  <p>{t.orders.created} {formatDate(selectedOrder.created_at)}</p>
                  <p>{t.orders.updated} {formatDate(selectedOrder.updated_at)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] py-12 text-center">
              <Package className="w-10 h-10 mx-auto mb-4 text-white/10" strokeWidth={1.5} />
              <p className="text-[13px] text-white/40 tracking-[-0.01em]">{t.orders.selectOrder}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Status Update Modal */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#141414] rounded-lg border border-white/[0.08] w-full max-w-md p-6 m-4">
            <h2 className="text-base font-semibold text-foreground mb-4 tracking-[-0.02em]">
              {bulkSelectedOrders.length} {t.orders.bulkChangeStatus}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((status) => {
                const Icon = status.icon;
                return (
                  <button
                    key={status.value}
                    onClick={() => handleBulkStatusUpdate(status.value)}
                    className="flex items-center gap-2 px-4 py-3 rounded-md bg-[#0F0B2E] text-foreground hover:bg-[#151040] transition-colors font-medium text-[13px] tracking-[-0.01em]"
                  >
                    <Icon className="w-4 h-4 text-white/30" strokeWidth={1.5} />
                    {status.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowBulkStatusModal(false)}
              className="mt-4 w-full py-2 text-[13px] text-white/40 hover:text-foreground transition-colors tracking-[-0.01em]"
            >
              {t.orders.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
