'use client';

import React, { useId, useState } from 'react';
import { Printer, RotateCw, Scissors } from 'lucide-react';
import type { ImpositionResult } from '@/types';
import { formatNumber } from '@/lib/format';
import { Segmented } from './ui';

const BLOCK_COLORS = ['#dbeafe', '#dcfce7', '#fef9c3', '#f3e8ff', '#ffedd5', '#ccfbf1', '#ffe4e6', '#e0e7ff'];
const BLOCK_STROKES = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#f43f5e', '#6366f1'];

export function ImpositionVisualizer({
  imposition,
  productWidthMm,
  productHeightMm,
}: {
  imposition: ImpositionResult;
  productWidthMm: number;
  productHeightMm: number;
}) {
  const [view, setView] = useState<'sheet' | 'cut'>('sheet');
  const uid = useId().replace(/:/g, '');
  const im = imposition;
  const W = im.printSheet.widthMm;
  const H = im.printSheet.heightMm;
  const scheme = im.cutScheme;

  return (
    <div className="space-y-3">
      <Segmented
        size="sm"
        value={view}
        onChange={setView}
        options={[
          { value: 'sheet', label: <span className="inline-flex items-center gap-1"><Printer className="w-3 h-3" />Bình trang tờ in</span> },
          {
            value: 'cut',
            label: (
              <span className="inline-flex items-center gap-1">
                <Scissors className="w-3 h-3" />
                {scheme.preCut ? 'Phôi in' : `Xả giấy mẹ (chia ${scheme.cutsCount})`}
              </span>
            ),
          },
        ]}
      />

      {view === 'sheet' ? (
        <figure className="space-y-2">
          <div className="bg-slate-900 rounded-xl p-3 flex items-center justify-center">
            <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="w-full max-h-72" role="img" aria-label={`Bình ${im.upsPerPrintSheet} con trên tờ in ${W}×${H} mm`}>
              <defs>
                <pattern id={`grip-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#fde68a" />
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="4" />
                </pattern>
              </defs>
              <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {im.gripperMarginMm > 3 && (
                <g>
                  <rect x={0} y={H - im.gripperMarginMm} width={W} height={im.gripperMarginMm} fill={`url(#grip-${uid})`} opacity={0.85} />
                  <text x={W / 2} y={H - im.gripperMarginMm / 2} fontSize={Math.max(6, im.gripperMarginMm * 0.7)} textAnchor="middle" dominantBaseline="central" fill="#92400e" fontWeight={700}>
                    NHÍP {im.gripperMarginMm}mm
                  </text>
                </g>
              )}
              <rect
                x={im.sideMarginMm}
                y={im.tailMarginMm}
                width={W - im.sideMarginMm * 2}
                height={H - im.tailMarginMm - im.gripperMarginMm}
                fill="none"
                stroke="#cbd5e1"
                strokeDasharray="4 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {im.boxes.map((b) => {
                const font = Math.max(6, Math.min(b.w, b.h) * 0.28);
                return (
                  <g key={b.index}>
                    {im.bleedMm > 0 && (
                      <rect x={b.x - im.bleedMm} y={b.y - im.bleedMm} width={b.w + im.bleedMm * 2} height={b.h + im.bleedMm * 2} fill="#fecdd3" opacity={0.7} />
                    )}
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.isRotated ? '#e0e7ff' : '#dbeafe'} stroke="#2563eb" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={font} textAnchor="middle" dominantBaseline="central" fill="#1e3a8a" fontWeight={700}>
                      {b.index}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <Legend color="#dbeafe" border="#2563eb">{productWidthMm}×{productHeightMm}mm</Legend>
            {im.boxes.some((b) => b.isRotated) && (
              <Legend color="#e0e7ff" border="#2563eb">
                <RotateCw className="w-3 h-3 inline" /> Xoay 90°
              </Legend>
            )}
            {im.bleedMm > 0 && <Legend color="#fecdd3">Tràn {im.bleedMm}mm</Legend>}
            {im.gripperMarginMm > 3 && <Legend color="#fde68a">Nhíp</Legend>}
            <span>{im.gapMm > 0 ? `Cách ${im.gapMm}mm` : 'Xén chung'}</span>
          </figcaption>
        </figure>
      ) : (
        <figure className="space-y-2">
          <div className="bg-slate-900 rounded-xl p-3 flex items-center justify-center">
            <svg
              viewBox={`-6 -6 ${scheme.parentWidthMm + 12} ${scheme.parentHeightMm + 12}`}
              className="w-full max-h-72"
              role="img"
              aria-label={scheme.cutDescription}
            >
              <defs>
                <pattern id={`waste-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="10" height="10" fill="#f1f5f9" />
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#cbd5e1" strokeWidth="3" />
                </pattern>
              </defs>
              <rect x={0} y={0} width={scheme.parentWidthMm} height={scheme.parentHeightMm} fill={`url(#waste-${uid})`} stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {scheme.blocks.map((b, i) => (
                <g key={b.index}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill={BLOCK_COLORS[i % BLOCK_COLORS.length]}
                    stroke={BLOCK_STROKES[i % BLOCK_STROKES.length]}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2}
                    fontSize={Math.max(10, Math.min(b.w, b.h) * 0.18)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#0f172a"
                    fontWeight={700}
                  >
                    #{b.index}
                  </text>
                </g>
              ))}
              {scheme.cutLines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#e11d48" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          </div>
          <figcaption className="text-[11px] text-slate-600">{scheme.cutDescription}</figcaption>
        </figure>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Info label="Con / tờ in" value={`${im.upsPerPrintSheet}`} />
        <Info label={scheme.preCut ? 'Phôi' : 'Tờ in / tờ mẹ'} value={scheme.preCut ? 'Cắt sẵn' : `${im.cutsPerParentSheet}`} />
        <Info label="Con / tờ mẹ" value={`${im.totalUpsPerParentSheet}`} />
        <Info label="Tận dụng tờ in" value={`${formatNumber(im.sheetEfficiencyPercent, true)}%`} />
      </dl>
    </div>
  );
}

function Legend({ color, border, children }: { color: string; border?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, border: border ? `1px solid ${border}` : undefined }} />
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-900 tabular-nums">{value}</dd>
    </div>
  );
}
