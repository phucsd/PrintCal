'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import type { CalculationInput, CalculationResult } from '@/types';

/**
 * Tính giá tự động khi đầu vào thay đổi: trễ 350ms, huỷ request cũ (AbortController)
 * để kết quả cũ về muộn không ghi đè kết quả mới.
 */
export function useQuote(input: CalculationInput | null, delay = 350) {
  const key = useMemo(() => (input ? JSON.stringify(input) : null), [input]);
  const [state, setState] = useState<{ key: string | null; result: CalculationResult | null; error: string | null }>({
    key: null,
    result: null,
    error: null,
  });

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api<CalculationResult>('/api/calculate', { method: 'POST', body: JSON.parse(key), signal: ctrl.signal })
        .then((result) => setState({ key, result, error: null }))
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          setState((s) => ({ key, result: s.result, error: errorMessage(err) }));
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delay]);

  const upToDate = state.key === key;
  return {
    result: state.result,
    /** Lỗi của lần tính gần nhất (chỉ hiển thị khi khớp đầu vào hiện tại) */
    error: upToDate ? state.error : null,
    /** Kết quả đang hiển thị là của đầu vào hiện tại và không lỗi */
    fresh: upToDate && !state.error,
    calculating: key !== null && !upToDate,
  };
}
