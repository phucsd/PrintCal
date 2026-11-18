'use client';

import React, { useState } from 'react';
import { AlertTriangle, Copy, FileText, LayoutGrid, ListOrdered, Loader2, Save, TrendingUp } from 'lucide-react';
import type { CalculationResult, ProductType } from '@/types';
import { formatNumber, formatVnd } from '@/lib/format';
import { PRODUCT_UNITS, WORK_TYPE_LABELS } from '@/lib/engine/constants';
import { Alert, Button, Segmented, cn } from '../ui';
import { ImpositionVisualizer } from '../ImpositionVisualizer';
import { BreakEvenChart } from '../BreakEvenChart';

export function ResultPanel({
  result,
  error,
  calculating,
  fresh,
  quantity,
  productType,
  widthMm,
  heightMm,
  savedCode,
  saving,
  onSave,
  onPrint,
  onCopy,
  onUseBestTech,
}: {
  result: CalculationResult | null;
  error: string | null;
  calculating: boolean;
  fresh: boolean;
  quantity: number;
  productType: ProductType;
  widthMm: number;
  heightMm: number;
  savedCode?: string;
  saving: boolean;
  onSave: () => void;
  onPrint: () => void;
  onCopy: () => void;
  onUseBestTech?: () => void;
}) {
  const [tab, setTab] = useState<'breakdown' | 'imposition' | 'compare'>('breakdown');

  if (!result) {
    return (
      <div id="quote-result-panel" className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500 scroll-mt-16">
        {error ? (
          <Alert tone="error" title="Không tính được giá">
            {error}
          </Alert>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Đang tính giá…
          </span>
        )}
      </div>
    );
  }

  const c = result.costs;
  const q = result.quantities;
  const unit = PRODUCT_UNITS[productType];
  const stale = !fresh;
  const techLabel =
    result.chosenTech === 'offset'
      ? 'In offset'
      : result.printing.machineName.includes('INTC')
        ? 'In nhanh kèm giấy'
        : 'In nhanh gia công';
  const rec = result.recommendation;
  const otherCheaper = rec.bestTech && rec.bestTech !== result.chosenTech;
  const baseUnitCost = q.productQty ? c.totalBaseCost / q.productQty : 0;

  return (
    <div id="quote-result-panel" className="space-y-3 scroll-mt-16">
      {/* ---------- Tổng giá ---------- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-white/15 text-[11px] font-semibold">{techLabel}</span>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] text-blue-100 tabular-nums">
                Vốn: {formatVnd(baseUnitCost)}/{unit}
              </span>
              {savedCode && <span className="px-2 py-0.5 rounded-md bg-emerald-400/90 text-emerald-950 text-[11px] font-bold">{savedCode}</span>}
            </div>
            {calculating && (
              <span className="inline-flex items-center gap-1 text-[11px] text-blue-100 shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </span>
            )}
          </div>
          <div className={cn('mt-2.5 transition-opacity', stale && 'opacity-60')}>
            <p className="text-xs text-blue-100">Tổng thanh toán{c.vatAmount > 0 ? ` (gồm VAT ${c.vatPercent}%)` : ''}</p>
            <p className="text-3xl font-black tracking-tight tabular-nums">{formatVnd(c.finalPrice)}</p>
            <p className="text-sm text-blue-100 mt-0.5 tabular-nums">
              <strong className="text-white">{formatVnd(c.unitPrice)}</strong> / {unit} · {formatNumber(quantity)} {unit}
            </p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 space-y-3">
          {error && (
            <Alert tone="error" title="Không tính được với thông số hiện tại">
              {error}
            </Alert>
          )}
          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="flex gap-1.5 text-xs text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
          {otherCheaper && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <span>
                {rec.bestTech === 'digital' ? 'In nhanh' : 'In offset'} rẻ hơn:{' '}
                <strong>{formatVnd(rec.bestTech === 'digital' ? rec.digitalTotal : rec.offsetTotal)}</strong>
              </span>
              {onUseBestTech && (
                <button
                  type="button"
                  onClick={onUseBestTech}
                  className="shrink-0 px-2.5 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                >
                  Dùng ngay
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button variant="primary" icon={<Save className="w-4 h-4" />} loading={saving} disabled={stale || !!savedCode} onClick={onSave}>
              {savedCode ? 'Đã lưu' : 'Lưu báo giá'}
            </Button>
            <Button icon={<FileText className="w-4 h-4" />} disabled={stale} onClick={onPrint}>
              In phiếu
            </Button>
            <Button icon={<Copy className="w-4 h-4" />} disabled={stale} onClick={onCopy}>
              Copy Zalo
            </Button>
          </div>

          <dl className={cn('grid grid-cols-2 gap-2 text-xs', stale && 'opacity-60')}>
            <Stat label="Bình trang" value={`${result.imposition.upsPerPrintSheet} con/tờ`} sub={result.imposition.printSheet.name} />
            <Stat
              label="Tờ in"
              value={`${formatNumber(q.totalPrintSheets)} tờ`}
              sub={
                q.printWasteSheets + q.finishingWasteSheets > 0
                  ? `${formatNumber(q.netPrintSheets)} + ${formatNumber(q.printWasteSheets + q.finishingWasteSheets)} bù hao`
                  : 'Không bù hao'
              }
            />
            <Stat
              label={result.imposition.cutScheme.preCut ? 'Phôi giấy' : 'Giấy mẹ'}
              value={`${formatNumber(q.parentSheetsNeeded)} tờ`}
              sub={`${formatNumber(q.ramsNeeded, true)} ram · ~${formatNumber(q.kgNeeded, true)} kg`}
            />
            <Stat
              label="Máy in"
              value={result.chosenTech === 'offset' ? `${result.printing.platesCount} kẽm · ${result.printing.passes} lần` : `${formatNumber(q.impressions)} lượt`}
              sub={result.printing.machineName}
            />
          </dl>
        </div>
      </section>

      {/* ---------- Chi tiết ---------- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'breakdown', label: <span className="inline-flex items-center gap-1"><ListOrdered className="w-3.5 h-3.5" />Chi tiết</span> },
            { value: 'imposition', label: <span className="inline-flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />Bình trang</span> },
            { value: 'compare', label: <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />So sánh</span> },
          ]}
        />

        <div className={cn(stale && 'opacity-60 transition-opacity')}>
          {tab === 'breakdown' && <Breakdown result={result} />}
          {tab === 'imposition' && <ImpositionVisualizer imposition={result.imposition} productWidthMm={widthMm} productHeightMm={heightMm} />}
          {tab === 'compare' && <BreakEvenChart recommendation={result.recommendation} currentQty={quantity} chosenTech={result.chosenTech} unit={unit} />}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-900 text-sm tabular-nums">{value}</dd>
      {sub && <dd className="text-[11px] text-slate-500 truncate" title={sub}>{sub}</dd>}
    </div>
  );
}

function Line({ label, note, amount, strong, negative, className }: { label: React.ReactNode; note?: string; amount: number; strong?: boolean; negative?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 py-1.5', className)}>
      <div className="min-w-0">
        <p className={cn('text-sm', strong ? 'font-semibold text-slate-900' : 'text-slate-700')}>{label}</p>
        {note && <p className="text-[11px] text-slate-500 leading-snug">{note}</p>}
      </div>
      <p className={cn('text-sm tabular-nums whitespace-nowrap', strong ? 'font-bold text-slate-900' : 'text-slate-800', negative && 'text-rose-600')}>
        {negative ? '−' : ''}
        {formatVnd(amount)}
      </p>
    </div>
  );
}

function Breakdown({ result }: { result: CalculationResult }) {
  const c = result.costs;
  const showPreTax = c.vatPercent > 0 || c.discountAmount > 0;
  return (
    <div className="divide-y divide-slate-100">
      <div className="pb-2">
        <SectionLabel>1. Giấy</SectionLabel>
        <Line label={result.imposition.parentSheet.name} note={c.paperNote} amount={c.paperCost} />
      </div>

      <div className="py-2">
        <SectionLabel>
          2. In ấn{result.printing.workType ? ` · ${WORK_TYPE_LABELS[result.printing.workType]}` : ''}
        </SectionLabel>
        {result.printing.lines.map((l, i) => (
          <Line key={i} label={l.label} note={l.note} amount={l.amount} />
        ))}
      </div>

      {c.finishingDetails.length > 0 && (
        <div className="py-2">
          <SectionLabel>3. Gia công</SectionLabel>
          {c.finishingDetails.map((f) => (
            <Line key={f.serviceId} label={f.name} note={f.formula} amount={f.subtotal} />
          ))}
        </div>
      )}

      <div className="pt-2">
        <Line label="Giá vốn sản xuất" amount={c.totalBaseCost} strong />
        <Line label={`Lợi nhuận (${formatNumber(c.profitMarginPercent, true)}%)`} amount={c.profitAmount} />
        {c.discountAmount > 0 && <Line label="Giảm giá" amount={c.discountAmount} negative />}
        {showPreTax && <Line label="Tạm tính" amount={c.preTaxTotal} />}
        {c.vatPercent > 0 && <Line label={`VAT (${formatNumber(c.vatPercent, true)}%)`} amount={c.vatAmount} />}
        <Line label="Tổng thanh toán" amount={c.finalPrice} strong className="border-t border-slate-200 mt-1 pt-2" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>;
}
