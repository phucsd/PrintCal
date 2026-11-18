'use client';

// =============================================================================
// Cài đặt hệ thống: thông tin công ty, ngân hàng, mặc định báo giá
// =============================================================================

import React, { useState } from 'react';
import { Building2, Eye, Landmark, Percent, RotateCcw, Save, Settings } from 'lucide-react';
import type { SystemSetting } from '@/types';
import { ApiError, api, errorMessage, useApi } from '@/lib/client';
import { formatNumber } from '@/lib/format';
import { Alert, Button, Card, Field, LoadingBlock, NumberInput, PageHeader, TextInput, Textarea, useToast } from '@/components/ui';

type TextKey = 'companyName' | 'companyAddress' | 'companyPhone' | 'companyEmail' | 'bankName' | 'bankAccount' | 'quoteFooterNote';

const KEYS: (keyof SystemSetting)[] = [
  'companyName',
  'companyAddress',
  'companyPhone',
  'companyEmail',
  'bankName',
  'bankAccount',
  'quoteFooterNote',
  'defaultProfitMargin',
  'defaultVatPercent',
];

function isDirty(a: SystemSetting, b: SystemSetting) {
  return KEYS.some((k) => {
    const x = a[k];
    const y = b[k];
    return typeof x === 'string' && typeof y === 'string' ? x.trim() !== y.trim() : x !== y;
  });
}

function normalize(s: SystemSetting): SystemSetting {
  return {
    companyName: s.companyName.trim(),
    companyAddress: s.companyAddress.trim(),
    companyPhone: s.companyPhone.trim(),
    companyEmail: s.companyEmail.trim(),
    bankName: s.bankName.trim(),
    bankAccount: s.bankAccount.trim(),
    quoteFooterNote: s.quoteFooterNote.trim(),
    defaultProfitMargin: s.defaultProfitMargin,
    defaultVatPercent: s.defaultVatPercent,
  };
}

/** Bổ sung giá trị mặc định nếu server trả thiếu trường */
function withDefaults(s: Partial<SystemSetting> | undefined): SystemSetting {
  return {
    companyName: s?.companyName ?? '',
    companyAddress: s?.companyAddress ?? '',
    companyPhone: s?.companyPhone ?? '',
    companyEmail: s?.companyEmail ?? '',
    bankName: s?.bankName ?? '',
    bankAccount: s?.bankAccount ?? '',
    quoteFooterNote: s?.quoteFooterNote ?? '',
    defaultProfitMargin: Number.isFinite(s?.defaultProfitMargin) ? Number(s?.defaultProfitMargin) : 0,
    defaultVatPercent: Number.isFinite(s?.defaultVatPercent) ? Number(s?.defaultVatPercent) : 0,
  };
}

// -----------------------------------------------------------------------------
// Xem trước báo giá
// -----------------------------------------------------------------------------

function QuotePreview({ s }: { s: SystemSetting }) {
  const contact = [s.companyPhone && `ĐT: ${s.companyPhone}`, s.companyEmail && `Email: ${s.companyEmail}`].filter(Boolean).join(' · ');
  const bank = [s.bankAccount && `STK: ${s.bankAccount}`, s.bankName].filter(Boolean).join(' – ');
  return (
    <Card title="Xem trước báo giá" icon={<Eye className="w-4 h-4 text-blue-600" />} bodyClassName="p-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden text-slate-800">
        <div className="px-4 py-3 border-b-2 border-blue-600">
          <p className="font-bold text-blue-800 uppercase text-sm leading-snug">{s.companyName || 'Tên công ty'}</p>
          {s.companyAddress && <p className="text-[11px] text-slate-600 mt-0.5">{s.companyAddress}</p>}
          {contact && <p className="text-[11px] text-slate-600">{contact}</p>}
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-center font-bold text-sm tracking-wide">BẢNG BÁO GIÁ</p>
          <div className="space-y-1.5" aria-hidden>
            <div className="h-2 rounded bg-slate-100 w-3/4" />
            <div className="h-2 rounded bg-slate-100 w-full" />
            <div className="h-2 rounded bg-slate-100 w-5/6" />
          </div>
          <div className="flex justify-between text-[11px] pt-1 text-slate-500">
            <span>Lợi nhuận mặc định: {formatNumber(s.defaultProfitMargin, true)}%</span>
            <span>VAT: {formatNumber(s.defaultVatPercent, true)}%</span>
          </div>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
          {bank ? (
            <p>
              <span className="font-semibold text-slate-700">Chuyển khoản:</span> {bank}
            </p>
          ) : (
            <p className="text-slate-400 italic">Chưa có thông tin ngân hàng</p>
          )}
          {s.quoteFooterNote ? (
            <p className="whitespace-pre-line leading-relaxed">{s.quoteFooterNote}</p>
          ) : (
            <p className="text-slate-400 italic">Chưa có ghi chú cuối báo giá</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Form (khởi tạo từ dữ liệu đã tải – không setState trong effect)
// -----------------------------------------------------------------------------

function SettingsForm({ initial, onSaved }: { initial: SystemSetting; onSaved: (s: SystemSetting) => void }) {
  const toast = useToast();
  const [saved, setSaved] = useState<SystemSetting>(initial);
  const [form, setForm] = useState<SystemSetting>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const dirty = isDirty(form, saved);
  const setText = (key: TextKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const emailInvalid = form.companyEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.companyEmail.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setErrors([]);
    try {
      const updated = withDefaults(await api<SystemSetting>('/api/settings', { method: 'PUT', body: normalize(form) }));
      setSaved(updated);
      setForm(updated);
      onSaved(updated);
      toast.success('Đã lưu cài đặt.');
    } catch (err) {
      const list = err instanceof ApiError && err.details && err.details.length > 0 ? err.details : [errorMessage(err)];
      setErrors(list);
      toast.error('Không lưu được cài đặt.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(saved);
    setErrors([]);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {errors.length > 0 && (
          <Alert tone="error" title="Không lưu được cài đặt">
            <ul className="list-disc pl-4">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card title="Thông tin công ty" icon={<Building2 className="w-4 h-4 text-blue-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tên công ty / cửa hàng" htmlFor="set-name" className="sm:col-span-2">
              <TextInput id="set-name" value={form.companyName} maxLength={300} onChange={setText('companyName')} placeholder="VD: Công ty TNHH In Ấn ABC" />
            </Field>
            <Field label="Địa chỉ" htmlFor="set-address" className="sm:col-span-2">
              <TextInput id="set-address" value={form.companyAddress} maxLength={300} onChange={setText('companyAddress')} placeholder="Số nhà, đường, quận, thành phố" />
            </Field>
            <Field label="Số điện thoại" htmlFor="set-phone">
              <TextInput id="set-phone" type="tel" value={form.companyPhone} maxLength={300} onChange={setText('companyPhone')} placeholder="028 1234 5678" />
            </Field>
            <Field label="Email" htmlFor="set-email" error={emailInvalid ? 'Email có vẻ chưa đúng định dạng.' : null}>
              <TextInput id="set-email" type="email" value={form.companyEmail} maxLength={300} onChange={setText('companyEmail')} placeholder="baogia@congty.vn" />
            </Field>
          </div>
        </Card>

        <Card title="Thanh toán & ghi chú báo giá" icon={<Landmark className="w-4 h-4 text-blue-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Ngân hàng" htmlFor="set-bank">
              <TextInput id="set-bank" value={form.bankName} maxLength={300} onChange={setText('bankName')} placeholder="VD: Vietcombank – CN TP.HCM" />
            </Field>
            <Field label="Số tài khoản" htmlFor="set-account">
              <TextInput id="set-account" value={form.bankAccount} maxLength={300} onChange={setText('bankAccount')} placeholder="VD: 0123456789 – NGUYEN VAN A" />
            </Field>
            <Field
              label="Ghi chú cuối báo giá"
              htmlFor="set-footer"
              className="sm:col-span-2"
              hint={`Mỗi dòng sẽ hiển thị thành một dòng trên báo giá · ${formatNumber(form.quoteFooterNote.length)}/4.000 ký tự`}
            >
              <Textarea
                id="set-footer"
                rows={5}
                value={form.quoteFooterNote}
                maxLength={4000}
                onChange={setText('quoteFooterNote')}
                placeholder={'VD:\n- Báo giá có hiệu lực 7 ngày.\n- Đặt cọc 50% khi duyệt mẫu.\n- Thời gian giao hàng 3–5 ngày làm việc.'}
              />
            </Field>
          </div>
        </Card>

        <Card title="Mặc định khi tính giá" icon={<Percent className="w-4 h-4 text-blue-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Lợi nhuận mặc định" htmlFor="set-margin" hint="Cộng trên tổng giá vốn. Có thể đặt 0%.">
              <NumberInput
                id="set-margin"
                value={form.defaultProfitMargin}
                onChange={(n) => setForm((f) => ({ ...f, defaultProfitMargin: n }))}
                min={0}
                max={1000}
                step={1}
                suffix="%"
              />
            </Field>
            <Field label="VAT mặc định" htmlFor="set-vat" hint="Đặt 0% nếu không xuất hoá đơn VAT.">
              <NumberInput
                id="set-vat"
                value={form.defaultVatPercent}
                onChange={(n) => setForm((f) => ({ ...f, defaultVatPercent: n }))}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
            </Field>
          </div>
        </Card>

        <div className="sticky bottom-3 z-10">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
            <p className="mr-auto text-xs text-slate-500">{dirty ? 'Có thay đổi chưa lưu.' : 'Mọi thay đổi đã được lưu.'}</p>
            <Button icon={<RotateCcw className="w-4 h-4" />} onClick={reset} disabled={!dirty || saving}>
              Hoàn tác
            </Button>
            <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />} loading={saving} disabled={!dirty}>
              Lưu cài đặt
            </Button>
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 min-w-0">
        <QuotePreview s={form} />
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Trang chính
// -----------------------------------------------------------------------------

export function SettingsManager() {
  const { data, error, loading, reload, setData } = useApi<SystemSetting>('/api/settings');

  return (
    <div className="space-y-4">
      <PageHeader title="Cài đặt" description="Thông tin hiển thị trên báo giá và các giá trị mặc định khi tính giá." />

      {error && (
        <Alert tone="error" title="Không tải được cài đặt">
          {error}{' '}
          <button type="button" className="underline font-medium" onClick={reload}>
            Thử lại
          </button>
        </Alert>
      )}

      {data ? (
        // Form giữ state riêng, khởi tạo một lần từ dữ liệu đã tải
        <SettingsForm initial={withDefaults(data)} onSaved={(s) => setData(() => s)} />
      ) : loading ? (
        <Card>
          <LoadingBlock text="Đang tải cài đặt…" />
        </Card>
      ) : (
        !error && (
          <Card>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Settings className="w-4 h-4" /> Chưa có dữ liệu cài đặt.
            </div>
          </Card>
        )
      )}
    </div>
  );
}
