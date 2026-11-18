'use client';

// =============================================================================
// Quản lý khách hàng
// =============================================================================

import React, { useState } from 'react';
import { Building2, Edit2, FileText, Mail, MapPin, Phone, Plus, RefreshCw, Search, StickyNote, Trash2, UserPlus, Users } from 'lucide-react';
import type { Customer, OrderStatus, QuoteOrder } from '@/types';
import { ORDER_STATUS_LABELS } from '@/lib/engine/constants';
import { ApiError, api, errorMessage, useApi, useDebounced } from '@/lib/client';
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format';
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
  Table,
  TextInput,
  Textarea,
  cn,
  td,
  th,
  useToast,
} from '@/components/ui';

type CustomerRow = Customer & { orderCount: number; totalRevenue: number };
type CustomerForm = Pick<Customer, 'name' | 'phone' | 'email' | 'company' | 'address' | 'notes'>;

const EMPTY_FORM: CustomerForm = { name: '', phone: '', email: '', company: '', address: '', notes: '' };

const STATUS_TONE: Record<OrderStatus, 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'sky' | 'teal'> = {
  quote: 'slate',
  approved: 'blue',
  printing: 'amber',
  finishing: 'purple',
  completed: 'teal',
  delivered: 'green',
  cancelled: 'red',
};

function toForm(c: Customer): CustomerForm {
  return { name: c.name, phone: c.phone, email: c.email, company: c.company, address: c.address, notes: c.notes };
}

function apiErrors(err: unknown): string[] {
  if (err instanceof ApiError && err.details && err.details.length > 0) return err.details;
  return [errorMessage(err)];
}

// -----------------------------------------------------------------------------
// Form thêm / sửa
// -----------------------------------------------------------------------------

function CustomerFormModal({
  initial,
  editingId,
  onClose,
  onSaved,
}: {
  initial: CustomerForm;
  editingId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<CustomerForm>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (key: keyof CustomerForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: string[] = [];
    if (!form.name.trim()) local.push('Vui lòng nhập tên khách hàng.');
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) local.push('Email không hợp lệ.');
    if (local.length > 0) {
      setErrors(local);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const body: CustomerForm = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email,
        company: form.company.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
      };
      if (editingId) await api(`/api/customers/${editingId}`, { method: 'PUT', body });
      else await api('/api/customers', { method: 'POST', body });
      toast.success(editingId ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng.');
      onSaved();
    } catch (err) {
      setErrors(apiErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={editingId ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form="customer-form" loading={saving}>
            {editingId ? 'Lưu thay đổi' : 'Thêm khách hàng'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-3" noValidate>
        {errors.length > 0 && (
          <Alert tone="error" title="Không lưu được">
            <ul className="list-disc pl-4">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Alert>
        )}
        <Field label="Tên khách hàng *" htmlFor="cus-name">
          <TextInput
            id="cus-name"
            value={form.name}
            maxLength={200}
            onChange={(e) => set('name', e.target.value)}
            placeholder="VD: Anh Hoàng / Chị Mai"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Số điện thoại" htmlFor="cus-phone">
            <TextInput id="cus-phone" type="tel" value={form.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} placeholder="0901 234 567" />
          </Field>
          <Field label="Email" htmlFor="cus-email">
            <TextInput id="cus-email" type="email" value={form.email} maxLength={200} onChange={(e) => set('email', e.target.value)} placeholder="email@congty.vn" />
          </Field>
        </div>
        <Field label="Công ty / cửa hàng" htmlFor="cus-company">
          <TextInput id="cus-company" value={form.company} maxLength={200} onChange={(e) => set('company', e.target.value)} placeholder="Công ty TNHH…" />
        </Field>
        <Field label="Địa chỉ" htmlFor="cus-address">
          <TextInput id="cus-address" value={form.address} maxLength={500} onChange={(e) => set('address', e.target.value)} placeholder="Số nhà, đường, phường/xã, quận/huyện…" />
        </Field>
        <Field label="Ghi chú" htmlFor="cus-notes">
          <Textarea
            id="cus-notes"
            rows={3}
            value={form.notes}
            maxLength={2000}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Thói quen đặt hàng, lưu ý kỹ thuật, công nợ…"
          />
        </Field>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Chi tiết khách hàng + đơn hàng
// -----------------------------------------------------------------------------

function InfoLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-700 min-w-0">
      <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function CustomerDetailModal({
  customer,
  onClose,
  onEdit,
  onDelete,
}: {
  customer: CustomerRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: orders, error, loading, reload } = useApi<QuoteOrder[]>(`/api/orders?customerId=${customer.id}`);
  const list = orders ?? [];
  // Doanh thu: chỉ tính đơn đã chốt (bỏ báo giá & đơn huỷ) – giống cách tính phía server
  const revenue = list.filter((o) => o.status !== 'cancelled' && o.status !== 'quote').reduce((s, o) => s + o.finalPrice, 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={customer.name}
      footer={
        <>
          <Button variant="ghost" icon={<Trash2 className="w-4 h-4" />} className="mr-auto text-rose-600 hover:bg-rose-50" onClick={onDelete}>
            Xoá
          </Button>
          <Button icon={<Edit2 className="w-4 h-4" />} onClick={onEdit}>
            Sửa thông tin
          </Button>
          <Button variant="primary" onClick={onClose}>
            Đóng
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <InfoLine icon={<Building2 className="w-4 h-4" />}>{customer.company || <span className="text-slate-400">Chưa có công ty</span>}</InfoLine>
          <InfoLine icon={<Phone className="w-4 h-4" />}>
            {customer.phone ? (
              <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className="hover:text-blue-600">
                {customer.phone}
              </a>
            ) : (
              <span className="text-slate-400">Chưa có SĐT</span>
            )}
          </InfoLine>
          <InfoLine icon={<Mail className="w-4 h-4" />}>
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="hover:text-blue-600">
                {customer.email}
              </a>
            ) : (
              <span className="text-slate-400">Chưa có email</span>
            )}
          </InfoLine>
          <InfoLine icon={<MapPin className="w-4 h-4" />}>{customer.address || <span className="text-slate-400">Chưa có địa chỉ</span>}</InfoLine>
          {customer.notes && (
            <div className="sm:col-span-2">
              <InfoLine icon={<StickyNote className="w-4 h-4" />}>
                <span className="whitespace-pre-line text-slate-600">{customer.notes}</span>
              </InfoLine>
            </div>
          )}
          <p className="sm:col-span-2 text-xs text-slate-400">Tạo lúc {formatDateTime(customer.createdAt)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Số đơn</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatNumber(orders ? list.length : customer.orderCount)}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-blue-700" title="Không tính báo giá chưa chốt và đơn đã huỷ">
              Doanh thu
            </p>
            <p className="text-lg font-bold text-blue-900 tabular-nums">{formatVnd(orders ? revenue : customer.totalRevenue)}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" /> Đơn hàng / báo giá
            </h4>
            <IconButton label="Tải lại" onClick={reload} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </IconButton>
          </div>
          {error && (
            <Alert tone="error" className="mb-2">
              {error}
            </Alert>
          )}
          {!orders ? (
            loading && <LoadingBlock text="Đang tải đơn hàng…" />
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6 border border-dashed border-slate-200 rounded-xl">Khách hàng này chưa có đơn hàng nào.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Mã</th>
                    <th className={th}>Tên bài in</th>
                    <th className={th}>Ngày</th>
                    <th className={cn(th, 'text-right')}>Thành tiền</th>
                    <th className={cn(th, 'text-center')}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} className={cn('hover:bg-slate-50/70', o.status === 'cancelled' && 'opacity-60')}>
                      <td className={cn(td, 'font-mono text-xs text-slate-600 whitespace-nowrap')}>{o.code}</td>
                      <td className={cn(td, 'min-w-40')}>
                        <p className="font-medium text-slate-900">{o.jobName}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatNumber(o.quantity)} sp · {o.printTech === 'offset' ? 'Offset' : 'In nhanh'}
                        </p>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-xs text-slate-500')}>{formatDateTime(o.createdAt, false)}</td>
                      <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-semibold text-slate-900')}>{formatVnd(o.finalPrice)}</td>
                      <td className={cn(td, 'text-center')}>
                        <Badge tone={STATUS_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Trang chính
// -----------------------------------------------------------------------------

export function CustomerManager() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const { data, error, loading, reload, setData } = useApi<CustomerRow[]>(q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers');

  const [editor, setEditor] = useState<{ key: number; id: number | null; initial: CustomerForm } | null>(null);
  const [editorSeq, setEditorSeq] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const customers = data ?? [];
  const detail = detailId === null ? null : (customers.find((c) => c.id === detailId) ?? null);
  const searching = search.trim() !== q;

  const openEditor = (id: number | null, initial: CustomerForm) => {
    const key = editorSeq + 1;
    setEditorSeq(key);
    setEditor({ key, id, initial });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setDeleting(true);
    try {
      await api(`/api/customers/${target.id}`, { method: 'DELETE' });
      setData((prev) => prev?.filter((c) => c.id !== target.id));
      if (detailId === target.id) setDetailId(null);
      toast.success(`Đã xoá khách hàng “${target.name}”.`);
      setConfirmDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const rowActions = (c: CustomerRow) => (
    <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <IconButton label="Sửa" onClick={() => openEditor(c.id, toForm(c))}>
        <Edit2 className="w-4 h-4" />
      </IconButton>
      <IconButton label="Xoá" tone="danger" onClick={() => setConfirmDelete(c)}>
        <Trash2 className="w-4 h-4" />
      </IconButton>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Khách hàng"
        description={data ? `${formatNumber(customers.length)} khách hàng` : undefined}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
              <span className="hidden sm:inline">Tải lại</span>
            </Button>
            <Button size="sm" variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={() => openEditor(null, EMPTY_FORM)}>
              Thêm khách
            </Button>
          </>
        }
      />

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên, công ty, SĐT, email…"
          className="pl-9 bg-white"
          aria-label="Tìm khách hàng"
        />
        {searching && <span className="text-[11px] text-slate-400 absolute right-3 top-1/2 -translate-y-1/2">Đang tìm…</span>}
      </div>

      {error && (
        <Alert tone="error" title="Không tải được danh sách khách hàng">
          {error}{' '}
          <button type="button" className="underline font-medium" onClick={reload}>
            Thử lại
          </button>
        </Alert>
      )}

      {!data ? (
        loading && (
          <Card>
            <LoadingBlock text="Đang tải khách hàng…" />
          </Card>
        )
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-10 h-10" />}
            title={q ? 'Không tìm thấy khách hàng phù hợp' : 'Chưa có khách hàng nào'}
            description={q ? 'Thử từ khoá khác.' : 'Khách hàng sẽ được thêm tự động khi lưu báo giá, hoặc thêm thủ công tại đây.'}
            action={
              !q ? (
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => openEditor(null, EMPTY_FORM)}>
                  Thêm khách hàng
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* Bảng – màn hình lớn */}
          <Card bodyClassName="p-0" className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <th className={th}>Khách hàng</th>
                  <th className={th}>Liên hệ</th>
                  <th className={th}>Địa chỉ</th>
                  <th className={cn(th, 'text-right')}>Số đơn</th>
                  <th className={cn(th, 'text-right')}>Doanh thu</th>
                  <th className={th}>Ngày tạo</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/40 cursor-pointer transition-colors" onClick={() => setDetailId(c.id)}>
                    <td className={cn(td, 'min-w-44')}>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      {c.company && <p className="text-xs text-slate-500">{c.company}</p>}
                    </td>
                    <td className={cn(td, 'text-xs text-slate-600')}>
                      {c.phone && <p className="whitespace-nowrap">{c.phone}</p>}
                      {c.email && <p className="text-slate-500 break-all">{c.email}</p>}
                      {!c.phone && !c.email && <span className="text-slate-300">—</span>}
                    </td>
                    <td className={cn(td, 'text-xs text-slate-600 max-w-60')}>
                      <p className="line-clamp-2">{c.address || <span className="text-slate-300">—</span>}</p>
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{formatNumber(c.orderCount)}</td>
                    <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-semibold text-slate-900')}>{formatVnd(c.totalRevenue)}</td>
                    <td className={cn(td, 'whitespace-nowrap text-xs text-slate-500')}>{formatDateTime(c.createdAt, false)}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>{rowActions(c)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {/* Thẻ – điện thoại */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {customers.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailId(c.id);
                  }
                }}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 text-left hover:border-blue-300 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-slate-500 truncate">{c.company}</p>}
                  </div>
                  {rowActions(c)}
                </div>
                {(c.phone || c.email || c.address) && (
                  <div className="mt-1.5 space-y-1 text-xs text-slate-600">
                    {c.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1.5 break-all">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {c.email}
                      </p>
                    )}
                    {c.address && (
                      <p className="flex items-start gap-1.5 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /> {c.address}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {formatNumber(c.orderCount)} đơn · {formatDateTime(c.createdAt, false)}
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">{formatVnd(c.totalRevenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detail && !editor && !confirmDelete && (
        <CustomerDetailModal
          key={detail.id}
          customer={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => openEditor(detail.id, toForm(detail))}
          onDelete={() => setConfirmDelete(detail)}
        />
      )}

      {editor && (
        <CustomerFormModal
          key={editor.key}
          initial={editor.initial}
          editingId={editor.id}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            reload();
          }}
        />
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => !deleting && setConfirmDelete(null)}
        size="sm"
        title="Xoá khách hàng?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Huỷ
            </Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} loading={deleting} onClick={doDelete}>
              Xoá
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Bạn có chắc muốn xoá khách hàng <span className="font-semibold">“{confirmDelete?.name}”</span>?
        </p>
        {confirmDelete && confirmDelete.orderCount > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {formatNumber(confirmDelete.orderCount)} đơn hàng của khách này vẫn được giữ lại (kèm tên, SĐT đã lưu trên đơn), chỉ bỏ liên kết với danh bạ.
          </p>
        )}
      </Modal>
    </div>
  );
}
