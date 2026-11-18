'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Copy,
  FileText,
  Layers,
  Loader2,
  Printer,
  Save,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatVnd } from '@/lib/format';
import {
  DIGITAL_MATERIAL_LABELS,
  FINISHING_CATEGORY_LABELS,
  PRODUCT_TYPE_LABELS,
  PRODUCT_UNITS,
  WORK_TYPE_LABELS,
} from '@/lib/engine/constants';
import type { DigitalMaterial, FinishingCategory, OffsetWorkType, ProductType, QuoteOrder } from '@/types';
import { Alert, Badge, Card, Checkbox, Field, NumberInput, Segmented, Select, TextInput, Textarea, cn, useToast } from '../ui';
import { PaperSelectorModal } from '../PaperSelectorModal';
import { QuotePrintModal } from '../QuotePrintModal';
import { ResultPanel } from './ResultPanel';
import { PRESETS } from './presets';
import { useQuote } from './useQuote';
import { defaultForm, pickPaper, toCalculationInput, type CalculatorForm, type MasterData } from './types';
import { buildZaloText } from './zalo';

const COLOR_OPTIONS = [1, 2, 3, 4, 5, 6];

export function CalculatorView({
  master,
  initial,
  sourceCode,
  onOrderSaved,
}: {
  master: MasterData;
  initial?: CalculatorForm;
  sourceCode?: string;
  onOrderSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<CalculatorForm>(() => initial ?? defaultForm(master));
  const [paperModal, setPaperModal] = useState(false);
  const [printDate, setPrintDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ key: string; order: QuoteOrder } | null>(null);

  const [showSpecExtra, setShowSpecExtra] = useState(false);
  const [showAutoAdvanced, setShowAutoAdvanced] = useState(false);
  const [activeFinCat, setActiveFinCat] = useState<FinishingCategory | 'none' | null>(null);
  const [showCustomer, setShowCustomer] = useState(() => Boolean(initial?.customerName || initial?.notes));

  const update = (patch: Partial<CalculatorForm>) => setForm((f) => ({ ...f, ...patch }));

  // ---- Chuẩn hoá theo danh mục hiện hành (giấy / máy / gia công có thể đã bị xoá) ----
  const paper = useMemo(
    () => master.papers.find((p) => p.id === form.paperTypeId) ?? pickPaper(master.papers, 'C', 150),
    [master.papers, form.paperTypeId]
  );
  const activeFinishing = useMemo(() => master.finishing.filter((f) => f.isActive), [master.finishing]);

  const input = useMemo(() => {
    if (!paper) return null;
    const base = toCalculationInput(form);
    return {
      ...base,
      paperTypeId: paper.id,
      printSides: form.productType === 'catalogue' ? ('2_side' as const) : form.printSides,
      offsetMachineId: master.offsetMachines.some((m) => m.id === form.offsetMachineId) ? form.offsetMachineId : undefined,
      selectedFinishing: form.selectedFinishing.filter((s) => activeFinishing.some((f) => f.id === s.serviceId)),
      kemGiayCode: form.digitalMode === 'with_paper' ? form.kemGiayCode : undefined,
      digitalMaterial: form.digitalMode === 'without_paper' ? form.digitalMaterial : undefined,
      colorsBack: form.printSides === '2_side' || form.productType === 'catalogue' ? form.colorsBack || 4 : 0,
    };
  }, [form, paper, master.offsetMachines, activeFinishing]);

  const quote = useQuote(input);
  const inputKey = useMemo(() => JSON.stringify(input), [input]);
  const savedOrder = saved && saved.key === inputKey ? saved.order : null;

  // Mã giấy INTC (in nhanh kèm giấy) – gom theo mã gốc (F180 & F180_355 là 1 loại)
  const kemGiayCodes = useMemo(() => {
    const map = new Map<string, { code: string; gsm: number; name: string }>();
    for (const k of master.kemGiay) {
      const base = k.paperCode.split('_')[0].toUpperCase();
      if (!map.has(base)) map.set(base, { code: base, gsm: k.gsm, name: k.paperName.replace(/\s*\(.*\)$/, '') });
    }
    return [...map.values()];
  }, [master.kemGiay]);

  const finishingGroups = useMemo(() => {
    const groups = new Map<FinishingCategory, typeof activeFinishing>();
    for (const f of activeFinishing) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);
    return [...groups.entries()];
  }, [activeFinishing]);

  const resolvedFinCat =
    activeFinCat === 'none'
      ? null
      : activeFinCat && finishingGroups.some(([c]) => c === activeFinCat)
        ? activeFinCat
        : (finishingGroups[0]?.[0] ?? null);
  const currentFinishingList = finishingGroups.find(([c]) => c === resolvedFinCat)?.[1] ?? [];

  const showOffset = form.printTech === 'offset' || (form.printTech === 'auto' && showAutoAdvanced);
  const showDigital = form.printTech === 'digital' || (form.printTech === 'auto' && showAutoAdvanced);
  const twoSided = form.printSides === '2_side' || form.productType === 'catalogue';
  const hasCustomAutoTech =
    Boolean(form.offsetMachineId) ||
    form.digitalMode !== 'with_paper' ||
    Boolean(form.kemGiayCode) ||
    Boolean(form.digitalMaterial) ||
    form.customerSuppliedPaper ||
    form.whiteInk;

  // ---- Hành động ----
  const toggleFinishing = (serviceId: number) =>
    setForm((f) => ({
      ...f,
      selectedFinishing: f.selectedFinishing.some((s) => s.serviceId === serviceId)
        ? f.selectedFinishing.filter((s) => s.serviceId !== serviceId)
        : [...f.selectedFinishing, { serviceId, sides: 1 }],
    }));

  const setFinishingSides = (serviceId: number, sides: 1 | 2) =>
    setForm((f) => ({ ...f, selectedFinishing: f.selectedFinishing.map((s) => (s.serviceId === serviceId ? { ...s, sides } : s)) }));

  const chooseKemGiay = (code: string | undefined) => {
    if (!code) return update({ kemGiayCode: undefined });
    const m = /^([A-Z]+)(\d+)/.exec(code);
    const match = m ? pickPaper(master.papers, m[1], Number(m[2])) : undefined;
    update({ kemGiayCode: code, ...(match ? { paperTypeId: match.id } : {}) });
  };

  const chooseCustomer = (id: number | null) => {
    const c = master.customers.find((x) => x.id === id);
    update(
      c
        ? { customerId: c.id, customerName: c.name, customerPhone: c.phone, customerEmail: c.email, customerCompany: c.company }
        : { customerId: null, customerName: '', customerPhone: '', customerEmail: '', customerCompany: '' }
    );
  };

  const saveOrder = async () => {
    if (!input) return;
    setSaving(true);
    try {
      const res = await api<{ code: string; order: QuoteOrder }>('/api/orders', {
        method: 'POST',
        body: {
          input,
          customer: {
            id: form.customerId,
            name: form.customerName || 'Khách vãng lai',
            phone: form.customerPhone,
            email: form.customerEmail,
            company: form.customerCompany,
          },
          notes: form.notes,
        },
      });
      setSaved({ key: inputKey, order: res.order });
      if (res.order.customerId && !form.customerId) update({ customerId: res.order.customerId });
      toast.success(`Đã lưu báo giá ${res.code}`);
      onOrderSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const copyZalo = async () => {
    if (!quote.result || !paper || !input) return;
    const text = buildZaloText(input, quote.result, paper, master.settings, savedOrder?.code);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Đã copy nội dung báo giá – dán vào Zalo/Messenger.');
    } catch {
      toast.error('Trình duyệt không cho phép copy tự động.');
    }
  };

  const unit = PRODUCT_UNITS[form.productType];
  const stale = !quote.fresh;
  const canAct = Boolean(quote.result) && !stale;

  return (
    <div className="space-y-3 pb-20 lg:pb-0">
      {sourceCode && (
        <Alert tone="info">
          Đang mở lại từ báo giá <strong>{sourceCode}</strong> – giá tính theo bảng hiện hành.
        </Alert>
      )}

      {/* Mẫu nhanh */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0" title="Mẫu nhanh">
          <Sparkles className="w-3.5 h-3.5" />
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setForm((f) => p.apply(f, master))}
            className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-full text-xs font-medium text-slate-700 whitespace-nowrap transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============ CỘT TRÁI: THÔNG SỐ ============ */}
        <div className="lg:col-span-7 space-y-3">
          {/* Card 1: Quy cách & Giấy */}
          <Card title="Quy cách & giấy" icon={<span className="w-2 h-2 rounded-full bg-blue-600" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5">
                <Field label="Tên bài in" className="col-span-2 sm:col-span-5">
                  <TextInput value={form.jobName} maxLength={200} onChange={(e) => update({ jobName: e.target.value })} placeholder="VD: Tờ rơi khai trương" />
                </Field>
                <Field label="Loại sản phẩm" className="col-span-1 sm:col-span-4">
                  <Select value={form.productType} onChange={(e) => update({ productType: e.target.value as ProductType })}>
                    {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((k) => (
                      <option key={k} value={k}>
                        {PRODUCT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={form.productType === 'catalogue' ? 'Số cuốn' : 'Số lượng'} className="col-span-1 sm:col-span-3">
                  <NumberInput
                    value={form.quantity}
                    min={1}
                    max={10_000_000}
                    step={100}
                    allowDecimal={false}
                    onChange={(v) => update({ quantity: v })}
                    inputClassName="font-bold text-blue-900 border-blue-300 bg-blue-50/40"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-end">
                <Field label="Rộng (mm)" className="col-span-1 sm:col-span-3">
                  <NumberInput value={form.widthMm} min={10} max={2000} onChange={(v) => update({ widthMm: v })} />
                </Field>
                <Field
                  label={
                    <span className="flex items-center justify-between">
                      Dài (mm)
                      <button
                        type="button"
                        title="Đổi chiều rộng ↔ dài"
                        onClick={() => update({ widthMm: form.heightMm, heightMm: form.widthMm })}
                        className="text-slate-400 hover:text-blue-600"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  }
                  className="col-span-1 sm:col-span-3"
                >
                  <NumberInput value={form.heightMm} min={10} max={2000} onChange={(v) => update({ heightMm: v })} />
                </Field>
                {form.productType === 'catalogue' ? (
                  <>
                    <Field label="Số trang / cuốn" className="col-span-1 sm:col-span-3">
                      <NumberInput value={form.pages} min={2} max={2000} step={4} allowDecimal={false} onChange={(v) => update({ pages: v })} />
                    </Field>
                    <Field label="Số mặt" className="col-span-1 sm:col-span-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 sm:py-1.5 text-sm text-slate-600 font-medium text-center">
                        In 2 mặt
                      </div>
                    </Field>
                  </>
                ) : (
                  <Field label="Số mặt in" className="col-span-2 sm:col-span-6">
                    <Segmented
                      value={twoSided ? '2_side' : '1_side'}
                      onChange={(v) => update({ printSides: v })}
                      options={[
                        { value: '1_side', label: '1 mặt' },
                        { value: '2_side', label: '2 mặt' },
                      ]}
                    />
                  </Field>
                )}
              </div>

              {/* Tuỳ chọn màu & tràn lề thu gọn */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSpecExtra((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs text-slate-500 hover:text-slate-800 py-1"
                >
                  <span>
                    Màu in: <strong className="text-slate-700">{twoSided ? `${form.colorsFront}/${form.colorsBack || 4} màu` : `${form.colorsFront} màu`}</strong> · Tràn lề{' '}
                    <strong className="text-slate-700">{form.bleedMm}mm</strong>
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showSpecExtra && 'rotate-180')} />
                </button>
                {showSpecExtra && (
                  <div className="grid grid-cols-3 gap-2.5 pt-2">
                    <Field label="Màu trước">
                      <Select value={form.colorsFront} onChange={(e) => update({ colorsFront: Number(e.target.value) })}>
                        {COLOR_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c === 4 ? '4 màu (CMYK)' : `${c} màu`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Màu sau">
                      <Select value={twoSided ? form.colorsBack || 4 : 0} disabled={!twoSided} onChange={(e) => update({ colorsBack: Number(e.target.value) })}>
                        {!twoSided && <option value={0}>Không in</option>}
                        {COLOR_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c === 4 ? '4 màu (CMYK)' : `${c} màu`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tràn lề (mm)">
                      <NumberInput value={form.bleedMm} min={0} max={10} step={0.5} onChange={(v) => update({ bleedMm: v })} />
                    </Field>
                  </div>
                )}
              </div>

              {/* Chọn giấy tích hợp */}
              <div className="border-t border-slate-100 pt-3">
                {paper ? (
                  <button
                    type="button"
                    onClick={() => setPaperModal(true)}
                    className="w-full text-left group flex items-center justify-between gap-3 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-slate-900 truncate group-hover:text-blue-700">{paper.name}</span>
                          {!paper.isActive && <Badge tone="red">Ngưng</Badge>}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          <span className="font-mono">{paper.code}</span> · {paper.gsm}gsm · {paper.parentWidthCm}×{paper.parentHeightCm}cm · {paper.supplier}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-800 tabular-nums">{formatVnd(paper.priceAbove500)}/ram</p>
                      <span className="text-[11px] font-semibold text-blue-600">Đổi giấy</span>
                    </div>
                  </button>
                ) : (
                  <Alert tone="warning">Chưa có loại giấy nào – hãy thêm giấy ở mục “Kho giấy”.</Alert>
                )}
              </div>
            </div>
          </Card>

          {/* Card 2: Công nghệ & Gia công */}
          <Card title="Công nghệ & gia công" icon={<Printer className="w-4 h-4 text-indigo-600" />}>
            <div className="space-y-3">
              <Segmented
                value={form.printTech}
                onChange={(v) => update({ printTech: v })}
                options={[
                  { value: 'auto', label: '⚡ Tự động' },
                  { value: 'offset', label: 'Offset' },
                  { value: 'digital', label: 'In nhanh' },
                ]}
              />

              {form.printTech === 'auto' && (
                <button
                  type="button"
                  onClick={() => setShowAutoAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs text-slate-500 hover:text-slate-800 py-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span>Tuỳ chỉnh máy / phôi</span>
                    {hasCustomAutoTech && <Badge tone="blue">Đang tuỳ chỉnh</Badge>}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showAutoAdvanced && 'rotate-180')} />
                </button>
              )}

              {showOffset && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Máy in offset">
                    <Select
                      value={form.offsetMachineId ?? 0}
                      onChange={(e) => update({ offsetMachineId: Number(e.target.value) || undefined })}
                    >
                      <option value={0}>Tự chọn máy rẻ nhất</option>
                      {master.offsetMachines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Kiểu trở mặt">
                    <Select
                      value={form.offsetWorkType}
                      disabled={!twoSided}
                      onChange={(e) => update({ offsetWorkType: e.target.value as OffsetWorkType })}
                    >
                      {(Object.keys(WORK_TYPE_LABELS) as OffsetWorkType[]).map((k) => (
                        <option key={k} value={k}>
                          {WORK_TYPE_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {showDigital && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-2.5 space-y-2.5">
                  <Segmented
                    size="sm"
                    value={form.digitalMode}
                    onChange={(v) => update({ digitalMode: v })}
                    options={[
                      { value: 'with_paper', label: 'Kèm giấy (INTC)' },
                      { value: 'without_paper', label: 'Gia công Konica' },
                    ]}
                  />

                  {form.digitalMode === 'with_paper' ? (
                    <Field label="Phôi giấy INTC" hint="Phôi cắt sẵn, không bù hao">
                      <Select value={form.kemGiayCode ?? ''} onChange={(e) => chooseKemGiay(e.target.value || undefined)}>
                        <option value="">Tự khớp theo giấy đang chọn</option>
                        {kemGiayCodes.map((k) => (
                          <option key={k.code} value={k.code}>
                            {k.code} – {k.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <div className="space-y-2.5">
                      <Field label="Chất liệu (bảng Konica)">
                        <Select
                          value={form.digitalMaterial ?? ''}
                          onChange={(e) => update({ digitalMaterial: (e.target.value || undefined) as DigitalMaterial | undefined })}
                        >
                          <option value="">Tự nhận diện theo tên giấy</option>
                          {(Object.keys(DIGITAL_MATERIAL_LABELS) as DigitalMaterial[]).map((k) => (
                            <option key={k} value={k}>
                              {DIGITAL_MATERIAL_LABELS[k]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <Checkbox checked={form.customerSuppliedPaper} onChange={(v) => update({ customerSuppliedPaper: v })} label="Khách tự cấp giấy" />
                        <Checkbox checked={form.whiteInk} onChange={(v) => update({ whiteInk: v })} label="Mực trắng (+2k/mặt)" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Gia công sau in */}
              <div className="border-t border-slate-100 pt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Gia công sau in {form.selectedFinishing.length > 0 ? `(${form.selectedFinishing.length})` : ''}
                  </span>
                  {form.selectedFinishing.length > 0 && (
                    <button
                      type="button"
                      onClick={() => update({ selectedFinishing: [] })}
                      className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    >
                      Bỏ chọn hết
                    </button>
                  )}
                </div>

                {/* Hàng chip đã chọn */}
                {form.selectedFinishing.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.selectedFinishing.map((sel) => {
                      const s = activeFinishing.find((f) => f.id === sel.serviceId);
                      if (!s) return null;
                      const sideable = s.calcType === 'per_m2' || s.calcType === 'per_sheet';
                      return (
                        <div
                          key={s.id}
                          className="inline-flex items-center rounded-lg border bg-purple-50 border-purple-300 text-purple-900 text-xs"
                        >
                          <span className="pl-2.5 pr-1.5 py-1 font-medium">{s.name}</span>
                          {sideable && (
                            <span className="flex border-l border-purple-200 px-1 gap-0.5">
                              {[1, 2].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setFinishingSides(s.id, n as 1 | 2)}
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-bold',
                                    (sel.sides ?? 1) === n ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-100'
                                  )}
                                >
                                  {n}M
                                </button>
                              ))}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Bỏ ${s.name}`}
                            onClick={() => toggleFinishing(s.id)}
                            className="pr-2 pl-1 py-1 text-purple-400 hover:text-purple-800"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {finishingGroups.length === 0 ? (
                  <p className="text-xs text-slate-400">Chưa có dịch vụ gia công.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                      {finishingGroups.map(([cat, list]) => {
                        const active = resolvedFinCat === cat;
                        const pickedCount = list.filter((s) => form.selectedFinishing.some((x) => x.serviceId === s.id)).length;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveFinCat((prev) => (prev === cat ? 'none' : cat))}
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors',
                              active
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                          >
                            <span>{FINISHING_CATEGORY_LABELS[cat] ?? cat}</span>
                            {pickedCount > 0 && (
                              <span className={cn('px-1.5 rounded-full text-[10px] font-bold', active ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700')}>
                                {pickedCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {resolvedFinCat && (
                      <div className="flex flex-wrap gap-1.5">
                        {currentFinishingList.map((s) => {
                          const sel = form.selectedFinishing.find((x) => x.serviceId === s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleFinishing(s.id)}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                                sel
                                  ? 'bg-purple-50 border-purple-400 text-purple-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                              )}
                            >
                              <span
                                className={cn(
                                  'w-3.5 h-3.5 rounded flex items-center justify-center text-[9px]',
                                  sel ? 'bg-purple-600 text-white' : 'border border-slate-300 bg-white'
                                )}
                              >
                                {sel ? '✓' : ''}
                              </span>
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Card 3: Giá bán & Khách hàng */}
          <Card title="Giá bán & khách hàng" icon={<User className="w-4 h-4 text-emerald-600" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Lợi nhuận">
                  <NumberInput value={form.profitMarginPercent} min={0} max={1000} suffix="%" onChange={(v) => update({ profitMarginPercent: v })} />
                </Field>
                <Field label="Giảm giá">
                  <NumberInput value={form.discountAmount} min={0} step={10000} allowDecimal={false} suffix="đ" onChange={(v) => update({ discountAmount: v })} />
                </Field>
                <Field label="VAT">
                  <NumberInput value={form.vatPercent} min={0} max={100} suffix="%" onChange={(v) => update({ vatPercent: v })} />
                </Field>
              </div>

              <div className="border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowCustomer((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs text-slate-600 hover:text-slate-900 py-1"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Khách hàng & ghi chú
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-slate-500 truncate max-w-44">{form.customerName || 'Khách vãng lai'}</span>
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', showCustomer && 'rotate-180')} />
                  </span>
                </button>

                {showCustomer && (
                  <div className="pt-2.5 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Field label="Khách có sẵn">
                        <Select value={form.customerId ?? 0} onChange={(e) => chooseCustomer(Number(e.target.value) || null)}>
                          <option value={0}>— Khách mới / vãng lai —</option>
                          {master.customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.phone ? ` – ${c.phone}` : ''}
                              {c.company ? ` (${c.company})` : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tên khách hàng">
                        <TextInput
                          value={form.customerName}
                          placeholder="Khách vãng lai"
                          onChange={(e) => update({ customerName: e.target.value, customerId: null })}
                        />
                      </Field>
                      <Field label="Số điện thoại">
                        <TextInput
                          type="tel"
                          value={form.customerPhone}
                          onChange={(e) => update({ customerPhone: e.target.value, customerId: null })}
                        />
                      </Field>
                      <Field label="Công ty">
                        <TextInput value={form.customerCompany} onChange={(e) => update({ customerCompany: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Ghi chú đơn hàng">
                      <Textarea
                        rows={2}
                        value={form.notes}
                        maxLength={2000}
                        onChange={(e) => update({ notes: e.target.value })}
                        placeholder="VD: giao trước thứ 6, đóng gói 100 tờ/xấp…"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ============ CỘT PHẢI: KẾT QUẢ ============ */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-3">
          <ResultPanel
            result={quote.result}
            error={quote.error}
            calculating={quote.calculating}
            fresh={quote.fresh}
            quantity={form.quantity}
            productType={form.productType}
            widthMm={form.widthMm}
            heightMm={form.heightMm}
            savedCode={savedOrder?.code}
            saving={saving}
            onSave={saveOrder}
            onPrint={() => setPrintDate(new Date().toISOString())}
            onCopy={copyZalo}
            onUseBestTech={() => update({ printTech: 'auto' })}
          />
        </div>
      </div>

      {/* Thanh báo giá nổi trên Mobile */}
      <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] inset-x-0 z-30 lg:hidden bg-slate-900/95 backdrop-blur text-white px-3.5 py-2 border-t border-slate-800 shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => document.getElementById('quote-result-panel')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-left min-w-0 flex-1"
          >
            <div className="flex items-center gap-1.5">
              <span className={cn('text-base font-black tabular-nums truncate', stale && quote.result && 'opacity-65')}>
                {quote.result ? formatVnd(quote.result.costs.finalPrice) : quote.error ? 'Lỗi tính giá' : 'Đang tính…'}
              </span>
              {quote.calculating && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-300 shrink-0" />}
            </div>
            <p className="text-[11px] text-slate-300 truncate tabular-nums">
              {quote.result ? `${formatVnd(quote.result.costs.unitPrice)}/${unit} · Xem chi tiết ▾` : 'Chạm để xem chi tiết'}
            </p>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!canAct}
              onClick={copyZalo}
              title="Copy Zalo"
              aria-label="Copy báo giá Zalo"
              className="p-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canAct}
              onClick={() => setPrintDate(new Date().toISOString())}
              title="In / PDF"
              aria-label="In phiếu báo giá"
              className="p-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canAct || saving || !!savedOrder}
              onClick={saveOrder}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedOrder ? 'Đã lưu' : 'Lưu'}</span>
            </button>
          </div>
        </div>
      </div>

      <PaperSelectorModal
        open={paperModal}
        onClose={() => setPaperModal(false)}
        papers={master.papers}
        selectedId={paper?.id}
        onSelect={(p) => {
          update({ paperTypeId: p.id, kemGiayCode: undefined });
          setPaperModal(false);
        }}
      />

      {printDate && quote.result && paper && input && (
        <QuotePrintModal
          open
          onClose={() => setPrintDate(null)}
          spec={{ input, result: quote.result, paper: { id: paper.id, code: paper.code, name: paper.name, gsm: paper.gsm } }}
          settings={master.settings}
          code={savedOrder?.code}
          date={savedOrder?.createdAt ?? printDate}
          customer={{ name: form.customerName, phone: form.customerPhone, company: form.customerCompany, email: form.customerEmail }}
          notes={form.notes}
        />
      )}
    </div>
  );
}
