'use client';

// =============================================================================
// Máy in & bảng giá – máy offset, bảng giá in gia công Konica, in nhanh kèm giấy
// =============================================================================

import React, { useId, useMemo, useState } from 'react';
import { Check, Info, Pencil, Plus, Printer, RefreshCw, Search, Trash2, X } from 'lucide-react';
import type { DigitalPrintGiaCong, DigitalPrintKemGiay, OffsetMachine } from '@/types';
import { ApiError, api, errorMessage, useApi } from '@/lib/client';
import { formatNumber, formatVnd } from '@/lib/format';
import { DIGITAL_SHORT_RUN_FEES, PLATES_INCLUDED_PER_PASS, WHITE_INK_PER_SIDE } from '@/lib/engine/constants';
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
  Segmented,
  Table,
  TextInput,
  cn,
  td,
  th,
  useToast,
} from '@/components/ui';

// -----------------------------------------------------------------------------
// Kiểu dữ liệu & tiện ích dùng chung
// -----------------------------------------------------------------------------

interface MachinesData {
  offsetMachines: OffsetMachine[];
  giaCong: DigitalPrintGiaCong[];
  kemGiay: DigitalPrintKemGiay[];
}

type Tab = 'offset' | 'giacong' | 'kemgiay';
type FieldKey<F> = Extract<keyof F, string>;
type FieldErrors<F> = Partial<Record<FieldKey<F>, string>>;

/** Gán lỗi chi tiết của server vào trường theo nhãn (nhãn dài khớp trước); phần còn lại là lỗi chung */
function splitErrors<F>(err: unknown, labels: Partial<Record<FieldKey<F>, string>>): { general: string[]; fields: FieldErrors<F> } {
  const fields: FieldErrors<F> = {};
  const general: string[] = [];
  const details = err instanceof ApiError && err.details && err.details.length > 0 ? err.details : null;
  const entries = (Object.entries(labels) as [FieldKey<F>, string | undefined][])
    .filter((e): e is [FieldKey<F>, string] => typeof e[1] === 'string')
    .sort((a, b) => b[1].length - a[1].length);
  for (const msg of details ?? [errorMessage(err)]) {
    const hit = entries.find(([, label]) => msg.toLowerCase().includes(label.toLowerCase()));
    if (hit && !fields[hit[0]]) fields[hit[0]] = msg;
    else general.push(msg);
  }
  if (details) general.unshift(errorMessage(err));
  return { general: Array.from(new Set(general)), fields };
}

interface RowEdit<F> {
  /** null = đang thêm mới */
  id: number | null;
  draft: F;
  fields: FieldErrors<F>;
  general: string[];
  saving: boolean;
}

/** Trạng thái sửa / thêm / xoá một dòng dữ liệu qua REST (POST endpoint, PUT|DELETE endpoint/{id}) */
function useRowEditor<F extends object>({
  endpoint,
  labels,
  describe,
  onChanged,
}: {
  endpoint: string;
  labels: Partial<Record<FieldKey<F>, string>>;
  describe: (draft: F) => string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [edit, setEdit] = useState<RowEdit<F> | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const start = (id: number | null, draft: F) => setEdit({ id, draft, fields: {}, general: [], saving: false });
  const cancel = () => setEdit(null);

  const patch = (p: Partial<F>) =>
    setEdit((e) => {
      if (!e) return e;
      const fields: FieldErrors<F> = { ...e.fields };
      for (const k of Object.keys(p) as FieldKey<F>[]) delete fields[k];
      return { ...e, draft: { ...e.draft, ...p }, fields };
    });

  const save = async () => {
    if (!edit || edit.saving) return;
    const { id, draft } = edit;
    setEdit((e) => (e ? { ...e, saving: true, general: [] } : e));
    try {
      if (id === null) await api(endpoint, { method: 'POST', body: draft });
      else await api(`${endpoint}/${id}`, { method: 'PUT', body: draft });
      toast.success(`${id === null ? 'Đã thêm' : 'Đã cập nhật'} ${describe(draft)}.`);
      setEdit(null);
      onChanged();
    } catch (err) {
      const { general, fields } = splitErrors<F>(err, labels);
      setEdit((e) => (e ? { ...e, saving: false, general, fields } : e));
    }
  };

  const remove = async (id: number, confirmText: string, label: string) => {
    if (!window.confirm(confirmText)) return;
    setRemovingId(id);
    try {
      await api(`${endpoint}/${id}`, { method: 'DELETE' });
      toast.success(`Đã xoá ${label}.`);
      if (edit?.id === id) setEdit(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  return { edit, start, cancel, patch, save, remove, removingId };
}

/** Danh sách lỗi hiển thị dưới dòng đang sửa */
function allErrors<F>(edit: RowEdit<F>): string[] {
  return Array.from(new Set([...edit.general, ...(Object.values(edit.fields) as (string | undefined)[]).filter((m): m is string => !!m)]));
}

const cellInput = 'py-1 px-2 text-xs';
const errBorder = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30';

function RowErrors({ messages, colSpan }: { messages: string[]; colSpan: number }) {
  if (messages.length === 0) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 pb-2.5 border-b border-slate-100 bg-blue-50/40">
        <Alert tone="error" className="py-2">
          <ul className="list-disc pl-4">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      </td>
    </tr>
  );
}

function RowActions({
  editing,
  saving,
  busy,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  disableEdit,
}: {
  editing: boolean;
  saving: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disableEdit: boolean;
}) {
  if (editing) {
    return (
      <div className="inline-flex items-center gap-1">
        <Button size="sm" variant="primary" icon={<Check className="w-3.5 h-3.5" />} loading={saving} onClick={onSave}>
          Lưu
        </Button>
        <Button size="sm" variant="ghost" icon={<X className="w-3.5 h-3.5" />} disabled={saving} onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-0.5">
      <IconButton label="Sửa" disabled={busy || disableEdit} onClick={onEdit}>
        <Pencil className="w-4 h-4" />
      </IconButton>
      <IconButton label="Xoá" tone="danger" disabled={busy} onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
      </IconButton>
    </div>
  );
}

const shortRunText = DIGITAL_SHORT_RUN_FEES.map((f) => `< ${formatNumber(f.below)} tờ +${formatVnd(f.fee)}`).join(', ');

// -----------------------------------------------------------------------------
// Thành phần chính
// -----------------------------------------------------------------------------

export function MachineManager() {
  const { data, error, loading, reload } = useApi<MachinesData>('/api/machines');
  const [tab, setTab] = useState<Tab>('offset');

  const offsetCount = data?.offsetMachines.length ?? 0;
  const gcCount = data?.giaCong.length ?? 0;
  const kgCount = data?.kemGiay.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Máy in & bảng giá"
        description="Thông số máy offset và biểu giá in nhanh dùng cho tính giá tự động."
        actions={
          <Button icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
            Tải lại
          </Button>
        }
      />

      <div className="mb-4 overflow-x-auto">
        <Segmented<Tab>
          className="min-w-max sm:min-w-0"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'offset', label: `Máy offset${data ? ` (${offsetCount})` : ''}` },
            { value: 'giacong', label: `In gia công Konica${data ? ` (${gcCount})` : ''}` },
            { value: 'kemgiay', label: `In nhanh kèm giấy (INTC)${data ? ` (${kgCount})` : ''}` },
          ]}
        />
      </div>

      {error && (
        <Alert tone="error" title="Không tải được dữ liệu máy in" className="mb-4">
          {error}{' '}
          <button type="button" className="underline font-medium" onClick={reload}>
            Thử lại
          </button>
        </Alert>
      )}

      {!data ? (
        loading ? (
          <Card>
            <LoadingBlock text="Đang tải dữ liệu máy in…" />
          </Card>
        ) : null
      ) : tab === 'offset' ? (
        <OffsetTab machines={data.offsetMachines} onChanged={reload} />
      ) : tab === 'giacong' ? (
        <GiaCongTab rows={data.giaCong} onChanged={reload} />
      ) : (
        <KemGiayTab rows={data.kemGiay} onChanged={reload} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// (1) Máy offset
// -----------------------------------------------------------------------------

type OffsetForm = Omit<OffsetMachine, 'id'>;

const OFFSET_DEFAULT: OffsetForm = {
  name: '',
  maxWidthMm: 650,
  maxHeightMm: 430,
  minWidthMm: 210,
  minHeightMm: 297,
  platePrice: 75000,
  setupCost: 900000,
  stepCost: 150000,
  defaultWasteSheets: 80,
  gripperMarginMm: 10,
  baseImpressions: 3000,
  includesPlate: true,
};

const OFFSET_LABELS: Partial<Record<keyof OffsetForm, string>> = {
  name: 'Tên máy',
  maxWidthMm: 'Khổ in lớn nhất (rộng)',
  maxHeightMm: 'Khổ in lớn nhất (dài)',
  minWidthMm: 'Khổ in nhỏ nhất (rộng)',
  minHeightMm: 'Khổ in nhỏ nhất (dài)',
  platePrice: 'Giá kẽm',
  setupCost: 'Giá mở máy',
  stepCost: 'Giá mỗi 1.000 lượt',
  defaultWasteSheets: 'Bù hao',
  gripperMarginMm: 'Lề nhíp',
  baseImpressions: 'Số lượt trong gói',
};

const toOffsetForm = (m: OffsetMachine): OffsetForm => ({
  name: m.name,
  maxWidthMm: m.maxWidthMm,
  maxHeightMm: m.maxHeightMm,
  minWidthMm: m.minWidthMm,
  minHeightMm: m.minHeightMm,
  platePrice: m.platePrice,
  setupCost: m.setupCost,
  stepCost: m.stepCost,
  defaultWasteSheets: m.defaultWasteSheets,
  gripperMarginMm: m.gripperMarginMm,
  baseImpressions: m.baseImpressions,
  includesPlate: m.includesPlate,
});

/** Chi phí 1 lần lên máy in 4 màu (giống engine: gói mở máy + bước 1.000 lượt + kẽm ngoài gói) */
function offsetPassCost(m: OffsetForm, impressions: number, colors = 4) {
  const steps = Math.ceil(Math.max(0, impressions - m.baseImpressions) / 1000);
  const plates = m.includesPlate ? Math.max(0, colors - PLATES_INCLUDED_PER_PASS) : colors;
  return m.setupCost + steps * m.stepCost + plates * m.platePrice;
}

const EXAMPLE_IMPRESSIONS = 5000;

function OffsetTab({ machines, onChanged }: { machines: OffsetMachine[]; onChanged: () => void }) {
  const ed = useRowEditor<OffsetForm>({
    endpoint: '/api/machines/offset',
    labels: OFFSET_LABELS,
    describe: (d) => `máy "${d.name}"`,
    onChanged,
  });

  const confirmDelete = (m: OffsetMachine) =>
    machines.length <= 1
      ? `"${m.name}" là máy offset DUY NHẤT.\nXoá máy này thì hệ thống sẽ không thể báo giá in offset cho tới khi thêm máy mới.\n\nVẫn xoá?`
      : `Xoá máy offset "${m.name}"?\nCần giữ ít nhất 1 máy để báo giá offset.`;

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Cách tính giá in offset">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            Mỗi lần lên máy tính <b>giá mở máy trọn gói</b> cho tối đa <b>N lượt</b> in; vượt gói cộng thêm <b>giá mỗi 1.000 lượt</b> (làm tròn lên
            theo bước 1.000 lượt).
          </li>
          <li>
            Nếu bật “gói mở máy đã gồm {PLATES_INCLUDED_PER_PASS} kẽm”, chỉ tính thêm kẽm từ màu thứ {PLATES_INCLUDED_PER_PASS + 1} trở đi; nếu không,
            mỗi màu tính 1 lá kẽm.
          </li>
          <li>
            <b>In 2 bài</b> = 2 lần mở máy, 2 bộ kẽm. <b>Tự trở / trở nhíp</b> = 1 bộ kẽm, nhưng số lượt ép gấp đôi.
          </li>
          <li>Hệ thống tự chọn máy rẻ nhất có khổ in phù hợp (trừ khi người dùng chọn máy cụ thể). Bù hao được cộng vào mỗi lần lên máy.</li>
        </ul>
      </Alert>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{formatNumber(machines.length)} máy offset</p>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => ed.start(null, OFFSET_DEFAULT)}>
          Thêm máy offset
        </Button>
      </div>

      {machines.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Printer className="w-10 h-10" />}
            title="Chưa có máy offset"
            description="Cần ít nhất 1 máy offset để hệ thống báo giá in offset."
            action={
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => ed.start(null, OFFSET_DEFAULT)}>
                Thêm máy offset
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {machines.map((m) => {
            const busy = ed.removingId === m.id;
            return (
              <Card
                key={m.id}
                icon={<Printer className="w-4 h-4 text-blue-600 shrink-0" />}
                title={m.name}
                actions={
                  <>
                    <IconButton label="Sửa" disabled={busy} onClick={() => ed.start(m.id, toOffsetForm(m))}>
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton label="Xoá" tone="danger" disabled={busy} onClick={() => ed.remove(m.id, confirmDelete(m), `máy "${m.name}"`)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </>
                }
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <Stat label="Khổ in lớn nhất" value={`${formatNumber(m.maxWidthMm)} × ${formatNumber(m.maxHeightMm)} mm`} />
                  <Stat
                    label="Khổ in nhỏ nhất"
                    value={m.minWidthMm > 0 || m.minHeightMm > 0 ? `${formatNumber(m.minWidthMm)} × ${formatNumber(m.minHeightMm)} mm` : 'Không giới hạn'}
                  />
                  <Stat label={`Mở máy trọn gói (≤ ${formatNumber(m.baseImpressions)} lượt)`} value={formatVnd(m.setupCost)} strong />
                  <Stat label="Mỗi 1.000 lượt vượt gói" value={formatVnd(m.stepCost)} />
                  <Stat label="Giá kẽm / lá" value={formatVnd(m.platePrice)} />
                  <Stat label="Bù hao / lần lên máy" value={`${formatNumber(m.defaultWasteSheets)} tờ`} />
                  <Stat label="Lề nhíp" value={`${formatNumber(m.gripperMarginMm, true)} mm`} />
                  <div>
                    <dt className="text-[11px] text-slate-500">Kẽm trong gói</dt>
                    <dd className="mt-0.5">
                      {m.includesPlate ? <Badge tone="green">Đã gồm {PLATES_INCLUDED_PER_PASS} kẽm</Badge> : <Badge tone="amber">Tính kẽm riêng</Badge>}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Ví dụ 1 lần lên máy, 4 màu, {formatNumber(EXAMPLE_IMPRESSIONS)} lượt:{' '}
                  <span className="font-semibold text-slate-800 tabular-nums">{formatVnd(offsetPassCost(m, EXAMPLE_IMPRESSIONS))}</span>
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {ed.edit && <OffsetEditor edit={ed.edit} onPatch={ed.patch} onSave={ed.save} onClose={ed.cancel} />}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 tabular-nums', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
    </div>
  );
}

function OffsetEditor({
  edit,
  onPatch,
  onSave,
  onClose,
}: {
  edit: RowEdit<OffsetForm>;
  onPatch: (p: Partial<OffsetForm>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const formId = `${uid}-form`;
  const f = edit.draft;
  const e = edit.fields;

  const num = (key: Exclude<keyof OffsetForm, 'name' | 'includesPlate'>, label: string, opts: { suffix?: string; step?: number; int?: boolean; hint?: string } = {}) => (
    <Field label={label} htmlFor={`${uid}-${key}`} error={e[key]} hint={opts.hint}>
      <NumberInput
        id={`${uid}-${key}`}
        value={f[key]}
        onChange={(n) => {
          const p: Partial<OffsetForm> = {};
          p[key] = n;
          onPatch(p);
        }}
        min={0}
        step={opts.step}
        allowDecimal={!opts.int}
        suffix={opts.suffix}
      />
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={edit.id === null ? 'Thêm máy offset' : `Sửa máy “${f.name || '…'}”`}
      footer={
        <>
          <Button onClick={onClose} disabled={edit.saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={edit.saving}>
            {edit.id === null ? 'Thêm máy' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          onSave();
        }}
      >
        {edit.general.length > 0 && (
          <Alert tone="error" title={edit.general[0]}>
            {edit.general.length > 1 && (
              <ul className="list-disc pl-4">
                {edit.general.slice(1).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <Field label="Tên máy *" htmlFor={`${uid}-name`} error={e.name}>
          <TextInput id={`${uid}-name`} value={f.name} onChange={(ev) => onPatch({ name: ev.target.value })} maxLength={200} placeholder="VD: Heidelberg 4 màu 52×72" autoFocus />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Khổ tờ in (mm)</legend>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {num('maxWidthMm', 'Lớn nhất – rộng *', { suffix: 'mm' })}
            {num('maxHeightMm', 'Lớn nhất – dài *', { suffix: 'mm' })}
            {num('minWidthMm', 'Nhỏ nhất – rộng', { suffix: 'mm' })}
            {num('minHeightMm', 'Nhỏ nhất – dài', { suffix: 'mm' })}
          </div>
          <p className="text-[11px] text-slate-400">Khổ nhỏ nhất để 0 nếu máy không giới hạn.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Giá in</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {num('setupCost', 'Giá mở máy trọn gói *', { suffix: 'đ', step: 10000, int: true })}
            {num('baseImpressions', 'Số lượt trong gói', { suffix: 'lượt', step: 500, int: true })}
            {num('stepCost', 'Giá mỗi 1.000 lượt vượt', { suffix: 'đ', step: 10000, int: true })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            {num('platePrice', 'Giá kẽm CTP / lá', { suffix: 'đ', step: 5000, int: true })}
            <div className="sm:col-span-2 pb-1">
              <Checkbox
                checked={f.includesPlate}
                onChange={(v) => onPatch({ includesPlate: v })}
                label={`Gói mở máy đã gồm ${PLATES_INCLUDED_PER_PASS} kẽm`}
                description="Chỉ tính thêm kẽm cho màu thứ 5 trở đi (pha, nhũ…)."
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Kỹ thuật</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {num('defaultWasteSheets', 'Bù hao / lần lên máy', { suffix: 'tờ', step: 10, int: true })}
            {num('gripperMarginMm', 'Lề nhíp', { suffix: 'mm' })}
          </div>
        </fieldset>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Xem trước (1 lần lên máy, 4 màu)</p>
          {[Math.max(1000, f.baseImpressions), f.baseImpressions + 2000, 10000].map((n, i) => (
            <p key={`${i}-${n}`} className="flex justify-between gap-3 tabular-nums">
              <span>{formatNumber(n)} lượt</span>
              <span className="font-medium text-slate-800">{formatVnd(offsetPassCost(f, n))}</span>
            </p>
          ))}
        </div>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// (2) In gia công Konica (giấy rời) – giá / tờ theo khổ và nhóm chất liệu
// -----------------------------------------------------------------------------

type GiaCongForm = Omit<DigitalPrintGiaCong, 'id'>;
type GcPriceKey = 'paperLt249' | 'paper250To349' | 'paper350To450' | 'decalPaperPlastic' | 'decalClear' | 'syntheticPaper' | 'pvcPlastic';

const GC_PRICE_COLUMNS: { key: GcPriceKey; label: string }[] = [
  { key: 'paperLt249', label: 'Giấy < 250gsm' },
  { key: 'paper250To349', label: 'Giấy 250–349' },
  { key: 'paper350To450', label: 'Giấy 350–450' },
  { key: 'decalPaperPlastic', label: 'Decal giấy/nhựa' },
  { key: 'decalClear', label: 'Decal trong' },
  { key: 'syntheticPaper', label: 'Giấy nhựa' },
  { key: 'pvcPlastic', label: 'PVC' },
];

const GC_LABELS: Partial<Record<keyof GiaCongForm, string>> = {
  machineName: 'Tên máy',
  sheetSize: 'Tên khổ',
  widthMm: 'Rộng',
  heightMm: 'Dài',
  paperLt249: 'Giá giấy < 250gsm',
  paper250To349: 'Giá giấy 250–349gsm',
  paper350To450: 'Giá giấy 350–450gsm',
  decalPaperPlastic: 'Giá decal',
  decalClear: 'Giá decal trong',
  syntheticPaper: 'Giá giấy nhựa',
  pvcPlastic: 'Giá PVC',
};

const toGcForm = (r: DigitalPrintGiaCong): GiaCongForm => ({
  machineName: r.machineName,
  sheetSize: r.sheetSize,
  widthMm: r.widthMm,
  heightMm: r.heightMm,
  paperLt249: r.paperLt249,
  paper250To349: r.paper250To349,
  paper350To450: r.paper350To450,
  decalPaperPlastic: r.decalPaperPlastic,
  decalClear: r.decalClear,
  syntheticPaper: r.syntheticPaper,
  pvcPlastic: r.pvcPlastic,
});

function GiaCongTab({ rows, onChanged }: { rows: DigitalPrintGiaCong[]; onChanged: () => void }) {
  const ed = useRowEditor<GiaCongForm>({
    endpoint: '/api/machines/giacong',
    labels: GC_LABELS,
    describe: (d) => `khổ ${d.sheetSize}`,
    onChanged,
  });
  const edit = ed.edit;
  const colSpan = 4 + GC_PRICE_COLUMNS.length;

  const newRow = (): GiaCongForm => ({
    machineName: rows[0]?.machineName ?? 'Konica C12000',
    sheetSize: '',
    widthMm: 325,
    heightMm: 430,
    paperLt249: 0,
    paper250To349: 0,
    paper350To450: 0,
    decalPaperPlastic: 0,
    decalClear: 0,
    syntheticPaper: 0,
    pvcPlastic: 0,
  });

  const editingCells = (d: GiaCongForm, fe: FieldErrors<GiaCongForm>) => (
    <>
      <td className={td}>
        <TextInput
          aria-label="Tên máy"
          value={d.machineName}
          onChange={(e) => ed.patch({ machineName: e.target.value })}
          className={cn(cellInput, 'min-w-32', fe.machineName && errBorder)}
          maxLength={200}
        />
      </td>
      <td className={td}>
        <TextInput
          aria-label="Tên khổ"
          value={d.sheetSize}
          onChange={(e) => ed.patch({ sheetSize: e.target.value })}
          placeholder="VD: 32,5×43"
          className={cn(cellInput, 'w-28', fe.sheetSize && errBorder)}
          maxLength={50}
        />
      </td>
      <td className={td}>
        <div className="flex items-center gap-1">
          <NumberInput value={d.widthMm} onChange={(n) => ed.patch({ widthMm: n })} min={0} className="w-16" inputClassName={cn(cellInput, 'text-right', fe.widthMm && errBorder)} />
          <span className="text-slate-400 text-xs">×</span>
          <NumberInput value={d.heightMm} onChange={(n) => ed.patch({ heightMm: n })} min={0} className="w-16" inputClassName={cn(cellInput, 'text-right', fe.heightMm && errBorder)} />
        </div>
      </td>
      {GC_PRICE_COLUMNS.map((c) => (
        <td key={c.key} className={td}>
          <NumberInput
            value={d[c.key]}
            onChange={(n) => {
              const p: Partial<GiaCongForm> = {};
              p[c.key] = n;
              ed.patch(p);
            }}
            min={0}
            step={500}
            allowDecimal={false}
            className="w-24"
            inputClassName={cn(cellInput, 'text-right', fe[c.key] && errBorder)}
          />
        </td>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Bảng giá in gia công (khách đưa giấy / giấy rời) – đơn giá 1 mặt / tờ">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            In 2 mặt = đơn giá × 2. Giá <b>0</b> = khổ đó không nhận in chất liệu tương ứng.
          </li>
          <li>Phụ phí số lượng ít (theo tổng số tờ in): {shortRunText}.</li>
          <li>Mực trắng (nếu có): +{formatVnd(WHITE_INK_PER_SIDE)} / mặt / tờ.</li>
        </ul>
      </Alert>

      <Card
        title="Bảng giá in gia công Konica"
        icon={<Printer className="w-4 h-4 text-blue-600" />}
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} disabled={!!edit} onClick={() => ed.start(null, newRow())}>
            Thêm khổ
          </Button>
        }
      >
        {rows.length === 0 && !edit ? (
          <EmptyState title="Chưa có bảng giá in gia công" description="Thêm khổ giấy và đơn giá theo từng nhóm chất liệu." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={th}>Máy</th>
                <th className={th}>Khổ</th>
                <th className={th}>Kích thước (mm)</th>
                {GC_PRICE_COLUMNS.map((c) => (
                  <th key={c.key} className={cn(th, 'text-right')}>
                    {c.label}
                  </th>
                ))}
                <th className={cn(th, 'text-right')}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {edit && edit.id === null && (
                <>
                  <tr className="bg-blue-50/40">
                    {editingCells(edit.draft, edit.fields)}
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      <RowActions editing saving={edit.saving} busy={false} onSave={ed.save} onCancel={ed.cancel} onEdit={() => undefined} onDelete={() => undefined} disableEdit />
                    </td>
                  </tr>
                  <RowErrors messages={allErrors(edit)} colSpan={colSpan} />
                </>
              )}
              {rows.map((r) => {
                const editing = edit?.id === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className={cn(editing ? 'bg-blue-50/40' : 'hover:bg-slate-50/70')}>
                      {editing && edit ? (
                        editingCells(edit.draft, edit.fields)
                      ) : (
                        <>
                          <td className={cn(td, 'text-slate-600 whitespace-nowrap')}>{r.machineName}</td>
                          <td className={cn(td, 'font-semibold text-slate-900 whitespace-nowrap')}>{r.sheetSize}</td>
                          <td className={cn(td, 'tabular-nums whitespace-nowrap text-slate-600')}>
                            {formatNumber(r.widthMm, true)} × {formatNumber(r.heightMm, true)}
                          </td>
                          {GC_PRICE_COLUMNS.map((c) => (
                            <td key={c.key} className={cn(td, 'text-right tabular-nums whitespace-nowrap')}>
                              {r[c.key] > 0 ? (
                                <span className="text-slate-900">{formatNumber(r[c.key])}</span>
                              ) : (
                                <span className="text-slate-300" title="Không nhận in">
                                  —
                                </span>
                              )}
                            </td>
                          ))}
                        </>
                      )}
                      <td className={cn(td, 'text-right whitespace-nowrap')}>
                        <RowActions
                          editing={editing}
                          saving={editing && !!edit?.saving}
                          busy={ed.removingId === r.id}
                          disableEdit={!!edit}
                          onSave={ed.save}
                          onCancel={ed.cancel}
                          onEdit={() => ed.start(r.id, toGcForm(r))}
                          onDelete={() => ed.remove(r.id, `Xoá dòng giá khổ "${r.sheetSize}" (${r.machineName})?`, `khổ ${r.sheetSize}`)}
                        />
                      </td>
                    </tr>
                    {editing && edit && <RowErrors messages={allErrors(edit)} colSpan={colSpan} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">Đơn vị: đồng / tờ / 1 mặt.</p>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// (3) In nhanh kèm giấy (INTC) – giá / tờ đã gồm giấy
// -----------------------------------------------------------------------------

type KemGiayForm = Omit<DigitalPrintKemGiay, 'id'>;

const KG_LABELS: Partial<Record<keyof KemGiayForm, string>> = {
  paperCode: 'Mã giấy',
  paperName: 'Tên giấy',
  gsm: 'Định lượng',
  sheetSize: 'Khổ',
  widthMm: 'Rộng',
  heightMm: 'Dài',
  price1Side: 'Giá 1 mặt',
  price2Side: 'Giá 2 mặt',
};

const toKgForm = (r: DigitalPrintKemGiay): KemGiayForm => ({
  paperCode: r.paperCode,
  paperName: r.paperName,
  gsm: r.gsm,
  sheetSize: r.sheetSize,
  widthMm: r.widthMm,
  heightMm: r.heightMm,
  price1Side: r.price1Side,
  price2Side: r.price2Side,
});

const KG_NEW: KemGiayForm = {
  paperCode: '',
  paperName: '',
  gsm: 150,
  sheetSize: '325x430',
  widthMm: 325,
  heightMm: 430,
  price1Side: 0,
  price2Side: 0,
};

const KG_GROUPS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'C', label: 'Couche' },
  { value: 'I', label: 'Ivory' },
  { value: 'F', label: 'Fort' },
  { value: 'other', label: 'Khác' },
] as const;
type KgGroup = (typeof KG_GROUPS)[number]['value'];

const kgGroupOf = (code: string): KgGroup => {
  const c = code.trim().charAt(0).toUpperCase();
  return c === 'C' || c === 'I' || c === 'F' ? c : 'other';
};

function KemGiayTab({ rows, onChanged }: { rows: DigitalPrintKemGiay[]; onChanged: () => void }) {
  const ed = useRowEditor<KemGiayForm>({
    endpoint: '/api/machines/kem-giay',
    labels: KG_LABELS,
    describe: (d) => `mã ${d.paperCode.toUpperCase()}`,
    onChanged,
  });
  const edit = ed.edit;
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<KgGroup>('all');
  const colSpan = 7;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && kgGroupOf(r.paperCode) !== group) return false;
      if (q && !`${r.paperCode} ${r.paperName} ${r.gsm} ${r.sheetSize}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, group]);

  /** Đổi kích thước thì tên khổ tự cập nhật theo dạng RộngxDài */
  const setSize = (d: KemGiayForm, w: number, h: number) => ed.patch({ widthMm: w, heightMm: h, sheetSize: `${w}x${h}` });

  const editingCells = (d: KemGiayForm, fe: FieldErrors<KemGiayForm>) => (
    <>
      <td className={td}>
        <TextInput
          aria-label="Mã giấy"
          value={d.paperCode}
          onChange={(e) => ed.patch({ paperCode: e.target.value.toUpperCase() })}
          placeholder="C150"
          className={cn(cellInput, 'w-28 font-mono', fe.paperCode && errBorder)}
          maxLength={50}
        />
      </td>
      <td className={td}>
        <TextInput
          aria-label="Tên giấy"
          value={d.paperName}
          onChange={(e) => ed.patch({ paperName: e.target.value })}
          placeholder="Couche 150"
          className={cn(cellInput, 'min-w-36', fe.paperName && errBorder)}
          maxLength={200}
        />
      </td>
      <td className={td}>
        <NumberInput value={d.gsm} onChange={(n) => ed.patch({ gsm: n })} min={0} allowDecimal={false} className="w-20" inputClassName={cn(cellInput, 'text-right', fe.gsm && errBorder)} />
      </td>
      <td className={td}>
        <div className="flex items-center gap-1">
          <NumberInput value={d.widthMm} onChange={(n) => setSize(d, n, d.heightMm)} min={0} className="w-16" inputClassName={cn(cellInput, 'text-right', (fe.widthMm || fe.sheetSize) && errBorder)} />
          <span className="text-slate-400 text-xs">×</span>
          <NumberInput value={d.heightMm} onChange={(n) => setSize(d, d.widthMm, n)} min={0} className="w-16" inputClassName={cn(cellInput, 'text-right', (fe.heightMm || fe.sheetSize) && errBorder)} />
        </div>
        <div className="flex gap-1 mt-1">
          {[
            [325, 430],
            [325, 355],
          ].map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              type="button"
              onClick={() => setSize(d, w, h)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border tabular-nums',
                d.widthMm === w && d.heightMm === h ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              )}
            >
              {w}×{h}
            </button>
          ))}
        </div>
      </td>
      <td className={td}>
        <NumberInput value={d.price1Side} onChange={(n) => ed.patch({ price1Side: n })} min={0} step={500} allowDecimal={false} className="w-24" inputClassName={cn(cellInput, 'text-right', fe.price1Side && errBorder)} />
      </td>
      <td className={td}>
        <NumberInput value={d.price2Side} onChange={(n) => ed.patch({ price2Side: n })} min={0} step={500} allowDecimal={false} className="w-24" inputClassName={cn(cellInput, 'text-right', fe.price2Side && errBorder)} />
      </td>
    </>
  );

  return (
    <div className="space-y-4">
      <Alert tone="info" title="In nhanh kèm giấy (INTC) – giá / tờ đã gồm giấy">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Mã giấy khớp với giấy trong kho (VD: C150 = Couche 150, F180_355 = Fort 180 khổ 325×355). Tờ in cắt sẵn khổ 325×430 hoặc 325×355 mm.</li>
          <li>Phụ phí số lượng ít (theo tổng số tờ in): {shortRunText}.</li>
        </ul>
      </Alert>

      <Card
        title="Bảng giá in nhanh kèm giấy"
        icon={<Printer className="w-4 h-4 text-blue-600" />}
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} disabled={!!edit} onClick={() => ed.start(null, KG_NEW)}>
            Thêm mã giấy
          </Button>
        }
      >
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã, tên giấy…" className="pl-8" aria-label="Tìm mã giấy INTC" />
          </div>
          <Segmented<KgGroup> size="sm" className="sm:w-auto" value={group} onChange={setGroup} options={KG_GROUPS.map((g) => ({ value: g.value, label: g.label }))} />
        </div>

        {rows.length === 0 && !edit ? (
          <EmptyState title="Chưa có bảng giá in kèm giấy" description="Thêm mã giấy với giá in 1 mặt / 2 mặt đã gồm giấy." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={th}>Mã giấy</th>
                <th className={th}>Tên giấy</th>
                <th className={cn(th, 'text-right')}>gsm</th>
                <th className={th}>Khổ tờ (mm)</th>
                <th className={cn(th, 'text-right')}>Giá 1 mặt</th>
                <th className={cn(th, 'text-right')}>Giá 2 mặt</th>
                <th className={cn(th, 'text-right')}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {edit && edit.id === null && (
                <>
                  <tr className="bg-blue-50/40">
                    {editingCells(edit.draft, edit.fields)}
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      <RowActions editing saving={edit.saving} busy={false} onSave={ed.save} onCancel={ed.cancel} onEdit={() => undefined} onDelete={() => undefined} disableEdit />
                    </td>
                  </tr>
                  <RowErrors messages={allErrors(edit)} colSpan={colSpan} />
                </>
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className={cn(td, 'text-center text-slate-500 py-8')}>
                    Không có mã giấy phù hợp bộ lọc.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const editing = edit?.id === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className={cn(editing ? 'bg-blue-50/40' : 'hover:bg-slate-50/70')}>
                      {editing && edit ? (
                        editingCells(edit.draft, edit.fields)
                      ) : (
                        <>
                          <td className={cn(td, 'whitespace-nowrap')}>
                            <Badge tone="blue" className="font-mono">
                              {r.paperCode}
                            </Badge>
                          </td>
                          <td className={cn(td, 'text-slate-900')}>{r.paperName}</td>
                          <td className={cn(td, 'text-right tabular-nums')}>{r.gsm}</td>
                          <td className={cn(td, 'tabular-nums whitespace-nowrap text-slate-600')}>
                            {formatNumber(r.widthMm, true)} × {formatNumber(r.heightMm, true)}
                          </td>
                          <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-medium text-slate-900')}>{formatVnd(r.price1Side)}</td>
                          <td className={cn(td, 'text-right tabular-nums whitespace-nowrap font-medium text-slate-900')}>{formatVnd(r.price2Side)}</td>
                        </>
                      )}
                      <td className={cn(td, 'text-right whitespace-nowrap')}>
                        <RowActions
                          editing={editing}
                          saving={editing && !!edit?.saving}
                          busy={ed.removingId === r.id}
                          disableEdit={!!edit}
                          onSave={ed.save}
                          onCancel={ed.cancel}
                          onEdit={() => ed.start(r.id, toKgForm(r))}
                          onDelete={() => ed.remove(r.id, `Xoá mã giấy in kèm "${r.paperCode} – ${r.paperName}"?`, `mã ${r.paperCode}`)}
                        />
                      </td>
                    </tr>
                    {editing && edit && <RowErrors messages={allErrors(edit)} colSpan={colSpan} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Hiển thị {formatNumber(filtered.length)} / {formatNumber(rows.length)} mã · đơn vị: đồng / tờ (đã gồm giấy).
        </p>
      </Card>
    </div>
  );
}
