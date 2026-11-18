'use client';

import React from 'react';
import type { OrderSpec, SystemSetting } from '@/types';
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format';
import { DIGITAL_MATERIAL_LABELS, FINISHING_CATEGORY_LABELS, PRODUCT_TYPE_LABELS, PRODUCT_UNITS, WORK_TYPE_LABELS } from '@/lib/engine/constants';

export interface QuoteDocumentProps {
  kind: 'quote' | 'job';
  spec: OrderSpec;
  settings: SystemSetting;
  code?: string;
  date: string;
  customer: { name: string; phone: string; company?: string; email?: string };
  notes?: string;
}

const cell = 'border border-slate-300 px-2 py-1.5 align-top';
const head = 'border border-slate-300 px-2 py-1.5 bg-slate-100 font-semibold text-left';

function techText(spec: OrderSpec) {
  const { input, result } = spec;
  if (result.chosenTech === 'offset') return 'In offset';
  return input.digitalMode === 'without_paper'
    ? `In nhanh KTS (Konica${input.digitalMaterial ? ` – ${DIGITAL_MATERIAL_LABELS[input.digitalMaterial]}` : ''})`
    : 'In nhanh KTS (kèm giấy)';
}

function colorsText(spec: OrderSpec) {
  const { input } = spec;
  const two = input.printSides === '2_side' || input.productType === 'catalogue';
  return two ? `2 mặt (${input.colorsFront}/${input.colorsBack || input.colorsFront} màu)` : `1 mặt (${input.colorsFront} màu)`;
}

/** Phiếu báo giá khách hàng / Lệnh sản xuất – khổ A4, dùng chung cho xem trước và in */
export function QuoteDocument(props: QuoteDocumentProps) {
  return (
    <div className="bg-white text-slate-900 text-[12px] leading-relaxed w-full max-w-[190mm] mx-auto">
      {props.kind === 'quote' ? <QuoteSheet {...props} /> : <JobTicket {...props} />}
    </div>
  );
}

function QuoteSheet({ spec, settings, code, date, customer, notes }: QuoteDocumentProps) {
  const { input, result, paper } = spec;
  const c = result.costs;
  const unit = PRODUCT_UNITS[input.productType];
  const goods = c.preTaxTotal + c.discountAmount; // tiền hàng trước giảm giá

  return (
    <div className="space-y-4">
      <header className="flex justify-between items-start gap-4 border-b-2 border-slate-900 pb-3">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide">{settings.companyName}</h1>
          {settings.companyAddress && <p className="text-slate-600">{settings.companyAddress}</p>}
          <p className="text-slate-600">
            {settings.companyPhone && <>ĐT: <strong className="text-slate-800">{settings.companyPhone}</strong></>}
            {settings.companyPhone && settings.companyEmail && ' · '}
            {settings.companyEmail && <>Email: {settings.companyEmail}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black tracking-widest text-blue-700">BÁO GIÁ</p>
          <p className="font-bold">{code ?? 'BẢN NHÁP'}</p>
          <p className="text-slate-500">Ngày: {formatDateTime(date, false)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 rounded border border-slate-300 p-3">
        <div>
          <p className="text-slate-500">Kính gửi:</p>
          <p className="font-bold text-[13px]">{customer.name || 'Quý khách hàng'}</p>
          {customer.company && <p>{customer.company}</p>}
        </div>
        <div className="text-right">
          <p className="text-slate-500">Liên hệ:</p>
          <p className="font-semibold">{customer.phone || '—'}</p>
          {customer.email && <p>{customer.email}</p>}
        </div>
      </section>

      <section>
        <h2 className="font-bold uppercase mb-1.5">1. Quy cách sản phẩm</h2>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <th className={head + ' w-[22%]'}>Tên sản phẩm</th>
              <td className={cell + ' font-semibold'}>{input.jobName}</td>
              <th className={head + ' w-[18%]'}>Loại</th>
              <td className={cell}>{PRODUCT_TYPE_LABELS[input.productType]}</td>
            </tr>
            <tr>
              <th className={head}>Kích thước</th>
              <td className={cell}>
                {input.widthMm} × {input.heightMm} mm{input.productType === 'catalogue' ? ` · ${input.pages} trang` : ''}
              </td>
              <th className={head}>Số lượng</th>
              <td className={cell + ' font-semibold'}>
                {formatNumber(input.quantity)} {unit}
              </td>
            </tr>
            <tr>
              <th className={head}>Chất liệu</th>
              <td className={cell}>{paper.name}</td>
              <th className={head}>In</th>
              <td className={cell}>
                {techText(spec)} · {colorsText(spec)}
              </td>
            </tr>
            <tr>
              <th className={head}>Gia công</th>
              <td className={cell} colSpan={3}>
                {c.finishingDetails.length > 0 ? c.finishingDetails.map((f) => f.name + (f.sides === 2 ? ' (2 mặt)' : '')).join(' · ') : 'Xén thành phẩm'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-bold uppercase mb-1.5">2. Chi phí</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={head + ' w-10 text-center'}>STT</th>
              <th className={head}>Nội dung</th>
              <th className={head + ' text-center'}>ĐVT</th>
              <th className={head + ' text-right'}>SL</th>
              <th className={head + ' text-right'}>Đơn giá</th>
              <th className={head + ' text-right'}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cell + ' text-center'}>1</td>
              <td className={cell}>
                <strong>{input.jobName}</strong>
                <span className="block text-slate-500 text-[11px]">
                  {input.widthMm}×{input.heightMm}mm · {paper.name} · {colorsText(spec)}
                </span>
              </td>
              <td className={cell + ' text-center'}>{unit}</td>
              <td className={cell + ' text-right tabular-nums'}>{formatNumber(input.quantity)}</td>
              <td className={cell + ' text-right tabular-nums'}>{formatNumber(goods / input.quantity, true)}</td>
              <td className={cell + ' text-right tabular-nums font-semibold'}>{formatVnd(goods)}</td>
            </tr>
          </tbody>
          <tfoot>
            {c.discountAmount > 0 && (
              <tr>
                <td className={cell + ' text-right'} colSpan={5}>Chiết khấu</td>
                <td className={cell + ' text-right tabular-nums'}>−{formatVnd(c.discountAmount)}</td>
              </tr>
            )}
            {c.vatPercent > 0 && (
              <>
                <tr>
                  <td className={cell + ' text-right'} colSpan={5}>Cộng tiền hàng</td>
                  <td className={cell + ' text-right tabular-nums'}>{formatVnd(c.preTaxTotal)}</td>
                </tr>
                <tr>
                  <td className={cell + ' text-right'} colSpan={5}>Thuế VAT ({formatNumber(c.vatPercent, true)}%)</td>
                  <td className={cell + ' text-right tabular-nums'}>{formatVnd(c.vatAmount)}</td>
                </tr>
              </>
            )}
            <tr className="bg-blue-50">
              <td className={cell + ' text-right font-bold uppercase'} colSpan={5}>Tổng cộng thanh toán</td>
              <td className={cell + ' text-right font-black text-[13px] tabular-nums text-blue-800'}>{formatVnd(c.finalPrice)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-[11px] text-slate-500 mt-1">
          Đơn giá bình quân: {formatVnd(c.unitPrice)} / {unit}
          {c.vatPercent > 0 ? ' (đã gồm VAT)' : c.vatPercent === 0 ? ' (chưa gồm VAT)' : ''}.
        </p>
      </section>

      {notes && (
        <section className="rounded border border-slate-300 p-2.5">
          <span className="font-semibold">Ghi chú: </span>
          <span className="whitespace-pre-line">{notes}</span>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 border-t border-slate-300 pt-3 text-[11px]">
        <div>
          <h3 className="font-bold uppercase mb-1">Thông tin thanh toán</h3>
          {settings.bankName && <p>Ngân hàng: <strong>{settings.bankName}</strong></p>}
          {settings.bankAccount && <p>Tài khoản: <strong>{settings.bankAccount}</strong></p>}
          <p className="italic text-slate-500 mt-1">Nội dung CK: Tên KH + SĐT{code ? ` + ${code}` : ''}</p>
        </div>
        <div>
          <h3 className="font-bold uppercase mb-1">Điều khoản</h3>
          <p className="whitespace-pre-line text-slate-700">{settings.quoteFooterNote}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 pt-4 text-center">
        <div>
          <p className="font-bold uppercase">Xác nhận của khách hàng</p>
          <p className="italic text-slate-400 text-[11px]">(Ký, ghi rõ họ tên)</p>
          <div className="h-16" />
        </div>
        <div>
          <p className="font-bold uppercase">Đại diện {settings.companyName ? 'nhà in' : 'xưởng in'}</p>
          <p className="italic text-slate-400 text-[11px]">(Ký, đóng dấu)</p>
          <div className="h-16" />
        </div>
      </section>
    </div>
  );
}

function JobTicket({ spec, code, date, customer, notes }: QuoteDocumentProps) {
  const { input, result, paper } = spec;
  const q = result.quantities;
  const im = result.imposition;
  const unit = PRODUCT_UNITS[input.productType];

  return (
    <div className="space-y-3">
      <header className="flex justify-between items-start border-b-2 border-amber-500 pb-2">
        <div>
          <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-black rounded uppercase">Nội bộ xưởng</span>
          <h1 className="text-lg font-black uppercase mt-1">Lệnh sản xuất</h1>
          <p>
            Bài in: <strong>{input.jobName}</strong> · Khách: {customer.name || 'Khách vãng lai'} {customer.phone && `(${customer.phone})`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Mã lệnh</p>
          <p className="text-base font-black">{code ?? 'BẢN NHÁP'}</p>
          <p className="text-slate-500">{formatDateTime(date, false)}</p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-2">
        <Box label="Số lượng thành phẩm" value={`${formatNumber(input.quantity)} ${unit}`} />
        <Box label="Khổ thành phẩm" value={`${input.widthMm} × ${input.heightMm} mm`} />
        <Box label="Công nghệ" value={techText(spec)} />
        <Box label="Màu in" value={colorsText(spec)} />
      </div>

      <Stage title="Khâu 1 · Chuẩn bị & xả giấy">
        <Grid
          items={[
            ['Loại giấy', paper.name],
            ['Khổ giấy mẹ / phôi', im.parentSheet.name],
            ['Cách xả', im.cutScheme.cutDescription],
            ['Số tờ giấy mẹ', `${formatNumber(q.parentSheetsNeeded)} tờ (${formatNumber(q.ramsNeeded, true)} ram · ~${formatNumber(q.kgNeeded, true)} kg)`],
          ]}
        />
      </Stage>

      <Stage title={`Khâu 2 · In ${result.chosenTech === 'offset' ? 'offset' : 'nhanh'}`}>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <Grid
            items={[
              ['Máy in', result.printing.machineName],
              ['Khổ tờ in', `${im.printSheet.widthMm} × ${im.printSheet.heightMm} mm`],
              ['Bình trang', `${im.upsPerPrintSheet} con / tờ in${im.gapMm > 0 ? ` · cách con ${im.gapMm}mm` : ''}`],
              ...(result.chosenTech === 'offset'
                ? ([
                    ['Kiểu in', result.printing.workType ? WORK_TYPE_LABELS[result.printing.workType] : 'In 1 mặt'],
                    ['Kẽm CTP', `${result.printing.platesCount} lá · ${result.printing.passes} lần lên máy`],
                  ] as [string, string][])
                : []),
              ['Tờ in thực', `${formatNumber(q.netPrintSheets)} tờ`],
              ['Bù hao in / gia công', `${formatNumber(q.printWasteSheets)} / ${formatNumber(q.finishingWasteSheets)} tờ`],
              ['Tổng lượt in', `${formatNumber(q.impressions)} lượt`],
            ]}
          />
          <SheetDiagram spec={spec} />
        </div>
        <p className="mt-2 font-bold text-rose-700 border-t border-slate-200 pt-1.5">
          TỔNG TỜ IN GIAO THỢ MÁY: {formatNumber(q.totalPrintSheets)} tờ khổ {im.printSheet.widthMm}×{im.printSheet.heightMm} mm
        </p>
      </Stage>

      <Stage title="Khâu 3 · Gia công hoàn thiện">
        {result.costs.finishingDetails.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Công đoạn</th>
                <th className={head}>Nhóm</th>
                <th className={head}>Quy cách</th>
                <th className={head + ' w-28 text-center'}>Ký nhận</th>
              </tr>
            </thead>
            <tbody>
              {result.costs.finishingDetails.map((f) => (
                <tr key={f.serviceId}>
                  <td className={cell + ' font-semibold'}>{f.name}</td>
                  <td className={cell}>{FINISHING_CATEGORY_LABELS[f.category] ?? f.category}</td>
                  <td className={cell}>
                    {f.sides === 2 ? '2 mặt · ' : ''}
                    {formatNumber(f.quantity, true)} {f.unit}
                  </td>
                  <td className={cell} />
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="italic text-slate-500">Chỉ xén, đóng gói thành phẩm.</p>
        )}
      </Stage>

      {notes && (
        <p className="rounded border border-slate-300 p-2">
          <strong>Ghi chú: </strong>
          <span className="whitespace-pre-line">{notes}</span>
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 pt-3 text-center text-[11px] border-t border-slate-300">
        {['Ra kẽm / file', 'Thợ cắt giấy', 'Thợ máy in', 'Gia công / QC'].map((r) => (
          <div key={r}>
            <p className="font-bold">{r}</p>
            <div className="h-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-300 bg-slate-50 p-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function Stage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-300 p-2.5 break-inside-avoid">
      <h3 className="font-bold uppercase text-[11px] mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Grid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] text-slate-500">{k}</dt>
          <dd className="font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sơ đồ bình trang tĩnh (để in) */
function SheetDiagram({ spec }: { spec: OrderSpec }) {
  const im = spec.result.imposition;
  const W = im.printSheet.widthMm;
  const H = im.printSheet.heightMm;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-40 border border-slate-400" aria-hidden>
      <rect width={W} height={H} fill="#fff" />
      {im.gripperMarginMm > 3 && <rect x={0} y={H - im.gripperMarginMm} width={W} height={im.gripperMarginMm} fill="#fde68a" />}
      {im.boxes.map((b) => (
        <g key={b.index}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#dbeafe" stroke="#1e40af" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={Math.max(8, Math.min(b.w, b.h) * 0.3)} textAnchor="middle" dominantBaseline="central" fill="#1e3a8a">
            {b.index}
          </text>
        </g>
      ))}
    </svg>
  );
}
