'use client';

// =============================================================================
// Máy in & bảng giá – máy offset, bảng giá in gia công Konica, in nhanh kèm giấy
// =============================================================================

import React, { useId, useMemo, useState } from 'react';
import { ChevronDown, Info, Pencil, Plus, Printer, RefreshCw, Search, Trash2 } from 'lucide-react';
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

function RulesCollapse({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
      <summary className="flex items-center justify-between gap-2 cursor-pointer select-none font-semibold text-slate-700 list-none">
        <span className="inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          {title}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-2 mt-2 border-t border-slate-100 leading-relaxed">{children}</div>
    </details>
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
    <div className="space-y-3">
      <PageHeader
        title="Máy in & bảng giá"
        actions={
          <Button size="sm" icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>
            <span className="hidden sm:inline">Tải lại</span>
          </Button>
        }
      />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'offset', label: `Offset${data ? ` (${offsetCount})` : ''}` },
          { value: 'giacong', label: `Gia công${data ? ` (${gcCount})` : ''}` },
          { value: 'kemgiay', label: `Kèm giấy${data ? ` (${kgCount})` : ''}` },
        ]}
      />

      {error && (
        <Alert tone="error" title="Không tải được dữ liệu máy in">
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
    <div className="space-y-3">
      <RulesCollapse title="Quy tắc tính giá in offset">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            Mỗi lần lên máy tính <b>giá mở máy trọn gói</b> cho tối đa <b>N lượt</b>; vượt gói cộng <b>giá mỗi 1.000 lượt</b>.
          </li>
          <li>
            Nếu bật “đã gồm {PLATES_INCLUDED_PER_PASS} kẽm”, chỉ tính thêm kẽm từ màu thứ {PLATES_INCLUDED_PER_PASS + 1}.
          </li>
          <li>
            <b>In 2 bài</b> = 2 lần mở máy, 2 bộ kẽm. <b>Tự trở / trở nhíp</b> = 1 bộ kẽm, lượt ép gấp đôi.
          </li>
        </ul>
      </RulesCollapse>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{formatNumber(machines.length)} máy offset</p>
        <Button size="sm" variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => ed.start(null, OFFSET_DEFAULT)}>
          Thêm máy
        </Button>
      </div>

      {machines.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Printer className="w-10 h-10" />}
            title="Chưa có máy offset"
            description="Cần ít nhất 1 máy offset để báo giá in offset."
            action={
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => ed.start(null, OFFSET_DEFAULT)}>
                Thêm máy offset
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Stat label="Khổ in tối đa" value={`${formatNumber(m.maxWidthMm)} × ${formatNumber(m.maxHeightMm)} mm`} />
                  <Stat
                    label="Khổ in tối thiểu"
                    value={m.minWidthMm > 0 || m.minHeightMm > 0 ? `${formatNumber(m.minWidthMm)} × ${formatNumber(m.minHeightMm)} mm` : 'Không giới hạn'}
                  />
                  <Stat label={`Mở máy (≤ ${formatNumber(m.baseImpressions)} lượt)`} value={formatVnd(m.setupCost)} strong />
                  <Stat label="Vượt gói / 1.000 lượt" value={formatVnd(m.stepCost)} />
                  <Stat label="Giá kẽm / lá" value={formatVnd(m.platePrice)} />
                  <Stat label="Bù hao / lề nhíp" value={`${formatNumber(m.defaultWasteSheets)} tờ · ${formatNumber(m.gripperMarginMm, true)}mm`} />
                </dl>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                  {m.includesPlate ? <Badge tone="green">Gồm {PLATES_INCLUDED_PER_PASS} kẽm</Badge> : <Badge tone="amber">Kẽm riêng</Badge>}
                  <span className="tabular-nums">
                    4M {formatNumber(EXAMPLE_IMPRESSIONS)} lượt: <strong className="text-slate-800">{formatVnd(offsetPassCost(m, EXAMPLE_IMPRESSIONS))}</strong>
                  </span>
                </div>
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
      <dt className="text-[11px] text-slate-500 truncate">{label}</dt>
      <dd className={cn('mt-0.5 tabular-nums truncate', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
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
      onClose={() => !edit.saving && onClose()}
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
        className="space-y-4"
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
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
            {num('maxWidthMm', 'Lớn nhất – rộng *', { suffix: 'mm' })}
            {num('maxHeightMm', 'Lớn nhất – dài *', { suffix: 'mm' })}
            {num('minWidthMm', 'Nhỏ nhất – rộng', { suffix: 'mm' })}
            {num('minHeightMm', 'Nhỏ nhất – dài', { suffix: 'mm' })}
          </div>
          <p className="text-[11px] text-slate-400">Khổ nhỏ nhất để 0 nếu không giới hạn.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Giá in</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {num('setupCost', 'Giá mở máy trọn gói *', { suffix: 'đ', step: 10000, int: true })}
            {num('baseImpressions', 'Số lượt trong gói', { suffix: 'lượt', step: 500, int: true })}
            {num('stepCost', 'Mỗi 1.000 lượt vượt', { suffix: 'đ', step: 10000, int: true })}
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3 items-end">
            {num('platePrice', 'Giá kẽm CTP / lá', { suffix: 'đ', step: 5000, int: true })}
            <div className="sm:col-span-2 pb-1">
              <Checkbox
                checked={f.includesPlate}
                onChange={(v) => onPatch({ includesPlate: v })}
                label={`Gói mở máy đã gồm ${PLATES_INCLUDED_PER_PASS} kẽm`}
                description="Chỉ tính thêm kẽm từ màu thứ 5."
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Kỹ thuật</legend>
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3">
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

  return (
    <div className="space-y-3">
      <RulesCollapse title="Quy tắc giá in gia công Konica (đ / tờ / 1 mặt)">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>In 2 mặt = đơn giá × 2. Giá <b>0</b> = không nhận in chất liệu tương ứng.</li>
          <li>Phụ phí số lượng ít: {shortRunText}.</li>
          <li>Mực trắng: +{formatVnd(WHITE_INK_PER_SIDE)} / mặt / tờ.</li>
        </ul>
      </RulesCollapse>

      <Card
        title="Bảng giá in gia công Konica"
        icon={<Printer className="w-4 h-4 text-blue-600" />}
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => ed.start(null, newRow())}>
            Thêm khổ
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="Chưa có bảng giá in gia công" description="Thêm khổ giấy và đơn giá theo chất liệu." />
        ) : (
          <>
            {/* Bảng Desktop */}
            <div className="hidden md:block">
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
                  {rows.map((r) => {
                    const busy = ed.removingId === r.id;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
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
                        <td className={cn(td, 'text-right whitespace-nowrap')}>
                          <div className="inline-flex items-center gap-0.5">
                            <IconButton label="Sửa" disabled={busy} onClick={() => ed.start(r.id, toGcForm(r))}>
                              <Pencil className="w-4 h-4" />
                            </IconButton>
                            <IconButton
                              label="Xoá"
                              tone="danger"
                              disabled={busy}
                              onClick={() => ed.remove(r.id, `Xoá dòng giá khổ "${r.sheetSize}" (${r.machineName})?`, `khổ ${r.sheetSize}`)}
                            >
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

            {/* Thẻ Mobile */}
            <div className="md:hidden divide-y divide-slate-100">
              {rows.map((r) => {
                const busy = ed.removingId === r.id;
                const prices = GC_PRICE_COLUMNS.filter((c) => r[c.key] > 0);
                return (
                  <div key={r.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{r.sheetSize}</span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {formatNumber(r.widthMm, true)}×{formatNumber(r.heightMm, true)}mm
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{r.machineName}</p>
                      </div>
                      <div className="inline-flex items-center gap-0.5 shrink-0">
                        <IconButton label="Sửa" disabled={busy} onClick={() => ed.start(r.id, toGcForm(r))}>
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          label="Xoá"
                          tone="danger"
                          disabled={busy}
                          onClick={() => ed.remove(r.id, `Xoá dòng giá khổ "${r.sheetSize}" (${r.machineName})?`, `khổ ${r.sheetSize}`)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                    {prices.length > 0 ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        {prices.map((c) => (
                          <div key={c.key} className="flex items-center justify-between gap-2">
                            <dt className="text-slate-500 truncate">{c.label}</dt>
                            <dd className="font-semibold text-slate-900 tabular-nums shrink-0">{formatVnd(r[c.key])}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-slate-400">Chưa nhập đơn giá chất liệu.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">Đơn vị: đồng / tờ / 1 mặt.</p>
      </Card>

      {ed.edit && <GiaCongEditorModal edit={ed.edit} onPatch={ed.patch} onSave={ed.save} onClose={ed.cancel} />}
    </div>
  );
}

function GiaCongEditorModal({
  edit,
  onPatch,
  onSave,
  onClose,
}: {
  edit: RowEdit<GiaCongForm>;
  onPatch: (p: Partial<GiaCongForm>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const formId = `${uid}-gc-form`;
  const d = edit.draft;
  const fe = edit.fields;

  return (
    <Modal
      open
      onClose={() => !edit.saving && onClose()}
      size="lg"
      title={edit.id === null ? 'Thêm khổ in gia công' : `Sửa khổ “${d.sheetSize || '…'}”`}
      footer={
        <>
          <Button onClick={onClose} disabled={edit.saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={edit.saving}>
            {edit.id === null ? 'Thêm khổ' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tên máy *" htmlFor={`${uid}-machine`} error={fe.machineName}>
            <TextInput id={`${uid}-machine`} value={d.machineName} onChange={(e) => onPatch({ machineName: e.target.value })} maxLength={200} autoFocus />
          </Field>
          <Field label="Tên khổ *" htmlFor={`${uid}-sheet`} error={fe.sheetSize}>
            <TextInput id={`${uid}-sheet`} value={d.sheetSize} onChange={(e) => onPatch({ sheetSize: e.target.value })} placeholder="VD: 32,5×43" maxLength={50} />
          </Field>
          <Field label="Rộng (mm) *" htmlFor={`${uid}-w`} error={fe.widthMm}>
            <NumberInput id={`${uid}-w`} value={d.widthMm} onChange={(n) => onPatch({ widthMm: n })} min={0} suffix="mm" />
          </Field>
          <Field label="Dài (mm) *" htmlFor={`${uid}-h`} error={fe.heightMm}>
            <NumberInput id={`${uid}-h`} value={d.heightMm} onChange={(n) => onPatch({ heightMm: n })} min={0} suffix="mm" />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Đơn giá 1 mặt / tờ (0 = không nhận)</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {GC_PRICE_COLUMNS.map((c) => (
              <Field key={c.key} label={c.label} htmlFor={`${uid}-${c.key}`} error={fe[c.key]}>
                <NumberInput
                  id={`${uid}-${c.key}`}
                  value={d[c.key]}
                  onChange={(n) => {
                    const p: Partial<GiaCongForm> = {};
                    p[c.key] = n;
                    onPatch(p);
                  }}
                  min={0}
                  step={500}
                  allowDecimal={false}
                  suffix="đ"
                />
              </Field>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
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
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<KgGroup>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && kgGroupOf(r.paperCode) !== group) return false;
      if (q && !`${r.paperCode} ${r.paperName} ${r.gsm} ${r.sheetSize}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, group]);

  return (
    <div className="space-y-3">
      <RulesCollapse title="Quy tắc giá in nhanh kèm giấy (INTC)">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Mã giấy khớp với kho giấy (VD: C150, F180_355). Phôi cắt sẵn 325×430 hoặc 325×355 mm.</li>
          <li>Phụ phí số lượng ít: {shortRunText}.</li>
        </ul>
      </RulesCollapse>

      <Card
        title="Bảng giá in nhanh kèm giấy"
        icon={<Printer className="w-4 h-4 text-blue-600" />}
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => ed.start(null, KG_NEW)}>
            Thêm mã
          </Button>
        }
      >
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="relative sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã, tên giấy…" className="pl-8" aria-label="Tìm mã giấy INTC" />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {KG_GROUPS.map((g) => {
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

        {rows.length === 0 ? (
          <EmptyState title="Chưa có bảng giá in kèm giấy" description="Thêm mã giấy với giá in 1 mặt / 2 mặt đã gồm giấy." />
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">Không có mã giấy phù hợp bộ lọc.</p>
        ) : (
          <>
            {/* Bảng Desktop */}
            <div className="hidden md:block">
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
                  {filtered.map((r) => {
                    const busy = ed.removingId === r.id;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
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
                        <td className={cn(td, 'text-right whitespace-nowrap')}>
                          <div className="inline-flex items-center gap-0.5">
                            <IconButton label="Sửa" disabled={busy} onClick={() => ed.start(r.id, toKgForm(r))}>
                              <Pencil className="w-4 h-4" />
                            </IconButton>
                            <IconButton
                              label="Xoá"
                              tone="danger"
                              disabled={busy}
                              onClick={() => ed.remove(r.id, `Xoá mã giấy in kèm "${r.paperCode} – ${r.paperName}"?`, `mã ${r.paperCode}`)}
                            >
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

            {/* Danh sách Mobile */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((r) => {
                const busy = ed.removingId === r.id;
                return (
                  <div key={r.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge tone="blue" className="font-mono shrink-0">
                          {r.paperCode}
                        </Badge>
                        <span className="font-semibold text-sm text-slate-900 truncate">{r.paperName}</span>
                      </div>
                      <div className="text-right text-xs tabular-nums shrink-0">
                        <span className="font-semibold text-slate-900">1M: {formatVnd(r.price1Side)}</span>
                        <span className="block text-slate-600">2M: {formatVnd(r.price2Side)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {r.gsm}gsm · {formatNumber(r.widthMm, true)}×{formatNumber(r.heightMm, true)}mm
                      </p>
                      <div className="inline-flex items-center gap-0.5 shrink-0">
                        <IconButton label="Sửa" disabled={busy} onClick={() => ed.start(r.id, toKgForm(r))}>
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          label="Xoá"
                          tone="danger"
                          disabled={busy}
                          onClick={() => ed.remove(r.id, `Xoá mã giấy in kèm "${r.paperCode} – ${r.paperName}"?`, `mã ${r.paperCode}`)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
          {formatNumber(filtered.length)} / {formatNumber(rows.length)} mã · đơn giá đồng / tờ (đã gồm giấy).
        </p>
      </Card>

      {ed.edit && <KemGiayEditorModal edit={ed.edit} onPatch={ed.patch} onSave={ed.save} onClose={ed.cancel} />}
    </div>
  );
}

function KemGiayEditorModal({
  edit,
  onPatch,
  onSave,
  onClose,
}: {
  edit: RowEdit<KemGiayForm>;
  onPatch: (p: Partial<KemGiayForm>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const formId = `${uid}-kg-form`;
  const d = edit.draft;
  const fe = edit.fields;

  const setSize = (w: number, h: number) => onPatch({ widthMm: w, heightMm: h, sheetSize: `${w}x${h}` });

  return (
    <Modal
      open
      onClose={() => !edit.saving && onClose()}
      size="md"
      title={edit.id === null ? 'Thêm mã giấy in kèm' : `Sửa mã ${d.paperCode || '…'}`}
      footer={
        <>
          <Button onClick={onClose} disabled={edit.saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={edit.saving}>
            {edit.id === null ? 'Thêm mã' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-3.5"
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã giấy *" htmlFor={`${uid}-code`} error={fe.paperCode}>
            <TextInput
              id={`${uid}-code`}
              value={d.paperCode}
              onChange={(e) => onPatch({ paperCode: e.target.value.toUpperCase() })}
              placeholder="VD: C150"
              className="font-mono"
              maxLength={50}
              autoFocus
            />
          </Field>
          <Field label="Định lượng *" htmlFor={`${uid}-gsm`} error={fe.gsm}>
            <NumberInput id={`${uid}-gsm`} value={d.gsm} onChange={(n) => onPatch({ gsm: n })} min={0} allowDecimal={false} suffix="gsm" />
          </Field>
        </div>

        <Field label="Tên giấy *" htmlFor={`${uid}-name`} error={fe.paperName}>
          <TextInput id={`${uid}-name`} value={d.paperName} onChange={(e) => onPatch({ paperName: e.target.value })} placeholder="Couche 150" maxLength={200} />
        </Field>

        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rộng (mm) *" htmlFor={`${uid}-w`} error={fe.widthMm || fe.sheetSize}>
              <NumberInput id={`${uid}-w`} value={d.widthMm} onChange={(n) => setSize(n, d.heightMm)} min={0} suffix="mm" />
            </Field>
            <Field label="Dài (mm) *" htmlFor={`${uid}-h`} error={fe.heightMm || fe.sheetSize}>
              <NumberInput id={`${uid}-h`} value={d.heightMm} onChange={(n) => setSize(d.widthMm, n)} min={0} suffix="mm" />
            </Field>
          </div>
          <div className="flex gap-1.5">
            {[
              [325, 430],
              [325, 355],
            ].map(([w, h]) => (
              <button
                key={`${w}x${h}`}
                type="button"
                onClick={() => setSize(w, h)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border tabular-nums transition-colors',
                  d.widthMm === w && d.heightMm === h ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                {w}×{h} mm
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Giá 1 mặt *" htmlFor={`${uid}-p1`} error={fe.price1Side}>
            <NumberInput id={`${uid}-p1`} value={d.price1Side} onChange={(n) => onPatch({ price1Side: n })} min={0} step={500} allowDecimal={false} suffix="đ" />
          </Field>
          <Field label="Giá 2 mặt *" htmlFor={`${uid}-p2`} error={fe.price2Side}>
            <NumberInput id={`${uid}-p2`} value={d.price2Side} onChange={(n) => onPatch({ price2Side: n })} min={0} step={500} allowDecimal={false} suffix="đ" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
