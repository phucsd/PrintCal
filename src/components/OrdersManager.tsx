'use client';

// =============================================================================
// Quản lý Đơn hàng & Báo giá – theo dõi tiến độ 6 bước, in phiếu, mở lại máy tính
// =============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import type { OrderStatus, QuoteOrder } from '@/types';
import { ApiError, api, errorMessage, useApi, useDebounced } from '@/lib/client';
import { formatDateTime, formatNumber, formatVnd, formatVndShort } from '@/lib/format';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, PRODUCT_TYPE_LABELS, PRODUCT_UNITS } from '@/lib/engine/constants';
import { ORDER_STATUSES } from '@/lib/validation';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Table,
  TextInput,
  Textarea,
  cn,
  td,
  th,
  useToast,
} from './ui';
import { QuotePrintModal } from './QuotePrintModal';
import { ImpositionVisualizer } from './ImpositionVisualizer';
import { buildZaloText } from './calculator/zalo';
import { formFromOrder, specFromOrder, type LoadRequest, type MasterData } from './calculator/types';

type BadgeTone = 'slate' | 'blue' | 'amber' | 'purple' | 'green' | 'teal' | 'red';

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  quote: 'slate',
  approved: 'blue',
  printing: 'amber',
  finishing: 'purple',
  completed: 'green',
  delivered: 'teal',
  cancelled: 'red',
};

const NEXT_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  quote: 'Duyệt đơn',
  approved: 'Đưa vào in',
  printing: 'Chuyển gia công',
  finishing: 'Hoàn thành',
  completed: 'Giao hàng',
};

function nextStatusOf(status: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx >= ORDER_STATUS_FLOW.length - 1) return null;
  return ORDER_STATUS_FLOW[idx + 1];
}

export function OrdersManager({
  master,
  onOpenInCalculator,
  onChanged,
}: {
  master: MasterData;
  onOpenInCalculator: (req: Omit<LoadRequest, 'nonce'>) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<QuoteOrder[]>('/api/orders');
  const orders = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim().toLowerCase(), 250);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const [detailId, setDetailId] = useState<number | null>(null);
  const [printingOrder, setPrintingOrder] = useState<QuoteOrder | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<QuoteOrder | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // ---- Thống kê nhanh ----
  const stats = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    let inProduction = 0;
    let doneCount = 0;
    let confirmedRevenue = 0;
    let confirmedProfit = 0;

    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
      if (o.status === 'approved' || o.status === 'printing' || o.status === 'finishing') inProduction += 1;
      if (o.status === 'completed' || o.status === 'delivered') doneCount += 1;
      if (o.status !== 'quote' && o.status !== 'cancelled') {
        confirmedRevenue += o.finalPrice;
        confirmedProfit += Math.max(0, o.finalPrice - o.vatAmount - o.totalCost);
      }
    }
    return { counts, inProduction, doneCount, confirmedRevenue, confirmedProfit };
  }, [orders]);

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (query) {
          const hay = `${o.code} ${o.customerName} ${o.customerPhone} ${o.customerCompany} ${o.jobName} ${o.paperName}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      }),
    [orders, statusFilter, query]
  );

  // ---- Tải chi tiết đơn đầy đủ (kèm spec_json) ----
  const loadFullOrder = async (id: number): Promise<QuoteOrder | null> => {
    setBusyId(id);
    try {
      return await api<QuoteOrder>(`/api/orders/${id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (order: QuoteOrder, status: OrderStatus) => {
    if (status === order.status) return;
    setBusyId(order.id);
    try {
      const updated = await api<QuoteOrder>(`/api/orders/${order.id}`, { method: 'PATCH', body: { status } });
      setData((prev) => prev?.map((o) => (o.id === order.id ? { ...updated, spec: null } : o)));
      toast.success(`${order.code}: ${ORDER_STATUS_LABELS[status]}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handlePrint = async (order: QuoteOrder) => {
    const full = await loadFullOrder(order.id);
    if (full) setPrintingOrder(full);
  };

  const handleCopyZalo = async (order: QuoteOrder) => {
    const full = await loadFullOrder(order.id);
    if (!full) return;
    const spec = specFromOrder(full);
    const text = buildZaloText(spec.input, spec.result, spec.paper, master.settings, full.code);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã copy báo giá ${full.code} – dán vào Zalo để gửi khách.`);
    } catch {
      toast.error('Trình duyệt không cho phép copy tự động.');
    }
  };

  const handleReopen = async (order: QuoteOrder) => {
    const full = await loadFullOrder(order.id);
    if (!full) return;
    onOpenInCalculator({ form: formFromOrder(full, master), sourceCode: full.code });
  };

  const confirmDelete = async () => {
    if (!deletingOrder) return;
    const target = deletingOrder;
    setBusyId(target.id);
    try {
      await api(`/api/orders/${target.id}`, { method: 'DELETE' });
      setData((prev) => prev?.filter((o) => o.id !== target.id));
      if (detailId === target.id) setDetailId(null);
      setDeletingOrder(null);
      toast.success(`Đã xoá đơn ${target.code}.`);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đơn hàng & báo giá"
        description="Quản lý báo giá, theo dõi tiến độ sản xuất xưởng in và xuất phiếu in A4."
        actions={
          <Button icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
            Tải lại
          </Button>
        }
      />

      {/* Thẻ chỉ số nhanh */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<ClipboardList className="w-4 h-4 text-blue-600" />}
          label="Tổng đơn & báo giá"
          value={formatNumber(orders.length)}
          sub={`${formatNumber(stats.counts.quote ?? 0)} đang chờ duyệt`}
        />
        <KpiCard
          icon={<Wrench className="w-4 h-4 text-amber-600" />}
          label="Đang sản xuất"
          value={formatNumber(stats.inProduction)}
          sub={`In: ${stats.counts.printing ?? 0} · Gia công: ${stats.counts.finishing ?? 0}`}
        />
        <KpiCard
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          label="Hoàn thành / Đã giao"
          value={formatNumber(stats.doneCount)}
          sub={`Đã giao: ${formatNumber(stats.counts.delivered ?? 0)} đơn`}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
          label="Doanh thu đơn chốt"
          value={formatVndShort(stats.confirmedRevenue)}
          sub={`Lãi gộp ước tính: ${formatVndShort(stats.confirmedProfit)}`}
        />
      </div>

      <Card bodyClassName="p-0">
        {/* Bộ lọc */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="relative sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã đơn, tên khách, SĐT, tên bài in…"
                className="pl-8"
                aria-label="Tìm kiếm đơn hàng"
              />
            </div>
            <span className="text-xs text-slate-500">
              Hiển thị <strong>{formatNumber(filtered.length)}</strong> / {formatNumber(orders.length)} đơn
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(['all', ...ORDER_STATUSES] as const).map((st) => {
              const active = statusFilter === st;
              const count = stats.counts[st] ?? 0;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors',
                    active ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <span>{st === 'all' ? 'Tất cả' : ORDER_STATUS_LABELS[st]}</span>
                  <span className={cn('px-1.5 rounded-full text-[10px] font-bold', active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="error" title="Không tải được danh sách đơn hàng">
              {error}{' '}
              <button type="button" className="underline font-medium" onClick={reload}>
                Thử lại
              </button>
            </Alert>
          </div>
        )}

        {!data && loading ? (
          <LoadingBlock text="Đang tải đơn hàng…" />
        ) : data && filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-10 h-10" />}
            title={orders.length === 0 ? 'Chưa có báo giá / đơn hàng nào' : 'Không tìm thấy đơn phù hợp'}
            description={
              orders.length === 0
                ? 'Hãy tính giá ở tab "Tính giá" và bấm "Lưu báo giá" để tạo đơn hàng đầu tiên.'
                : 'Thử đổi trạng thái lọc hoặc xoá từ khoá tìm kiếm.'
            }
            action={
              orders.length > 0 && (search !== '' || statusFilter !== 'all') ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  Xoá bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : data ? (
          <>
            {/* Bảng trên màn hình lớn */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Mã đơn</th>
                    <th className={th}>Khách hàng</th>
                    <th className={th}>Ấn phẩm & quy cách</th>
                    <th className={cn(th, 'text-center')}>Công nghệ</th>
                    <th className={cn(th, 'text-right')}>Số lượng</th>
                    <th className={cn(th, 'text-right')}>Tổng thanh toán</th>
                    <th className={th}>Tiến độ</th>
                    <th className={cn(th, 'text-right')}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const busy = busyId === o.id;
                    const next = nextStatusOf(o.status);
                    const unit = PRODUCT_UNITS[o.productType] ?? 'sp';
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70">
                        <td className={cn(td, 'whitespace-nowrap')}>
                          <button type="button" onClick={() => setDetailId(o.id)} className="font-bold text-blue-600 hover:underline text-left">
                            {o.code}
                          </button>
                          <div className="text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</div>
                        </td>
                        <td className={cn(td, 'min-w-40')}>
                          <div className="font-medium text-slate-900">{o.customerName}</div>
                          <div className="text-xs text-slate-500">
                            {o.customerPhone || 'Chưa có SĐT'}
                            {o.customerCompany ? ` · ${o.customerCompany}` : ''}
                          </div>
                        </td>
                        <td className={cn(td, 'min-w-52')}>
                          <div className="font-medium text-slate-900">{o.jobName}</div>
                          <div className="text-xs text-slate-500">
                            {o.widthMm}×{o.heightMm}mm · {o.paperName} ({formatNumber(o.totalPrintSheets)} tờ in)
                          </div>
                        </td>
                        <td className={cn(td, 'text-center whitespace-nowrap')}>
                          <Badge tone={o.printTech === 'offset' ? 'blue' : 'sky'}>{o.printTech === 'offset' ? 'Offset' : 'In nhanh'}</Badge>
                        </td>
                        <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-semibold text-slate-800')}>
                          {formatNumber(o.quantity)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                        </td>
                        <td className={cn(td, 'text-right tabular-nums whitespace-nowrap')}>
                          <div className="font-bold text-slate-900">{formatVnd(o.finalPrice)}</div>
                          <div className="text-[11px] text-slate-500">{formatVnd(o.unitPrice)}/{unit}</div>
                        </td>
                        <td className={cn(td, 'whitespace-nowrap')}>
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={o.status}
                              disabled={busy}
                              onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
                              aria-label={`Trạng thái ${o.code}`}
                              className="py-1 px-2 text-xs w-36"
                            >
                              {ORDER_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {ORDER_STATUS_LABELS[st]}
                                </option>
                              ))}
                            </Select>
                            {next && (
                              <button
                                type="button"
                                disabled={busy}
                                title={`Chuyển sang: ${ORDER_STATUS_LABELS[next]}`}
                                onClick={() => changeStatus(o, next)}
                                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"
                              >
                                {NEXT_ACTION_LABELS[o.status]}
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={cn(td, 'text-right whitespace-nowrap')}>
                          <div className="inline-flex items-center gap-0.5">
                            <IconButton label="Xem & sửa chi tiết" disabled={busy} onClick={() => setDetailId(o.id)}>
                              <Eye className="w-4 h-4" />
                            </IconButton>
                            <IconButton label="In báo giá / lệnh sản xuất" disabled={busy} onClick={() => handlePrint(o)}>
                              <Printer className="w-4 h-4" />
                            </IconButton>
                            <IconButton label="Copy báo giá Zalo" disabled={busy} onClick={() => handleCopyZalo(o)}>
                              <Copy className="w-4 h-4" />
                            </IconButton>
                            <IconButton label="Mở lại trong máy tính giá" disabled={busy} onClick={() => handleReopen(o)}>
                              <Calculator className="w-4 h-4" />
                            </IconButton>
                            <IconButton label="Xoá đơn" tone="danger" disabled={busy} onClick={() => setDeletingOrder(o)}>
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            {/* Thẻ gọn trên điện thoại */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((o) => {
                const busy = busyId === o.id;
                const unit = PRODUCT_UNITS[o.productType] ?? 'sp';
                return (
                  <div key={o.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button type="button" onClick={() => setDetailId(o.id)} className="font-bold text-blue-600 hover:underline">
                          {o.code}
                        </button>
                        <p className="text-sm font-semibold text-slate-900">{o.jobName}</p>
                        <p className="text-xs text-slate-500">
                          {o.customerName} {o.customerPhone ? `· ${o.customerPhone}` : ''} · {formatDateTime(o.createdAt, false)}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {o.widthMm}×{o.heightMm}mm · {formatNumber(o.quantity)} {unit} · {o.printTech === 'offset' ? 'Offset' : 'In nhanh'}
                      </span>
                      <strong className="text-sm text-slate-900 tabular-nums">{formatVnd(o.finalPrice)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Select
                        value={o.status}
                        disabled={busy}
                        onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
                        className="py-1 px-2 text-xs flex-1"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {ORDER_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </Select>
                      <div className="inline-flex items-center gap-0.5">
                        <IconButton label="Chi tiết" disabled={busy} onClick={() => setDetailId(o.id)}>
                          <Eye className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="In phiếu" disabled={busy} onClick={() => handlePrint(o)}>
                          <Printer className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="Mở lại máy tính" disabled={busy} onClick={() => handleReopen(o)}>
                          <Calculator className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="Xoá" tone="danger" disabled={busy} onClick={() => setDeletingOrder(o)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </Card>

      {/* Chi tiết & sửa đơn */}
      {detailId !== null && (
        <OrderDetailModal
          orderId={detailId}
          master={master}
          onClose={() => setDetailId(null)}
          onSaved={(updated) => {
            setData((prev) => prev?.map((o) => (o.id === updated.id ? { ...updated, spec: null } : o)));
          }}
          onPrint={(full) => setPrintingOrder(full)}
          onReopen={(full) => {
            setDetailId(null);
            onOpenInCalculator({ form: formFromOrder(full, master), sourceCode: full.code });
          }}
          onDelete={(full) => setDeletingOrder(full)}
        />
      )}

      {/* Modal in báo giá / lệnh sản xuất */}
      {printingOrder && (
        <QuotePrintModal
          open
          onClose={() => setPrintingOrder(null)}
          spec={specFromOrder(printingOrder)}
          settings={master.settings}
          code={printingOrder.code}
          date={printingOrder.createdAt}
          customer={{
            name: printingOrder.customerName,
            phone: printingOrder.customerPhone,
            company: printingOrder.customerCompany,
            email: printingOrder.customerEmail,
          }}
          notes={printingOrder.notes}
        />
      )}

      {/* Xác nhận xoá */}
      {deletingOrder && (
        <Modal
          open
          onClose={() => setDeletingOrder(null)}
          size="sm"
          title={`Xoá đơn hàng ${deletingOrder.code}?`}
          footer={
            <>
              <Button onClick={() => setDeletingOrder(null)} disabled={busyId === deletingOrder.id}>
                Huỷ
              </Button>
              <Button variant="danger" loading={busyId === deletingOrder.id} onClick={confirmDelete}>
                Xoá vĩnh viễn
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Đơn hàng <strong>{deletingOrder.jobName}</strong> của khách <strong>{deletingOrder.customerName}</strong> ({formatVnd(deletingOrder.finalPrice)}) sẽ bị xoá vĩnh viễn.
            Nếu đơn chỉ dừng thực hiện, bạn nên chuyển trạng thái sang <strong>Đã huỷ</strong> thay vì xoá.
          </p>
        </Modal>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <p className="text-xl font-black text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modal xem chi tiết & cập nhật đơn hàng
// -----------------------------------------------------------------------------

function OrderDetailModal({
  orderId,
  master,
  onClose,
  onSaved,
  onPrint,
  onReopen,
  onDelete,
}: {
  orderId: number;
  master: MasterData;
  onClose: () => void;
  onSaved: (updated: QuoteOrder) => void;
  onPrint: (order: QuoteOrder) => void;
  onReopen: (order: QuoteOrder) => void;
  onDelete: (order: QuoteOrder) => void;
}) {
  const { data: order, error, loading, setData } = useApi<QuoteOrder>(`/api/orders/${orderId}`);

  return (
    <Modal open onClose={onClose} size="xl" title={order ? `Đơn hàng ${order.code} – ${order.jobName}` : 'Chi tiết đơn hàng'}>
      {loading && !order ? (
        <LoadingBlock text="Đang tải chi tiết đơn hàng…" />
      ) : error && !order ? (
        <Alert tone="error" title="Không tải được đơn hàng">
          {error}
        </Alert>
      ) : order ? (
        <OrderDetailBody
          key={`${order.id}-${order.updatedAt}`}
          order={order}
          master={master}
          onUpdated={(u) => {
            setData(() => u);
            onSaved(u);
          }}
          onPrint={() => onPrint(order)}
          onReopen={() => onReopen(order)}
          onDelete={() => onDelete(order)}
        />
      ) : null}
    </Modal>
  );
}

function OrderDetailBody({
  order,
  master,
  onUpdated,
  onPrint,
  onReopen,
  onDelete,
}: {
  order: QuoteOrder;
  master: MasterData;
  onUpdated: (u: QuoteOrder) => void;
  onPrint: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone);
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail);
  const [customerCompany, setCustomerCompany] = useState(order.customerCompany);
  const [jobName, setJobName] = useState(order.jobName);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.notes);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const dirty =
    customerName.trim() !== order.customerName ||
    customerPhone.trim() !== order.customerPhone ||
    customerEmail.trim() !== order.customerEmail ||
    customerCompany.trim() !== order.customerCompany ||
    jobName.trim() !== order.jobName ||
    status !== order.status ||
    notes.trim() !== order.notes;

  const save = async (nextStatus?: OrderStatus) => {
    setSaving(true);
    setErrors([]);
    try {
      const updated = await api<QuoteOrder>(`/api/orders/${order.id}`, {
        method: 'PUT',
        body: {
          customerName,
          customerPhone,
          customerEmail,
          customerCompany,
          jobName,
          status: nextStatus ?? status,
          notes,
        },
      });
      onUpdated(updated);
      toast.success(`Đã cập nhật đơn ${order.code}.`);
    } catch (err) {
      setErrors(err instanceof ApiError && err.details?.length ? err.details : [errorMessage(err)]);
    } finally {
      setSaving(false);
    }
  };

  const copyZalo = async () => {
    const spec = specFromOrder(order);
    const text = buildZaloText(spec.input, spec.result, spec.paper, master.settings, order.code);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Đã copy nội dung báo giá.');
    } catch {
      toast.error('Trình duyệt không cho phép copy tự động.');
    }
  };

  const flowIndex = ORDER_STATUS_FLOW.indexOf(status);
  const unit = PRODUCT_UNITS[order.productType] ?? 'sp';

  return (
    <div className="space-y-5">
      {/* Thanh tiến độ 6 bước */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">Tiến độ sản xuất (bấm bước bất kỳ để chuyển nhanh)</span>
          <span className="text-slate-400">Cập nhật: {formatDateTime(order.updatedAt)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
          {ORDER_STATUS_FLOW.map((step, idx) => {
            const done = flowIndex >= 0 && idx <= flowIndex;
            const current = status === step;
            return (
              <button
                key={step}
                type="button"
                disabled={saving}
                onClick={() => {
                  setStatus(step);
                  save(step);
                }}
                className={cn(
                  'px-2.5 py-2 rounded-lg text-xs font-semibold border text-left transition-all',
                  current
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : done
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                <span className="block text-[10px] opacity-75">Bước {idx + 1}</span>
                {ORDER_STATUS_LABELS[step]}
              </button>
            );
          })}
        </div>
        {status === 'cancelled' && <Alert tone="error">Đơn hàng này đang ở trạng thái Đã huỷ.</Alert>}
      </div>

      {errors.length > 0 && (
        <Alert tone="error" title="Không lưu được thay đổi">
          <ul className="list-disc pl-4">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Cột trái: Thông tin sửa được */}
        <div className="lg:col-span-6 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thông tin khách hàng & đơn hàng</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tên ấn phẩm *">
              <TextInput value={jobName} onChange={(e) => setJobName(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Trạng thái">
              <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {ORDER_STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tên khách hàng *">
              <TextInput value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Số điện thoại">
              <TextInput value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30} />
            </Field>
            <Field label="Email">
              <TextInput value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Công ty">
              <TextInput value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <Field label="Ghi chú sản xuất / giao hàng">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => save()}>
              Lưu thay đổi
            </Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={onPrint}>
              In báo giá / Lệnh SX
            </Button>
            <Button icon={<Copy className="w-4 h-4" />} onClick={copyZalo}>
              Copy Zalo
            </Button>
            <Button icon={<Calculator className="w-4 h-4" />} onClick={onReopen}>
              Mở trong máy tính
            </Button>
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 ml-auto" icon={<Trash2 className="w-4 h-4" />} onClick={onDelete}>
              Xoá đơn
            </Button>
          </div>
        </div>

        {/* Cột phải: Thông số kỹ thuật & tài chính đã chốt */}
        <div className="lg:col-span-6 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quy cách kỹ thuật & chi phí đã lưu</h4>
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Loại sản phẩm" value={PRODUCT_TYPE_LABELS[order.productType] ?? order.productType} />
              <InfoRow label="Công nghệ in" value={order.printTech === 'offset' ? 'In Offset' : 'In nhanh KTS'} />
              <InfoRow label="Kích thước" value={`${order.widthMm} × ${order.heightMm} mm`} />
              <InfoRow label="Số lượng" value={`${formatNumber(order.quantity)} ${unit}`} />
              <InfoRow label="Giấy in" value={`${order.paperName} (${order.paperGsm}gsm)`} />
              <InfoRow label="Khổ mẹ / khổ in" value={`${order.parentSize} → ${order.printSize}`} />
              <InfoRow label="Bình trang" value={`${order.upsPerSheet} con / tờ in`} />
              <InfoRow label="Tổng tờ in / tờ mẹ" value={`${formatNumber(order.totalPrintSheets)} tờ in · ${formatNumber(order.totalParentSheets)} tờ mẹ`} />
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-1">
              <CostRow label="Tiền giấy" amount={order.paperCost} />
              <CostRow label="Tiền in ấn" amount={order.printCost} />
              <CostRow label="Gia công sau in" amount={order.finishingCost} />
              <CostRow label="Tổng giá vốn" amount={order.totalCost} strong />
              <CostRow label={`Lợi nhuận (${formatNumber(order.profitMarginPercent, true)}%)`} amount={order.profitAmount} />
              {order.discountAmount > 0 && <CostRow label="Giảm giá" amount={-order.discountAmount} />}
              {order.vatAmount > 0 && <CostRow label={`Thuế VAT (${formatNumber(order.vatPercent, true)}%)`} amount={order.vatAmount} />}
              <div className="flex justify-between pt-1.5 border-t border-slate-200 text-sm font-black text-blue-700">
                <span>Tổng thanh toán</span>
                <span className="tabular-nums">
                  {formatVnd(order.finalPrice)} ({formatVnd(order.unitPrice)}/{unit})
                </span>
              </div>
            </div>
          </div>

          {order.spec && (
            <div className="rounded-xl border border-slate-200 p-3">
              <ImpositionVisualizer
                imposition={order.spec.result.imposition}
                productWidthMm={order.widthMm}
                productHeightMm={order.heightMm}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-slate-400 block text-[11px]">{label}</span>
      <span className="font-semibold text-slate-800 break-words">{value}</span>
    </div>
  );
}

function CostRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between tabular-nums', strong ? 'font-semibold text-slate-900' : 'text-slate-600')}>
      <span>{label}</span>
      <span className={cn(amount < 0 && 'text-rose-600')}>{amount < 0 ? `−${formatVnd(Math.abs(amount))}` : formatVnd(amount)}</span>
    </div>
  );
}
