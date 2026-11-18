// Định dạng hiển thị (dùng được cả server & client)

const nf = new Intl.NumberFormat('vi-VN');
const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function formatNumber(n: number | null | undefined, fractional = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return fractional ? nf1.format(n) : nf.format(Math.round(n));
}

/** 1234567 → "1.234.567đ" */
export function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${nf.format(Math.round(n))}đ`;
}

/** Rút gọn: 1.250.000 → "1,25tr", 850.000 → "850k" */
export function formatVndShort(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${nf1.format(n / 1e9)} tỷ`;
  if (abs >= 1e6) return `${nf1.format(n / 1e6)}tr`;
  if (abs >= 1e3) return `${nf.format(Math.round(n / 1e3))}k`;
  return nf.format(Math.round(n));
}

/** Chuỗi thời gian SQLite (UTC "YYYY-MM-DD HH:MM:SS") → giờ Việt Nam */
export function formatDateTime(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}
