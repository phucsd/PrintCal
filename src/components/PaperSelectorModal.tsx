'use client';

import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { PaperType } from '@/types';
import { formatVnd } from '@/lib/format';
import { Badge, Checkbox, Modal, Select, TextInput, cn } from './ui';

export const PAPER_GROUPS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'C', label: 'Couche' },
  { key: 'I', label: 'Ivory' },
  { key: 'F', label: 'Fort' },
  { key: 'B', label: 'Bristol' },
  { key: 'D', label: 'Duplex' },
  { key: 'other', label: 'Khác' },
];

export function paperGroup(p: Pick<PaperType, 'code'>): string {
  const c = p.code.trim().charAt(0).toUpperCase();
  return ['C', 'I', 'F', 'B', 'D'].includes(c) ? c : 'other';
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function PaperSelectorModal({
  open,
  onClose,
  papers,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  papers: PaperType[];
  selectedId?: number;
  onSelect: (paper: PaperType) => void;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [size, setSize] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const sizes = useMemo(
    () => [...new Set(papers.map((p) => `${p.parentWidthCm}x${p.parentHeightCm}`))].sort(),
    [papers]
  );

  const list = useMemo(() => {
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    return papers
      .filter((p) => showInactive || p.isActive)
      .filter((p) => group === 'all' || paperGroup(p) === group)
      .filter((p) => size === 'all' || `${p.parentWidthCm}x${p.parentHeightCm}` === size)
      .filter((p) => {
        if (terms.length === 0) return true;
        const hay = normalize(`${p.code} ${p.name} ${p.gsm}gsm ${p.supplier} ${p.description}`);
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => a.gsm - b.gsm || a.name.localeCompare(b.name, 'vi'));
  }, [papers, q, group, size, showInactive]);

  return (
    <Modal open={open} onClose={onClose} title="Chọn loại giấy" size="lg" bodyClassName="p-0">
      <div className="p-4 space-y-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, định lượng (VD: C150, 79x109)…" className="pl-8" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-1 overflow-x-auto no-scrollbar sm:flex-1">
            {PAPER_GROUPS.map((g) => {
              const active = group === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
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
          <Select value={size} onChange={(e) => setSize(e.target.value)} className="sm:w-36 py-1.5 text-xs">
            <option value="all">Mọi khổ mẹ</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s.replace('x', ' × ')} cm
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{list.length} loại giấy</span>
          <Checkbox checked={showInactive} onChange={setShowInactive} label={<span className="text-xs">Hiện giấy ngưng dùng</span>} />
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {list.length === 0 && <li className="p-8 text-center text-sm text-slate-500">Không tìm thấy loại giấy phù hợp.</li>}
        {list.map((p) => {
          const active = p.id === selectedId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className={cn('w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50/60 transition-colors', active && 'bg-blue-50')}
              >
                <span className={cn('w-5 h-5 rounded-full border flex items-center justify-center shrink-0', active ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300')}>
                  {active && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-slate-900 truncate">{p.name}</span>
                    {!p.isActive && <Badge tone="red">Ngưng</Badge>}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    <span className="font-mono">{p.code}</span> · {p.gsm}gsm · {p.parentWidthCm}×{p.parentHeightCm}cm · {p.supplier}
                  </span>
                </span>
                <span className="text-right text-xs shrink-0 tabular-nums">
                  <span className="block font-semibold text-slate-800">{formatVnd(p.priceAbove500)}</span>
                  <span className="block text-[10px] text-slate-500">/ram · {formatVnd(p.priceAbove500 / 500)}/tờ</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
