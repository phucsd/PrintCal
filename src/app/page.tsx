'use client';

import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { Navbar, TABS, type ActiveTab } from '@/components/Navbar';
import { ToastProvider, Alert, Button, LoadingBlock } from '@/components/ui';
import { CalculatorView } from '@/components/calculator/CalculatorView';
import { OrdersManager } from '@/components/OrdersManager';
import { PaperManager } from '@/components/PaperManager';
import { MachineManager } from '@/components/MachineManager';
import { FinishingManager } from '@/components/FinishingManager';
import { CustomerManager } from '@/components/CustomerManager';
import { SettingsManager } from '@/components/SettingsManager';
import { useApi } from '@/lib/client';
import type { LoadRequest, MasterData } from '@/components/calculator/types';

// Phân hệ đang mở được lưu trên URL (#orders, #papers…) để F5 / chia sẻ link vẫn giữ nguyên
function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
function readHashTab(): ActiveTab {
  const h = window.location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'calculator') as ActiveTab;
}

export default function HomePage() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}

function App() {
  const tab = useSyncExternalStore(subscribeHash, readHashTab, () => 'calculator' as ActiveTab);
  const [dataVersion, setDataVersion] = useState(0);
  const master = useApi<MasterData>(`/api/bootstrap?v=${dataVersion}`);
  const [load, setLoad] = useState<LoadRequest | null>(null);

  const changeTab = useCallback(
    (next: ActiveTab) => {
      if (next === tab) return;
      // Rời khỏi màn hình quản lý → nạp lại danh mục cho máy tính giá
      setDataVersion((v) => v + 1);
      window.location.hash = next === 'calculator' ? '' : next;
      if (next === 'calculator') history.replaceState(null, '', window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      window.scrollTo({ top: 0 });
    },
    [tab]
  );

  const openInCalculator = useCallback(
    (req: Omit<LoadRequest, 'nonce'>) => {
      setLoad({ ...req, nonce: Date.now() });
      changeTab('calculator');
    },
    [changeTab]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar activeTab={tab} onChange={changeTab} orderCount={master.data?.orderCount} companyName={master.data?.settings.companyName} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5 pb-20 md:pb-6">
        {!master.data ? (
          master.error ? (
            <Alert tone="error" title="Không tải được dữ liệu">
              <p>{master.error}</p>
              <Button size="sm" className="mt-2" onClick={master.reload}>
                Thử lại
              </Button>
            </Alert>
          ) : (
            <LoadingBlock text="Đang tải dữ liệu danh mục…" />
          )
        ) : (
          <>
            {/* Giữ máy tính luôn được mount để không mất dữ liệu đang nhập khi chuyển tab */}
            <div hidden={tab !== 'calculator'}>
              <CalculatorView
                key={load?.nonce ?? 0}
                master={master.data}
                initial={load?.form}
                sourceCode={load?.sourceCode}
                onOrderSaved={master.reload}
              />
            </div>
            {tab === 'orders' && (
              <OrdersManager
                master={master.data}
                onOpenInCalculator={openInCalculator}
                onChanged={master.reload}
              />
            )}
            {tab === 'papers' && <PaperManager />}
            {tab === 'machines' && <MachineManager />}
            {tab === 'finishing' && <FinishingManager />}
            {tab === 'customers' && <CustomerManager />}
            {tab === 'settings' && <SettingsManager />}
          </>
        )}
      </main>

      <footer className="hidden md:block text-center text-[11px] text-slate-400 py-4 print:hidden">
        PrintCal · Tính giá in offset & in nhanh
      </footer>
    </div>
  );
}
