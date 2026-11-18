'use client';

// =============================================================================
// Kho giá giấy – danh sách, lọc, thêm / sửa / ẩn / xoá loại giấy
// =============================================================================

import React, { useId, useMemo, useState } from 'react';
import { Eye, EyeOff, Layers, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { PaperType } from '@/types';
import { ApiError, api, errorMessage, useApi, useDebounced } from '@/lib/client';
import { formatNumber, formatVnd } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  LoadingBlock,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Table,
  TextInput,
  Textarea,
  cn,
  td,
  th,
  useToast,
} from '@/components/ui';

// -----------------------------------------------------------------------------
// Tiện ích
// -----------------------------------------------------------------------------

type PaperForm = Omit<PaperType, 'id'>;
type PaperField = keyof PaperForm;
type FieldErrors = Partial<Record<PaperField, string>>;

const DEFAULT_SUPPLIER = 'Thuận Phát';

const EMPTY_FORM: PaperForm = {
  code: '',
  name: '',
  gsm: 150,
  parentWidthCm: 65,
  parentHeightCm: 86,
  priceAbove500: 0,
  priceBelow500: 0,
  supplier: DEFAULT_SUPPLIER,
  description: '',
  isActive: true,
};

/** Nhãn trường đúng như thông báo lỗi của server (src/lib/validation.ts – parsePaper) */
const FIELD_LABELS: Partial<Record<PaperField, string>> = {
  code: 'Mã giấy',
  name: 'Tên giấy',
  gsm: 'Định lượng',
  parentWidthCm: 'Khổ mẹ (rộng)',
  parentHeightCm: 'Khổ mẹ (dài)',
  priceAbove500: 'Giá từ 500 tờ',
  priceBelow500: 'Giá dưới 500 tờ',
  supplier: 'Nhà cung cấp',
  description: 'Mô tả',
};

/** Gán từng lỗi chi tiết của server vào trường tương ứng; phần còn lại là lỗi chung */
function splitErrors(err: unknown): { general: string[]; fields: FieldErrors } {
  const fields: FieldErrors = {};
  const general: string[] = [];
  const hasDetails = err instanceof ApiError && !!err.details && err.details.length > 0;
  const messages = hasDetails && err instanceof ApiError && err.details ? err.details : [errorMessage(err)];
  // Nhãn dài khớp trước để tránh nhầm nhãn con
  const labels = (Object.entries(FIELD_LABELS) as [PaperField, string][]).sort((a, b) => b[1].length - a[1].length);
  for (const msg of messages) {
    const hit = labels.find(([, label]) => msg.toLowerCase().includes(label.toLowerCase()));
    if (hit && !fields[hit[0]]) fields[hit[0]] = msg;
    else general.push(msg);
  }
  if (hasDetails) general.unshift(errorMessage(err));
  return { general: Array.from(new Set(general)), fields };
}

const GROUPS: { value: string; label: string }[] = [
  { value: 'C', label: 'Couche' },
  { value: 'I', label: 'Ivory' },
  { value: 'F', label: 'Fort' },
  { value: 'B', label: 'Bristol' },
  { value: 'D', label: 'Duplex' },
  { value: 'other', label: 'Khác' },
];

function groupOf(code: string): string {
  const c = code.trim().charAt(0).toUpperCase();
  return ['C', 'I', 'F', 'B', 'D'].includes(c) ? c : 'other';
}

const GROUP_TONES: Record<string, 'blue' | 'amber' | 'green' | 'purple' | 'teal' | 'slate'> = {
  C: 'blue',
  I: 'amber',
  F: 'green',
  B: 'purple',
  D: 'teal',
  other: 'slate',
};

const sizeKey = (p: Pick<PaperType, 'parentWidthCm' | 'parentHeightCm'>) =>
  `${formatNumber(p.parentWidthCm, true)}×${formatNumber(p.parentHeightCm, true)}`;

const toForm = (p: PaperType): PaperForm => ({
  code: p.code,
  name: p.name,
  gsm: p.gsm,
  parentWidthCm: p.parentWidthCm,
  parentHeightCm: p.parentHeightCm,
  priceAbove500: p.priceAbove500,
  priceBelow500: p.priceBelow500,
  supplier: p.supplier,
  description: p.description,
  isActive: p.isActive,
});

// -----------------------------------------------------------------------------
// Thành phần chính
// -----------------------------------------------------------------------------

export function PaperManager() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<PaperType[]>('/api/papers');
  const papers = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim().toLowerCase(), 250);
  const [group, setGroup] = useState('all');
  const [supplier, setSupplier] = useState('all');
  const [size, setSize] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const [editor, setEditor] = useState<{ id: number | null; form: PaperForm } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const suppliers = useMemo(
    () => Array.from(new Set(papers.map((p) => p.supplier || DEFAULT_SUPPLIER))).sort((a, b) => a.localeCompare(b, 'vi')),
    [papers]
  );

  const sizes = useMemo(() => {
    const map = new Map<string, { key: string; w: number; h: number; count: number }>();
    for (const p of papers) {
      const key = sizeKey(p);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, w: p.parentWidthCm, h: p.parentHeightCm, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [papers]);

  const filtered = useMemo(
    () =>
      papers.filter((p) => {
        if (!showInactive && !p.isActive) return false;
        if (group !== 'all' && groupOf(p.code) !== group) return false;
        if (supplier !== 'all' && (p.supplier || DEFAULT_SUPPLIER) !== supplier) return false;
        if (size !== 'all' && sizeKey(p) !== size) return false;
        if (query) {
          const hay = `${p.code} ${p.name} ${p.description} ${p.gsm}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      }),
    [papers, showInactive, group, supplier, size, query]
  );

  const activeCount = papers.filter((p) => p.isActive).length;
  const hasFilter = search !== '' || group !== 'all' || supplier !== 'all' || size !== 'all';

  const resetFilters = () => {
    setSearch('');
    setGroup('all');
    setSupplier('all');
    setSize('all');
  };

  const toggleActive = async (p: PaperType) => {
    setBusyId(p.id);
    try {
      await api(`/api/papers/${p.id}`, { method: 'PUT', body: { ...toForm(p), isActive: !p.isActive } });
      toast.success(p.isActive ? `Đã ẩn giấy ${p.code}.` : `Đã kích hoạt lại giấy ${p.code}.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: PaperType) => {
    if (!window.confirm(`Xoá vĩnh viễn giấy "${p.code} – ${p.name}"?\nNếu chỉ muốn tạm ngừng sử dụng, hãy chọn "Ẩn" thay vì xoá.`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/papers/${p.id}`, { method: 'DELETE' });
      toast.success(`Đã xoá giấy ${p.code}.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const addButton = (
    <Button size="sm" variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ id: null, form: EMPTY_FORM })}>
      Thêm giấy
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Kho giấy"
        description={data ? `${formatNumber(papers.length)} loại · ${formatNumber(activeCount)} đang dùng` : undefined}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
              <span className="hidden sm:inline">Tải lại</span>
            </Button>
            {addButton}
          </>
        }
      />

      <Card bodyClassName="p-0">
        {/* Bộ lọc gọn */}
        <div className="p-3 sm:p-4 border-b border-slate-100 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã, tên, định lượng…"
                className="pl-8"
                aria-label="Tìm kiếm giấy"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 items-center">
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Lọc theo nhà cung cấp" className="sm:w-36">
                <option value="all">Tất cả NCC</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Lọc theo khổ mẹ" className="sm:w-36">
                <option value="all">Tất cả khổ</option>
                {sizes.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.key} ({s.count})
                  </option>
                ))}
              </Select>
              <div className="col-span-2 sm:col-span-1 shrink-0">
                <Checkbox checked={showInactive} onChange={setShowInactive} label="Đã ẩn" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {[{ value: 'all', label: 'Tất cả' }, ...GROUPS].map((g) => {
              const active = group === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGroup(g.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors',
                    active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="error" title="Không tải được danh sách giấy">
              {error}{' '}
              <button type="button" className="underline font-medium" onClick={reload}>
                Thử lại
              </button>
            </Alert>
          </div>
        )}

        {!data && loading ? (
          <LoadingBlock text="Đang tải kho giấy…" />
        ) : data && filtered.length === 0 ? (
          <EmptyState
            icon={<Layers className="w-10 h-10" />}
            title={papers.length === 0 ? 'Chưa có loại giấy nào' : 'Không có giấy phù hợp bộ lọc'}
            description={papers.length === 0 ? 'Thêm loại giấy đầu tiên để bắt đầu tính giá.' : 'Thử bỏ bớt điều kiện lọc hoặc bật "Đã ẩn".'}
            action={papers.length === 0 ? addButton : hasFilter ? <Button onClick={resetFilters}>Xoá bộ lọc</Button> : undefined}
          />
        ) : data ? (
          <>
            {/* Bảng trên màn hình lớn */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Mã</th>
                    <th className={th}>Tên giấy</th>
                    <th className={cn(th, 'text-right')}>gsm</th>
                    <th className={cn(th, 'text-center')}>Khổ mẹ (cm)</th>
                    <th className={cn(th, 'text-right')}>≥500 tờ/ram</th>
                    <th className={cn(th, 'text-right')}>&lt;500 tờ/ram</th>
                    <th className={cn(th, 'text-right')}>Giá/tờ</th>
                    <th className={th}>NCC</th>
                    <th className={cn(th, 'text-right')}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const busy = busyId === p.id;
                    return (
                      <tr key={p.id} className={cn('hover:bg-slate-50/70', !p.isActive && 'opacity-60')}>
                        <td className={cn(td, 'whitespace-nowrap')}>
                          <Badge tone={GROUP_TONES[groupOf(p.code)]} className="font-mono">
                            {p.code}
                          </Badge>
                        </td>
                        <td className={cn(td, 'min-w-48')}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-900">{p.name}</span>
                            {!p.isActive && <Badge tone="slate">Ẩn</Badge>}
                          </div>
                          {p.description && <div className="text-xs text-slate-500 line-clamp-1">{p.description}</div>}
                        </td>
                        <td className={cn(td, 'text-right tabular-nums')}>{p.gsm}</td>
                        <td className={cn(td, 'text-center tabular-nums whitespace-nowrap')}>{sizeKey(p)}</td>
                        <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-medium text-slate-900')}>{formatVnd(p.priceAbove500)}</td>
                        <td className={cn(td, 'text-right tabular-nums whitespace-nowrap')}>{formatVnd(p.priceBelow500)}</td>
                        <td className={cn(td, 'text-right tabular-nums whitespace-nowrap text-slate-600')}>{formatVnd(p.priceAbove500 / 500)}</td>
                        <td className={cn(td, 'whitespace-nowrap text-slate-600')}>{p.supplier || DEFAULT_SUPPLIER}</td>
                        <td className={cn(td, 'text-right whitespace-nowrap')}>
                          <div className="inline-flex items-center gap-0.5">
                            <IconButton label="Sửa" disabled={busy} onClick={() => setEditor({ id: p.id, form: toForm(p) })}>
                              <Pencil className="w-4 h-4" />
                            </IconButton>
                            <IconButton label={p.isActive ? 'Ẩn (ngừng dùng)' : 'Kích hoạt lại'} disabled={busy} onClick={() => toggleActive(p)}>
                              {p.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </IconButton>
                            <IconButton label="Xoá" tone="danger" disabled={busy} onClick={() => remove(p)}>
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

            {/* Danh sách thẻ trên điện thoại */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((p) => {
                const busy = busyId === p.id;
                return (
                  <div key={p.id} className={cn('p-3.5 space-y-1.5', !p.isActive && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge tone={GROUP_TONES[groupOf(p.code)]} className="font-mono shrink-0">
                          {p.code}
                        </Badge>
                        <span className="font-semibold text-sm text-slate-900 truncate">{p.name}</span>
                        {!p.isActive && <Badge tone="slate">Ẩn</Badge>}
                      </div>
                      <span className="font-bold text-sm text-slate-900 tabular-nums shrink-0">{formatVnd(p.priceAbove500)}/ram</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 truncate">
                        {p.gsm}gsm · {sizeKey(p)}cm · {p.supplier || DEFAULT_SUPPLIER} · {formatVnd(p.priceAbove500 / 500)}/tờ
                      </p>
                      <div className="inline-flex items-center gap-0.5 shrink-0">
                        <IconButton label="Sửa" disabled={busy} onClick={() => setEditor({ id: p.id, form: toForm(p) })}>
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton label={p.isActive ? 'Ẩn' : 'Kích hoạt'} disabled={busy} onClick={() => toggleActive(p)}>
                          {p.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </IconButton>
                        <IconButton label="Xoá" tone="danger" disabled={busy} onClick={() => remove(p)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatNumber(filtered.length)} / {formatNumber(papers.length)} loại giấy
                {loading && ' · đang cập nhật…'}
              </span>
              <span className="hidden sm:inline">Giá/tờ = giá ram (≥500 tờ) ÷ 500</span>
            </div>
          </>
        ) : null}
      </Card>

      {editor && (
        <PaperEditor
          id={editor.id}
          initial={editor.form}
          suppliers={suppliers}
          sizes={sizes.slice(0, 6)}
          onClose={() => setEditor(null)}
          onSaved={(msg) => {
            setEditor(null);
            toast.success(msg);
            reload();
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Form thêm / sửa (chỉ được gắn khi mở – state khởi tạo từ props, không cần effect)
// -----------------------------------------------------------------------------

function PaperEditor({
  id,
  initial,
  suppliers,
  sizes,
  onClose,
  onSaved,
}: {
  id: number | null;
  initial: PaperForm;
  suppliers: string[];
  sizes: { key: string; w: number; h: number }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const uid = useId();
  const formId = `${uid}-form`;
  const supplierListId = `${uid}-suppliers`;
  const [form, setForm] = useState<PaperForm>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends PaperField>(key: K, value: PaperForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Kiểm tra nhanh phía trình duyệt – server vẫn kiểm tra đầy đủ
    const local: FieldErrors = {};
    if (!form.code.trim()) local.code = 'Thiếu Mã giấy.';
    if (!form.name.trim()) local.name = 'Thiếu Tên giấy.';
    if (form.priceAbove500 <= 0) local.priceAbove500 = 'Giá từ 500 tờ phải lớn hơn 0.';
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setGeneralErrors([]);
      return;
    }

    setSaving(true);
    setGeneralErrors([]);
    const body: PaperForm = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      supplier: form.supplier.trim() || DEFAULT_SUPPLIER,
      description: form.description.trim(),
    };
    try {
      if (id === null) await api('/api/papers', { method: 'POST', body });
      else await api(`/api/papers/${id}`, { method: 'PUT', body });
      onSaved(id === null ? `Đã thêm giấy ${body.code}.` : `Đã cập nhật giấy ${body.code}.`);
    } catch (err) {
      const { general, fields } = splitErrors(err);
      setFieldErrors(fields);
      setGeneralErrors(general);
      setSaving(false);
    }
  };

  const perSheet = form.priceAbove500 / 500;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={id === null ? 'Thêm loại giấy' : `Sửa giấy ${initial.code}`}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={saving}>
            {id === null ? 'Thêm giấy' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {generalErrors.length > 0 && (
          <Alert tone="error" title={generalErrors[0]}>
            {generalErrors.length > 1 && (
              <ul className="list-disc pl-4">
                {generalErrors.slice(1).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mã giấy *" htmlFor={`${uid}-code`} error={fieldErrors.code} hint="VD: C150, I300… (ký tự đầu = nhóm giấy)">
            <TextInput id={`${uid}-code`} value={form.code} onChange={(e) => set('code', e.target.value)} maxLength={80} className="font-mono" autoFocus />
          </Field>
          <Field label="Tên giấy *" htmlFor={`${uid}-name`} error={fieldErrors.name} className="sm:col-span-2">
            <TextInput id={`${uid}-name`} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} placeholder="VD: Couche 150" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Định lượng *" htmlFor={`${uid}-gsm`} error={fieldErrors.gsm}>
            <NumberInput id={`${uid}-gsm`} value={form.gsm} onChange={(n) => set('gsm', n)} min={0} max={2000} allowDecimal={false} suffix="gsm" />
          </Field>
          <Field label="Khổ mẹ – rộng *" htmlFor={`${uid}-w`} error={fieldErrors.parentWidthCm}>
            <NumberInput id={`${uid}-w`} value={form.parentWidthCm} onChange={(n) => set('parentWidthCm', n)} min={0} max={300} suffix="cm" />
          </Field>
          <Field label="Khổ mẹ – dài *" htmlFor={`${uid}-h`} error={fieldErrors.parentHeightCm}>
            <NumberInput id={`${uid}-h`} value={form.parentHeightCm} onChange={(n) => set('parentHeightCm', n)} min={0} max={300} suffix="cm" />
          </Field>
        </div>
        {sizes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 -mt-2">
            <span className="text-[11px] text-slate-400">Khổ thường dùng:</span>
            {sizes.map((s) => {
              const active = s.w === form.parentWidthCm && s.h === form.parentHeightCm;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    set('parentWidthCm', s.w);
                    set('parentHeightCm', s.h);
                  }}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-md border tabular-nums transition-colors',
                    active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {s.key}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Giá 1 ram khi mua ≥ 500 tờ *"
            htmlFor={`${uid}-p1`}
            error={fieldErrors.priceAbove500}
            hint={perSheet > 0 ? `≈ ${formatVnd(perSheet)} / tờ khổ mẹ` : undefined}
          >
            <NumberInput id={`${uid}-p1`} value={form.priceAbove500} onChange={(n) => set('priceAbove500', n)} min={0} step={1000} allowDecimal={false} suffix="đ" />
          </Field>
          <Field
            label="Giá 1 ram khi mua lẻ < 500 tờ"
            htmlFor={`${uid}-p2`}
            error={fieldErrors.priceBelow500}
            hint={form.priceBelow500 > 0 ? `≈ ${formatVnd(form.priceBelow500 / 500)} / tờ khổ mẹ` : 'Để 0 = dùng giá ≥ 500 tờ'}
          >
            <NumberInput id={`${uid}-p2`} value={form.priceBelow500} onChange={(n) => set('priceBelow500', n)} min={0} step={1000} allowDecimal={false} suffix="đ" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nhà cung cấp" htmlFor={`${uid}-sup`} error={fieldErrors.supplier}>
            <TextInput
              id={`${uid}-sup`}
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              list={supplierListId}
              maxLength={100}
              placeholder={DEFAULT_SUPPLIER}
            />
            <datalist id={supplierListId}>
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              checked={form.isActive}
              onChange={(v) => set('isActive', v)}
              label="Đang sử dụng"
              description="Giấy bị ẩn sẽ không xuất hiện khi tính giá."
            />
          </div>
        </div>

        <Field label="Mô tả / ghi chú" htmlFor={`${uid}-desc`} error={fieldErrors.description}>
          <Textarea id={`${uid}-desc`} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
