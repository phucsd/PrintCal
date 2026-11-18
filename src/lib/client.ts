'use client';

// =============================================================================
// Gọi API từ trình duyệt + hook tải dữ liệu
// =============================================================================

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  status: number;
  details?: string[];
  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** fetch JSON – ném ApiError kèm thông báo tiếng Việt từ server khi lỗi */
export async function api<T = unknown>(url: string, init: Omit<RequestInit, 'body'> & { body?: unknown } = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Không kết nối được máy chủ.', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; details?: string[] };
    throw new ApiError(d.error || `Lỗi ${res.status}`, res.status, d.details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Tải dữ liệu từ `url` (null = chưa tải). Trả về { data, error, loading, reload, setData }.
 * setState chỉ được gọi trong callback bất đồng bộ để tránh render dây chuyền.
 */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: string | null }>({
    key: null,
    data: undefined,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const key = url === null ? null : `${url}#${nonce}`;

  useEffect(() => {
    if (url === null || key === null) return;
    const ctrl = new AbortController();
    api<T>(url, { signal: ctrl.signal })
      .then((data) => setState({ key, data, error: null }))
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setState((s) => ({ key, data: s.data, error: errorMessage(err) }));
      });
    return () => ctrl.abort();
  }, [url, key]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return {
    data: state.data,
    error: state.error,
    loading: key !== null && state.key !== key,
    reload,
    setData,
  };
}

/** Giá trị trễ (debounce) – dùng cho ô tìm kiếm */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
