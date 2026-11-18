'use client';

// =============================================================================
// Bộ thành phần giao diện dùng chung (Tailwind v4)
// =============================================================================

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// -----------------------------------------------------------------------------
// Bố cục
// -----------------------------------------------------------------------------

export function Card({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('bg-white rounded-2xl border border-slate-200 shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{title}</h1>
        {description && <p className="text-xs text-slate-500 mt-0.5 truncate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Nút
// -----------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
  ghost: 'text-slate-600 hover:bg-slate-100',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
        size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3.5 py-2',
        buttonStyles[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  tone = 'default',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'p-2 sm:p-1.5 rounded-lg transition-colors disabled:opacity-40',
        tone === 'danger' ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Ô nhập liệu
// -----------------------------------------------------------------------------

const inputBase =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 sm:py-1.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600 mb-1">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-rose-600 mt-1">{error}</p> : hint ? <p className="text-[11px] text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
});

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-20', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * Ô nhập số: cho phép xoá trắng / gõ dở mà không bị nhảy giá trị.
 * Khi rời ô, giá trị được kẹp trong [min, max].
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  className,
  inputClassName,
  id,
  disabled,
  placeholder,
  allowDecimal = true,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  allowDecimal?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        disabled={disabled}
        placeholder={placeholder}
        value={draft ?? (Number.isFinite(value) ? String(value) : '')}
        onFocus={(e) => {
          setDraft(Number.isFinite(value) ? String(value) : '');
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const s = e.target.value;
          if (!/^-?[\d\s]*[.,]?\d*$/.test(s)) return;
          setDraft(s);
          const n = parse(s);
          if (s.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
            onChange(allowDecimal ? n : Math.round(n));
          }
        }}
        onBlur={() => {
          const n = parse(draft ?? '');
          if (draft !== null && draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(allowDecimal ? n : Math.round(n)));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (step ?? 1) * (e.key === 'ArrowUp' ? 1 : -1);
            const next = clamp((Number.isFinite(value) ? value : 0) + delta);
            onChange(next);
            setDraft(String(next));
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(inputBase, 'tabular-nums', suffix && 'pr-10', inputClassName)}
      />
      {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-start gap-2 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-700">
        {label}
        {description && <span className="block text-xs text-slate-400">{description}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex w-full gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md font-medium transition-all whitespace-nowrap',
            size === 'sm' ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1.5',
            o.value === value ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hiển thị
// -----------------------------------------------------------------------------

type Tone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'sky' | 'teal';
const badgeTones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap', badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('w-5 h-5 animate-spin text-blue-500', className)} />;
}

export function LoadingBlock({ text = 'Đang tải…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="mx-auto mb-3 w-10 h-10 text-slate-300 flex items-center justify-center">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: ['bg-blue-50 border-blue-200 text-blue-900', Info],
    warning: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle],
    error: ['bg-rose-50 border-rose-200 text-rose-900', XCircle],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2],
  } as const;
  const [cls, Icon] = styles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-2 rounded-xl border p-3 text-sm', cls, className)}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  bodyClassName?: string;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 print:hidden">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cn('relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh]', widths[size])}>
        {title && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 truncate">{title}</h3>
            <IconButton label="Đóng" onClick={onClose}>
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        )}
        <div className={cn('flex-1 overflow-y-auto p-4 sm:p-5', bodyClassName)}>{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-4 py-3 sm:px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3 border-t border-slate-100 bg-slate-50/80 sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// -----------------------------------------------------------------------------
// Thông báo nổi (toast)
// -----------------------------------------------------------------------------

type ToastItem = { id: number; tone: 'success' | 'error' | 'info'; message: string };
const ToastContext = createContext<{ show: (tone: ToastItem['tone'], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = ++counter.current;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 z-[70] flex flex-col gap-2 sm:max-w-sm pointer-events-none print:hidden" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg border bg-white',
              t.tone === 'success' && 'border-emerald-200 text-emerald-900',
              t.tone === 'error' && 'border-rose-200 text-rose-900',
              t.tone === 'info' && 'border-blue-200 text-blue-900'
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            ) : t.tone === 'error' ? (
              <XCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return {
    success: (m: string) => ctx?.show('success', m),
    error: (m: string) => ctx?.show('error', m),
    info: (m: string) => ctx?.show('info', m),
  };
}

// -----------------------------------------------------------------------------
// Bảng
// -----------------------------------------------------------------------------

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm text-left">{children}</table>
    </div>
  );
}

export const th = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 whitespace-nowrap';
export const td = 'px-3 py-2.5 border-b border-slate-100 align-middle';
