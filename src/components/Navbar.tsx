'use client';

import React from 'react';
import { Calculator, ClipboardList, Cog, Layers, Printer, Scissors, Users } from 'lucide-react';
import { cn } from './ui';

export type ActiveTab = 'calculator' | 'orders' | 'papers' | 'machines' | 'finishing' | 'customers' | 'settings';

export const TABS: { id: ActiveTab; label: string; short: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'calculator', label: 'Tính giá', short: 'Tính giá', icon: Calculator },
  { id: 'orders', label: 'Đơn hàng & báo giá', short: 'Đơn hàng', icon: ClipboardList },
  { id: 'papers', label: 'Giá giấy', short: 'Giấy', icon: Layers },
  { id: 'machines', label: 'Máy in & bảng giá', short: 'Máy in', icon: Printer },
  { id: 'finishing', label: 'Gia công', short: 'Gia công', icon: Scissors },
  { id: 'customers', label: 'Khách hàng', short: 'Khách', icon: Users },
  { id: 'settings', label: 'Cài đặt', short: 'Cài đặt', icon: Cog },
];

export function Navbar({
  activeTab,
  onChange,
  orderCount,
  companyName,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  orderCount?: number;
  companyName?: string;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 h-14">
        <button type="button" onClick={() => onChange('calculator')} className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <Printer className="w-4.5 h-4.5" />
          </span>
          <span className="text-left leading-tight hidden sm:block">
            <span className="block font-bold text-slate-900 text-sm">PrintCal</span>
            <span className="block text-[11px] text-slate-500 max-w-44 truncate">{companyName || 'Tính giá in thông minh'}</span>
          </span>
        </button>

        <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Phân hệ">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden lg:inline">{t.label}</span>
                <span className="lg:hidden">{t.short}</span>
                {t.id === 'orders' && orderCount ? (
                  <span className="ml-0.5 min-w-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-5 text-center">
                    {orderCount > 999 ? '999+' : orderCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
