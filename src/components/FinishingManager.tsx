'use client';

// =============================================================================
// Quản lý bảng giá gia công sau in
// =============================================================================

import React, { useMemo, useState } from 'react';
import { Edit2, Eye, EyeOff, Plus, RefreshCw, Scissors, Search, Trash2 } from 'lucide-react';
import type { FinishingCalcType, FinishingCategory, FinishingService } from '@/types';
import { FINISHING_CALC_LABELS, FINISHING_CATEGORY_LABELS } from '@/lib/engine/constants';
import { ApiError, api, errorMessage, useApi } from '@/lib/client';
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
  cn,
  td,
  th,
  useToast,
} from '@/components/ui';

type FinishingForm = Omit<FinishingService, 'id'>;

const CATEGORIES = Object.keys(FINISHING_CATEGORY_LABELS) as FinishingCategory[];
const CALC_TYPES = Object.keys(FINISHING_CALC_LABELS) as FinishingCalcType[];

const UNIT_SUFFIX: Record<FinishingCalcType, string> = {
  per_m2: '/m²',
  per_sheet: '/tờ in',
  per_product: '/sp',
  die_cut: '/con + khuôn',
  fixed: ' trọn gói',
};

const PRICE_UNIT: Record<FinishingCalcType, string> = {
  per_m2: 'đ / m²',
  per_sheet: 'đ / tờ in',
  per_product: 'đ / sp',
  die_cut: 'đ / con',
  fixed: 'trọn gói',
};

const UNIT_HINT: Record<FinishingCalcType, string> = {
  per_m2: 'Tính theo diện tích thành phẩm (kể cả tràn lề) × số lượng × số mặt.',
  per_sheet: 'Tính trên số tờ in thực (khổ máy), nhân số mặt.',
  per_product: 'Tính trên mỗi sản phẩm thành phẩm.',
  die_cut: 'Công bế mỗi con; tiền khuôn nhập ở ô “Tiền khuôn”.',
  fixed: 'Một giá cho cả đơn hàng, không phụ thuộc số lượng.',
};

const CALC_TONE: Record<FinishingCalcType, 'sky' | 'blue' | 'teal' | 'purple' | 'amber'> = {
  per_m2: 'sky',
  per_sheet: 'blue',
  per_product: 'teal',
  die_cut: 'purple',
  fixed: 'amber',
};

const EMPTY_FORM: FinishingForm = {
  code: '',
  name: '',
  category: 'can_mang',
  calcType: 'per_product',
  unitPrice: 0,
  minPrice: 0,
  setupFee: 0,
  wastePercent: 0,
  wasteSheets: 0,
  isActive: true,
};

function toForm(s: FinishingService): FinishingForm {
  return {
    code: s.code,
    name: s.name,
    category: s.category,
    calcType: s.calcType,
    unitPrice: s.unitPrice,
    minPrice: s.minPrice,
    setupFee: s.setupFee,
    wastePercent: s.wastePercent,
    wasteSheets: s.wasteSheets,
    isActive: s.isActive,
  };
}

function priceLabel(s: Pick<FinishingService, 'calcType' | 'unitPrice'>) {
  return `${formatVnd(s.unitPrice)}${UNIT_SUFFIX[s.calcType]}`;
}

function apiErrors(err: unknown): string[] {
  if (err instanceof ApiError && err.details && err.details.length > 0) return err.details;
  return [errorMessage(err)];
}

// -----------------------------------------------------------------------------
// Ví dụ tính cho 1.000 sp (giống công thức trong engine)
// -----------------------------------------------------------------------------

const EXAMPLE_QTY = 1000;
/** Giả định A4 (210×297mm) + tràn lề 2mm mỗi cạnh */
const EXAMPLE_AREA_M2 = ((210 + 4) / 1000) * ((297 + 4) / 1000);
/** Giả định bình 4 sp / tờ in */
const EXAMPLE_UPS = 4;

function explainExample(f: FinishingForm): { formula: string; total: number; note: string } {
  const withMin = (raw: number) => Math.max(f.minPrice, Math.round(raw));
  const minText = f.minPrice > 0 ? `, tối thiểu ${formatVnd(f.minPrice)}` : '';
  const setupText = f.setupFee > 0 ? ` + phí khuôn ${formatVnd(f.setupFee)}` : '';

  switch (f.calcType) {
    case 'per_m2': {
      const m2 = EXAMPLE_AREA_M2 * EXAMPLE_QTY;
      return {
        formula: `diện tích × đơn giá${minText}${setupText} → ${formatNumber(m2, true)} m² × ${formatVnd(f.unitPrice)}`,
        total: withMin(m2 * f.unitPrice) + f.setupFee,
        note: 'Giả định khổ A4 (210×297mm, tràn lề 2mm), 1 mặt. Làm 2 mặt thì diện tích × 2.',
      };
    }
    case 'per_sheet': {
      const sheets = Math.ceil(EXAMPLE_QTY / EXAMPLE_UPS);
      return {
        formula: `số tờ in × đơn giá${minText}${setupText} → ${formatNumber(sheets)} tờ × ${formatVnd(f.unitPrice)}`,
        total: withMin(sheets * f.unitPrice) + f.setupFee,
        note: `Giả định bình ${EXAMPLE_UPS} sp/tờ in, 1 mặt.`,
      };
    }
    case 'die_cut':
      return {
        formula: `khuôn + SL × đơn giá${minText} → ${formatVnd(f.setupFee)} + ${formatNumber(EXAMPLE_QTY)} con × ${formatVnd(f.unitPrice)}`,
        total: withMin(EXAMPLE_QTY * f.unitPrice) + f.setupFee,
        note: 'Giá tối thiểu áp cho phần công bế, chưa gồm tiền khuôn.',
      };
    case 'fixed':
      return {
        formula: `trọn gói ${formatVnd(f.unitPrice)}${setupText}`,
        total: f.unitPrice + f.setupFee,
        note: 'Không phụ thuộc số lượng, không áp dụng giá tối thiểu.',
      };
    default:
      return {
        formula: `SL × đơn giá${minText}${setupText} → ${formatNumber(EXAMPLE_QTY)} sp × ${formatVnd(f.unitPrice)}`,
        total: withMin(EXAMPLE_QTY * f.unitPrice) + f.setupFee,
        note: '',
      };
  }
}

// -----------------------------------------------------------------------------
// Form thêm / sửa
// -----------------------------------------------------------------------------

function FinishingFormModal({
  initial,
  editingId,
  onClose,
  onSaved,
}: {
  initial: FinishingForm;
  editingId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FinishingForm>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof FinishingForm>(key: K, value: FinishingForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const example = explainExample(form);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: string[] = [];
    if (!form.name.trim()) local.push('Vui lòng nhập tên dịch vụ.');
    if (!form.code.trim()) local.push('Vui lòng nhập mã dịch vụ.');
    if (local.length > 0) {
      setErrors(local);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const body = { ...form, code: form.code.trim(), name: form.name.trim() };
      if (editingId) await api(`/api/finishing/${editingId}`, { method: 'PUT', body });
      else await api('/api/finishing', { method: 'POST', body });
      toast.success(editingId ? 'Đã cập nhật dịch vụ gia công.' : 'Đã thêm dịch vụ gia công.');
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
      size="lg"
      title={editingId ? 'Sửa dịch vụ gia công' : 'Thêm dịch vụ gia công'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form="finishing-form" loading={saving}>
            {editingId ? 'Lưu thay đổi' : 'Thêm dịch vụ'}
          </Button>
        </>
      }
    >
      <form id="finishing-form" onSubmit={submit} className="space-y-4" noValidate>
        {errors.length > 0 && (
          <Alert tone="error" title="Không lưu được">
            <ul className="list-disc pl-4">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Tên dịch vụ *" className="sm:col-span-2" htmlFor="fin-name">
            <TextInput
              id="fin-name"
              value={form.name}
              maxLength={200}
              onChange={(e) => set('name', e.target.value)}
              placeholder="VD: Cán màng mờ"
              autoFocus
            />
          </Field>
          <Field label="Mã dịch vụ *" htmlFor="fin-code" hint="Chữ in hoa, không dấu cách">
            <TextInput
              id="fin-code"
              value={form.code}
              maxLength={80}
              onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              placeholder="VD: CAN_MANG_MO"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nhóm" htmlFor="fin-category">
            <Select id="fin-category" value={form.category} onChange={(e) => set('category', e.target.value as FinishingCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FINISHING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cách tính" htmlFor="fin-calc" hint={UNIT_HINT[form.calcType]}>
            <Select id="fin-calc" value={form.calcType} onChange={(e) => set('calcType', e.target.value as FinishingCalcType)}>
              {CALC_TYPES.map((c) => (
                <option key={c} value={c}>
                  {FINISHING_CALC_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={`Đơn giá (${PRICE_UNIT[form.calcType]})`} htmlFor="fin-price">
            <NumberInput id="fin-price" value={form.unitPrice} onChange={(n) => set('unitPrice', n)} min={0} max={1e10} step={50} suffix="đ" />
          </Field>
          <Field label="Thành tiền tối thiểu" htmlFor="fin-min" hint={form.calcType === 'fixed' ? 'Không áp dụng cho trọn gói' : 'Chưa gồm tiền khuôn'}>
            <NumberInput
              id="fin-min"
              value={form.minPrice}
              onChange={(n) => set('minPrice', n)}
              min={0}
              max={1e10}
              step={10000}
              suffix="đ"
              disabled={form.calcType === 'fixed'}
            />
          </Field>
          <Field
            label="Tiền khuôn / phí cố định"
            htmlFor="fin-setup"
            hint={form.calcType === 'die_cut' ? 'Tiền làm khuôn bế (mỗi đơn)' : 'Cộng thêm 1 lần mỗi đơn'}
          >
            <NumberInput id="fin-setup" value={form.setupFee} onChange={(n) => set('setupFee', n)} min={0} max={1e10} step={10000} suffix="đ" />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-700">Bù hao giấy cho công đoạn này</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Chỉ áp dụng khi in offset: số tờ in cộng thêm = tờ cố định + % × số tờ in thực. In nhanh (kỹ thuật số) không cộng bù hao gia công.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="% bù hao" htmlFor="fin-waste-pct">
              <NumberInput id="fin-waste-pct" value={form.wastePercent} onChange={(n) => set('wastePercent', n)} min={0} max={100} step={0.5} suffix="%" />
            </Field>
            <Field label="Tờ bù hao cố định" htmlFor="fin-waste-sheets">
              <NumberInput
                id="fin-waste-sheets"
                value={form.wasteSheets}
                onChange={(n) => set('wasteSheets', n)}
                min={0}
                max={100000}
                allowDecimal={false}
                suffix="tờ"
              />
            </Field>
          </div>
        </div>

        <Checkbox
          checked={form.isActive}
          onChange={(v) => set('isActive', v)}
          label="Đang sử dụng"
          description="Dịch vụ đã ngưng sẽ không hiện trong màn hình tính giá."
        />

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-semibold text-[11px] uppercase tracking-wide text-blue-700 mb-1">Ví dụ cho {formatNumber(EXAMPLE_QTY)} sp</p>
          <p className="leading-relaxed">
            {FINISHING_CALC_LABELS[form.calcType]}: {example.formula} = <span className="font-bold tabular-nums">{formatVnd(example.total)}</span>
          </p>
          {example.note && <p className="text-[11px] text-blue-700/80 mt-1">{example.note}</p>}
        </div>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Trang chính
// -----------------------------------------------------------------------------

export function FinishingManager() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<FinishingService[]>('/api/finishing');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FinishingCategory | 'all'>('all');
  const [showInactive, setShowInactive] = useState(true);
  const [editor, setEditor] = useState<{ key: number; id: number | null; initial: FinishingForm } | null>(null);
  const [editorSeq, setEditorSeq] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<FinishingService | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const services = useMemo(() => data ?? [], [data]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = services.filter((s) => {
      if (!showInactive && !s.isActive) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
      return true;
    });
    return CATEGORIES.map((c) => ({
      category: c,
      items: filtered.filter((s) => s.category === c).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    })).filter((g) => g.items.length > 0);
  }, [services, search, category, showInactive]);

  const activeCount = services.filter((s) => s.isActive).length;

  const openEditor = (id: number | null, initial: FinishingForm) => {
    const key = editorSeq + 1;
    setEditorSeq(key);
    setEditor({ key, id, initial });
  };
  const openAdd = () => openEditor(null, { ...EMPTY_FORM, category: category === 'all' ? EMPTY_FORM.category : category });
  const openEdit = (s: FinishingService) => openEditor(s.id, toForm(s));

  const toggleActive = async (s: FinishingService) => {
    setBusyId(s.id);
    try {
      await api(`/api/finishing/${s.id}`, { method: 'PUT', body: { ...toForm(s), isActive: !s.isActive } });
      setData((prev) => prev?.map((x) => (x.id === s.id ? { ...x, isActive: !s.isActive } : x)));
      toast.success(s.isActive ? `Đã ngưng “${s.name}”.` : `Đã bật lại “${s.name}”.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setDeleting(true);
    try {
      await api(`/api/finishing/${target.id}`, { method: 'DELETE' });
      setData((prev) => prev?.filter((x) => x.id !== target.id));
      toast.success(`Đã xoá “${target.name}”.`);
      setConfirmDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gia công"
        description={data ? `${formatNumber(services.length)} dịch vụ · ${formatNumber(activeCount)} đang dùng` : undefined}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
              <span className="hidden sm:inline">Tải lại</span>
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
              Thêm dịch vụ
            </Button>
          </>
        }
      />

      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên hoặc mã dịch vụ…"
              className="pl-8"
              aria-label="Tìm dịch vụ"
            />
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as FinishingCategory | 'all')}
              className="flex-1 md:w-52"
              aria-label="Lọc theo nhóm"
            >
              <option value="all">Tất cả nhóm</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FINISHING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
            <div className="shrink-0">
              <Checkbox checked={showInactive} onChange={setShowInactive} label="Đã ngưng" />
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <Alert tone="error" title="Không tải được danh sách gia công">
          {error}{' '}
          <button type="button" className="underline font-medium" onClick={reload}>
            Thử lại
          </button>
        </Alert>
      )}

      {!data ? (
        loading && (
          <Card>
            <LoadingBlock text="Đang tải bảng giá gia công…" />
          </Card>
        )
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Scissors className="w-10 h-10" />}
            title={services.length === 0 ? 'Chưa có dịch vụ gia công nào' : 'Không có dịch vụ phù hợp bộ lọc'}
            description={services.length === 0 ? 'Thêm dịch vụ đầu tiên để dùng khi tính giá.' : 'Thử đổi từ khoá, nhóm hoặc bật “Đã ngưng”.'}
            action={
              services.length === 0 ? (
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
                  Thêm dịch vụ
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        grouped.map((g) => (
          <Card
            key={g.category}
            title={FINISHING_CATEGORY_LABELS[g.category]}
            icon={<Scissors className="w-4 h-4 text-blue-600" />}
            actions={<Badge tone="slate">{g.items.length}</Badge>}
            bodyClassName="p-0"
          >
            {/* Bảng Desktop */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Tên dịch vụ</th>
                    <th className={th}>Cách tính</th>
                    <th className={cn(th, 'text-right')}>Đơn giá</th>
                    <th className={cn(th, 'text-right')}>Tối thiểu</th>
                    <th className={cn(th, 'text-right')}>Tiền khuôn</th>
                    <th className={cn(th, 'text-center')} title="Chỉ áp dụng in offset">
                      Bù hao
                    </th>
                    <th className={cn(th, 'text-right')}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((s) => (
                    <tr key={s.id} className={cn('hover:bg-slate-50/70 transition-colors', !s.isActive && 'opacity-60')}>
                      <td className={cn(td, 'font-medium text-slate-900 min-w-44')}>
                        <div className="flex items-center gap-1.5">
                          <span>{s.name}</span>
                          {!s.isActive && <Badge tone="slate">Ngưng</Badge>}
                        </div>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap')}>
                        <Badge tone={CALC_TONE[s.calcType]}>{FINISHING_CALC_LABELS[s.calcType]}</Badge>
                      </td>
                      <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-semibold text-slate-800')}>{priceLabel(s)}</td>
                      <td className={cn(td, 'text-right tabular-nums whitespace-nowrap')}>
                        {s.calcType === 'fixed' || s.minPrice <= 0 ? <span className="text-slate-300">—</span> : formatVnd(s.minPrice)}
                      </td>
                      <td className={cn(td, 'text-right tabular-nums whitespace-nowrap')}>
                        {s.setupFee > 0 ? formatVnd(s.setupFee) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(td, 'text-center tabular-nums whitespace-nowrap text-xs')}>
                        {s.wastePercent > 0 || s.wasteSheets > 0 ? (
                          <span title="Chỉ áp dụng in offset">
                            {formatNumber(s.wastePercent, true)}% + {formatNumber(s.wasteSheets)} tờ
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className={cn(td, 'text-right whitespace-nowrap')}>
                        <div className="inline-flex items-center gap-0.5">
                          <IconButton label="Sửa" onClick={() => openEdit(s)}>
                            <Edit2 className="w-4 h-4" />
                          </IconButton>
                          <IconButton label={s.isActive ? 'Ngưng sử dụng' : 'Bật lại'} onClick={() => toggleActive(s)} disabled={busyId === s.id}>
                            {s.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </IconButton>
                          <IconButton label="Xoá" tone="danger" onClick={() => setConfirmDelete(s)}>
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Danh sách Mobile */}
            <div className="md:hidden divide-y divide-slate-100">
              {g.items.map((s) => {
                const extras: string[] = [FINISHING_CALC_LABELS[s.calcType]];
                if (s.calcType !== 'fixed' && s.minPrice > 0) extras.push(`Tối thiểu ${formatVnd(s.minPrice)}`);
                if (s.setupFee > 0) extras.push(`Khuôn ${formatVnd(s.setupFee)}`);
                return (
                  <div key={s.id} className={cn('p-3.5 space-y-1', !s.isActive && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-sm text-slate-900 truncate">{s.name}</span>
                        {!s.isActive && <Badge tone="slate">Ngưng</Badge>}
                      </div>
                      <span className="font-bold text-sm text-slate-900 tabular-nums shrink-0">{priceLabel(s)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 truncate">{extras.join(' · ')}</p>
                      <div className="inline-flex items-center gap-0.5 shrink-0">
                        <IconButton label="Sửa" onClick={() => openEdit(s)}>
                          <Edit2 className="w-4 h-4" />
                        </IconButton>
                        <IconButton label={s.isActive ? 'Ngưng sử dụng' : 'Bật lại'} onClick={() => toggleActive(s)} disabled={busyId === s.id}>
                          {s.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </IconButton>
                        <IconButton label="Xoá" tone="danger" onClick={() => setConfirmDelete(s)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {editor && (
        <FinishingFormModal
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
        title="Xoá dịch vụ gia công?"
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
          Bạn có chắc muốn xoá <span className="font-semibold">“{confirmDelete?.name}”</span> ({confirmDelete?.code})? Thao tác này không thể hoàn tác.
        </p>
        <p className="text-xs text-slate-500 mt-2">Nếu chỉ muốn tạm ẩn khỏi màn hình tính giá, hãy dùng “Ngưng sử dụng”.</p>
      </Modal>
    </div>
  );
}
