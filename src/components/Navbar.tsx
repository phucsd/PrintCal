'use client';

import React, { useState } from 'react';
import { Calculator, ClipboardList, Cog, Layers, Printer, Scissors, SlidersHorizontal, Users, X } from 'lucide-react';
import { cn } from './ui';

export type ActiveTab = 'calculator' | 'orders' | 'papers' | 'machines' | 'finishing' | 'customers' | 'settings';

export const TABS: { id: ActiveTab; label: string; short: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'calculator', label: 'Tính giá', short: 'Tính giá', icon: Calculator },
  { id: 'orders', label: 'Đơn hàng', short: 'Đơn hàng', icon: ClipboardList },
  { id: 'papers', label: 'Kho giấy', short: 'Kho giấy', icon: Layers },
  { id: 'machines', label: 'Máy in', short: 'Máy in', icon: Printer },
  { id: 'finishing', label: 'Gia công', short: 'Gia công', icon: Scissors },
  { id: 'customers', label: 'Khách hàng', short: 'Khách', icon: Users },
  { id: 'settings', label: 'Cài đặt', short: 'Cài đặt', icon: Cog },
];

const PRIMARY_MOBILE_TABS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'calculator', label: 'Tính giá', icon: Calculator },
  { id: 'orders', label: 'Đơn hàng', icon: ClipboardList },
  { id: 'papers', label: 'Kho giấy', icon: Layers },
  { id: 'customers', label: 'Khách', icon: Users },
];

const MORE_MOBILE_TABS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'machines', label: 'Máy in & bảng giá', icon: Printer },
  { id: 'finishing', label: 'Gia công sau in', icon: Scissors },
  { id: 'settings', label: 'Cài đặt', icon: Cog },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const isMoreActive = MORE_MOBILE_TABS.some((t) => t.id === activeTab);

  const selectTab = (tab: ActiveTab) => {
    setMoreOpen(false);
    onChange(tab);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between md:justify-start gap-3 h-12 md:h-14">
          <button type="button" onClick={() => selectTab('calculator')} className="flex items-center gap-2 shrink-0">
            <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Printer className="w-4 h-4 md:w-4.5 md:h-4.5" />
            </span>
            <span className="text-left leading-tight">
              <span className="block font-bold text-slate-900 text-sm">PrintCal</span>
              {companyName ? <span className="hidden md:block text-[11px] text-slate-500 max-w-44 truncate">{companyName}</span> : null}
            </span>
          </button>

          {/* Tên phân hệ hiện tại trên Mobile */}
          <span className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
            <currentTab.icon className="w-3.5 h-3.5 text-blue-600" />
            {currentTab.label}
          </span>

          {/* Thanh tab ngang trên Desktop / Tablet */}
          <nav className="hidden md:flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Phân hệ">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
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

      {/* Menu phụ cho Danh mục trên Mobile */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end print:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setMoreOpen(false)} />
          <div className="relative bg-white rounded-t-2xl border-t border-slate-200 shadow-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] space-y-1">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Danh mục & cấu hình</span>
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {MORE_MOBILE_TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors',
                    active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar trên Mobile */}
      <nav
        aria-label="Điều hướng di động"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 safe-bottom print:hidden"
      >
        <div className="grid grid-cols-5 h-14">
          {PRIMARY_MOBILE_TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === activeTab && !moreOpen;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={t.id === activeTab ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {t.id === 'orders' && orderCount ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-4 text-center">
                      {orderCount > 99 ? '99+' : orderCount}
                    </span>
                  ) : null}
                </span>
                <span className="truncate max-w-full px-1">{t.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
              moreOpen || isMoreActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span>Danh mục</span>
          </button>
        </div>
      </nav>
    </>
  );
}
