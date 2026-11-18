'use client';

import React from 'react';
import type { CalculationResult, ChosenTech } from '@/types';
import { formatNumber, formatVnd, formatVndShort } from '@/lib/format';
import { cn } from './ui';

type Rec = CalculationResult['recommendation'];

const W = 420;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

export function BreakEvenChart({ recommendation, currentQty, chosenTech, unit }: { recommendation: Rec; currentQty: number; chosenTech: ChosenTech; unit: string }) {
  const rows = recommendation.comparisonTable;
  if (rows.length === 0) return <p className="text-sm text-slate-500">Không có dữ liệu so sánh.</p>;

  // Trục Y logarit theo đơn giá / sản phẩm
  const values = rows.flatMap((r) => [r.digitalUnit, r.offsetUnit]).filter((v): v is number => v !== null && v > 0);
  const minV = Math.max(1, Math.min(...values));
  const maxV = Math.max(...values, minV * 2);
  const lo = Math.log10(minV * 0.8);
  const hi = Math.log10(maxV * 1.2);
  const x = (i: number) => PAD.l + (rows.length === 1 ? 0.5 : i / (rows.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const ticks: number[] = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push(v);
    }
  }

  const path = (key: 'digitalUnit' | 'offsetUnit') => {
    let d = '';
    let pen = false;
    rows.forEach((r, i) => {
      const v = r[key];
      if (v === null || v <= 0) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const curIdx = rows.findIndex((r) => r.quantity === currentQty);

  return (
    <div className="space-y-3">
      {recommendation.breakEvenQty !== null ? (
        <p className="text-xs text-slate-600">
          Hoà vốn: từ <strong className="text-indigo-700">{formatNumber(recommendation.breakEvenQty)} {unit}</strong> trở lên, offset rẻ hơn.
        </p>
      ) : (
        <p className="text-xs text-slate-500">{recommendation.reason}</p>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Biểu đồ đơn giá theo số lượng">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t)} fontSize={9} textAnchor="end" dominantBaseline="central" fill="#64748b">
              {formatVndShort(t)}
            </text>
          </g>
        ))}
        {curIdx >= 0 && <line x1={x(curIdx)} x2={x(curIdx)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" />}
        <path d={path('digitalUnit')} fill="none" stroke="#0284c7" strokeWidth={2.2} />
        <path d={path('offsetUnit')} fill="none" stroke="#4f46e5" strokeWidth={2.2} />
        {rows.map((r, i) => (
          <g key={r.quantity}>
            {r.digitalUnit !== null && r.digitalUnit > 0 && <circle cx={x(i)} cy={y(r.digitalUnit)} r={i === curIdx ? 4 : 2.6} fill="#0284c7" />}
            {r.offsetUnit !== null && r.offsetUnit > 0 && <circle cx={x(i)} cy={y(r.offsetUnit)} r={i === curIdx ? 4 : 2.6} fill="#4f46e5" />}
            <text x={x(i)} y={H - PAD.b + 14} fontSize={9} textAnchor="middle" fill={i === curIdx ? '#0f172a' : '#64748b'} fontWeight={i === curIdx ? 700 : 400}>
              {r.quantity >= 1000 ? `${formatNumber(r.quantity / 1000, true)}k` : r.quantity}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-600 inline-block" /> In nhanh (đ/{unit})</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-600 inline-block" /> Offset (đ/{unit})</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="text-left py-1.5 font-semibold">Số lượng</th>
              <th className="text-right py-1.5 font-semibold">In nhanh</th>
              <th className="text-right py-1.5 font-semibold">Offset</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.quantity} className={cn('border-b border-slate-100', r.quantity === currentQty && 'bg-blue-50/60 font-semibold')}>
                <td className="py-1.5">
                  {formatNumber(r.quantity)}
                  {r.quantity === currentQty && <span className="ml-1 text-[10px] text-blue-600">(hiện tại · {chosenTech === 'offset' ? 'offset' : 'in nhanh'})</span>}
                </td>
                <Cell total={r.digitalTotal} unitPrice={r.digitalUnit} best={r.recommended === 'digital'} />
                <Cell total={r.offsetTotal} unitPrice={r.offsetUnit} best={r.recommended === 'offset'} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(recommendation.digitalError || recommendation.offsetError) && (
        <p className="text-[11px] text-slate-500">
          {recommendation.digitalError && <>In nhanh: {recommendation.digitalError} </>}
          {recommendation.offsetError && <>Offset: {recommendation.offsetError}</>}
        </p>
      )}
    </div>
  );
}

function Cell({ total, unitPrice, best }: { total: number | null; unitPrice: number | null; best: boolean }) {
  if (total === null) return <td className="py-1.5 text-right text-slate-300">—</td>;
  return (
    <td className={cn('py-1.5 text-right tabular-nums', best ? 'text-emerald-700 font-semibold' : 'text-slate-700')}>
      {formatVnd(total)}
      <span className="block text-[10px] text-slate-500 font-normal">{formatVnd(unitPrice)}/sp</span>
    </td>
  );
}
