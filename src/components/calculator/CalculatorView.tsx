'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Layers, Printer, Scissors, Sparkles, User } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatVnd } from '@/lib/format';
import {
  DIGITAL_MATERIAL_LABELS,
  FINISHING_CATEGORY_LABELS,
  PRODUCT_TYPE_LABELS,
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

  const showOffset = form.printTech !== 'digital';
  const showDigital = form.printTech !== 'offset';
  const twoSided = form.printSides === '2_side' || form.productType === 'catalogue';

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
      toast.success('Đã copy nội dung báo giá – dán vào Zalo/Messenger để gửi khách.');
    } catch {
      toast.error('Trình duyệt không cho phép copy tự động.');
    }
  };

  return (
    <div className="space-y-4">
      {sourceCode && (
        <Alert tone="info">
          Đang mở lại thông số từ báo giá <strong>{sourceCode}</strong>. Giá được tính lại theo bảng giá hiện hành – bấm “Lưu báo giá” để tạo báo giá mới.
        </Alert>
      )}

      {/* Mẫu nhanh */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 pr-1">Mẫu nhanh</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setForm((f) => p.apply(f, master))}
            className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-full text-xs font-medium text-slate-700 whitespace-nowrap transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============ CỘT TRÁI: THÔNG SỐ ============ */}
        <div className="lg:col-span-7 space-y-4">
          <Card title="Quy cách sản phẩm" icon={<span className="w-2 h-2 rounded-full bg-blue-600" />}>
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Tên bài in" className="sm:col-span-2">
                  <TextInput value={form.jobName} maxLength={200} onChange={(e) => update({ jobName: e.target.value })} placeholder="VD: Tờ rơi khai trương" />
                </Field>
                <Field label="Loại sản phẩm">
                  <Select value={form.productType} onChange={(e) => update({ productType: e.target.value as ProductType })}>
                    {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((k) => (
                      <option key={k} value={k}>
                        {PRODUCT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                <Field label="Rộng (mm)">
                  <NumberInput value={form.widthMm} min={10} max={2000} onChange={(v) => update({ widthMm: v })} />
                </Field>
                <Field label={
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
                }>
                  <NumberInput value={form.heightMm} min={10} max={2000} onChange={(v) => update({ heightMm: v })} />
                </Field>
                <Field label={form.productType === 'catalogue' ? 'Số cuốn' : 'Số lượng'} className="col-span-2 sm:col-span-1">
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
                {form.productType === 'catalogue' ? (
                  <Field label="Số trang / cuốn" hint={`= ${Math.ceil(form.pages / 2)} tờ / cuốn`}>
                    <NumberInput value={form.pages} min={2} max={2000} step={4} allowDecimal={false} onChange={(v) => update({ pages: v })} />
                  </Field>
                ) : (
                  <Field label="Tràn lề (mm)">
                    <NumberInput value={form.bleedMm} min={0} max={10} step={0.5} onChange={(v) => update({ bleedMm: v })} />
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Số mặt in">
                  <Segmented
                    value={twoSided ? '2_side' : '1_side'}
                    onChange={(v) => update({ printSides: v })}
                    options={[
                      { value: '1_side', label: 'In 1 mặt' },
                      { value: '2_side', label: 'In 2 mặt' },
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Màu mặt trước">
                    <Select value={form.colorsFront} onChange={(e) => update({ colorsFront: Number(e.target.value) })}>
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c === 4 ? '4 màu (CMYK)' : `${c} màu`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Màu mặt sau">
                    <Select value={twoSided ? form.colorsBack || 4 : 0} disabled={!twoSided} onChange={(e) => update({ colorsBack: Number(e.target.value) })}>
                      {!twoSided && <option value={0}>Không in</option>}
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c === 4 ? '4 màu (CMYK)' : `${c} màu`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </div>
          </Card>

          {/* Giấy */}
          <Card
            title="Chất liệu giấy"
            icon={<Layers className="w-4 h-4 text-amber-600" />}
            actions={
              <button type="button" onClick={() => setPaperModal(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Tra cứu & đổi giấy ({master.papers.filter((p) => p.isActive).length} loại)
              </button>
            }
          >
            {paper ? (
              <button
                type="button"
                onClick={() => setPaperModal(true)}
                className="w-full text-left group border border-slate-200 hover:border-blue-400 rounded-xl p-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Badge tone="amber">NCC: {paper.supplier}</Badge>
                      <span className="font-mono text-[11px] text-slate-500 truncate">{paper.code}</span>
                      {!paper.isActive && <Badge tone="red">Ngưng dùng</Badge>}
                    </div>
                    <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700">{paper.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {paper.gsm} gsm · khổ mẹ {paper.parentWidthCm} × {paper.parentHeightCm} cm
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs">
                    <p className="text-slate-500">≥ 500 tờ: <strong className="text-slate-800">{formatVnd(paper.priceAbove500)}</strong>/ram</p>
                    <p className="text-slate-500">&lt; 500 tờ: <strong className="text-slate-800">{formatVnd(paper.priceBelow500)}</strong>/ram</p>
                  </div>
                </div>
              </button>
            ) : (
              <Alert tone="warning">Chưa có loại giấy nào – hãy thêm giấy ở mục “Giá giấy”.</Alert>
            )}
          </Card>

          {/* Công nghệ in */}
          <Card title="Công nghệ in" icon={<Printer className="w-4 h-4 text-indigo-600" />}>
            <div className="space-y-4">
              <Segmented
                value={form.printTech}
                onChange={(v) => update({ printTech: v })}
                options={[
                  { value: 'auto', label: '⚡ Tự động (rẻ nhất)' },
                  { value: 'offset', label: 'In offset' },
                  { value: 'digital', label: 'In nhanh KTS' },
                ]}
              />

              {showOffset && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
                  <p className="text-xs font-semibold text-indigo-900">Tuỳ chọn offset</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Máy in">
                      <Select
                        value={form.offsetMachineId ?? 0}
                        onChange={(e) => update({ offsetMachineId: Number(e.target.value) || undefined })}
                      >
                        <option value={0}>Tự chọn máy & khổ rẻ nhất</option>
                        {master.offsetMachines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kiểu in 2 mặt" hint={twoSided ? undefined : 'Chỉ áp dụng khi in 2 mặt'}>
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
                </div>
              )}

              {showDigital && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-sky-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Tuỳ chọn in nhanh
                    </p>
                    <Segmented
                      size="sm"
                      className="sm:w-auto"
                      value={form.digitalMode}
                      onChange={(v) => update({ digitalMode: v })}
                      options={[
                        { value: 'with_paper', label: 'Kèm giấy (INTC)' },
                        { value: 'without_paper', label: 'Gia công Konica' },
                      ]}
                    />
                  </div>

                  {form.digitalMode === 'with_paper' ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-600">
                        Giá trọn gói in + phôi giấy cắt sẵn (325×430 / 325×355 mm), không bù hao. Phụ phí: &lt; 50 tờ +30k, &lt; 100 tờ +20k.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Chip active={!form.kemGiayCode} onClick={() => chooseKemGiay(undefined)}>
                          Tự khớp theo giấy
                        </Chip>
                        {kemGiayCodes.map((k) => (
                          <Chip key={k.code} active={form.kemGiayCode === k.code} onClick={() => chooseKemGiay(k.code)} title={k.name}>
                            {k.code}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Field label="Nhóm chất liệu (bảng giá Konica)">
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
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Checkbox
                          checked={form.customerSuppliedPaper}
                          onChange={(v) => update({ customerSuppliedPaper: v })}
                          label="Khách tự cấp giấy"
                          description="Tiền giấy = 0đ"
                        />
                        <Checkbox checked={form.whiteInk} onChange={(v) => update({ whiteInk: v })} label="In mực trắng" description="+2.000đ / mặt / tờ" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Gia công */}
          <Card
            title="Gia công sau in"
            icon={<Scissors className="w-4 h-4 text-purple-600" />}
            actions={<span className="text-xs text-slate-400">{input?.selectedFinishing.length ?? 0} đã chọn</span>}
          >
            {finishingGroups.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có dịch vụ gia công đang hoạt động.</p>
            ) : (
              <div className="space-y-3">
                {finishingGroups.map(([cat, list]) => (
                  <div key={cat}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{FINISHING_CATEGORY_LABELS[cat] ?? cat}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((s) => {
                        const sel = form.selectedFinishing.find((x) => x.serviceId === s.id);
                        const sideable = s.calcType === 'per_m2' || s.calcType === 'per_sheet';
                        return (
                          <div
                            key={s.id}
                            className={cn(
                              'flex items-center rounded-lg border text-xs transition-colors',
                              sel ? 'bg-purple-50 border-purple-400 text-purple-900' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                            )}
                          >
                            <button type="button" onClick={() => toggleFinishing(s.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 font-medium">
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
                            {sel && sideable && (
                              <span className="flex border-l border-purple-200 pr-1">
                                {[1, 2].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setFinishingSides(s.id, n as 1 | 2)}
                                    className={cn(
                                      'ml-1 px-1.5 rounded text-[10px] font-bold',
                                      (sel.sides ?? 1) === n ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-100'
                                    )}
                                  >
                                    {n} mặt
                                  </button>
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Giá bán & khách hàng */}
          <Card title="Giá bán & khách hàng" icon={<User className="w-4 h-4 text-emerald-600" />}>
            <div className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Khách hàng có sẵn">
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
                <Field label="Số điện thoại" hint="Lưu báo giá sẽ tự tạo / liên kết khách theo SĐT">
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
                <Textarea rows={2} value={form.notes} maxLength={2000} onChange={(e) => update({ notes: e.target.value })} placeholder="VD: giao trước thứ 6, đóng gói 100 tờ/xấp…" />
              </Field>
            </div>
          </Card>
        </div>

        {/* ============ CỘT PHẢI: KẾT QUẢ ============ */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
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
          />
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

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'px-2 py-1 rounded-md text-[11px] font-semibold transition-colors',
        active ? 'bg-sky-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-sky-100'
      )}
    >
      {children}
    </button>
  );
}
