// =============================================================================
// Kiểm tra & chuẩn hoá dữ liệu đầu vào từ client (không dùng thư viện ngoài)
// =============================================================================

import type {
  CalculationInput,
  CreateOrderPayload,
  DigitalMaterial,
  DigitalMode,
  FinishingCalcType,
  FinishingCategory,
  OffsetWorkType,
  OrderStatus,
  PrintSides,
  PrintTech,
  ProductType,
  SelectedFinishing,
  SystemSetting,
} from '@/types';

export class ValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super(details.join(' '));
    this.name = 'ValidationError';
    this.details = details;
  }
}

type Obj = Record<string, unknown>;

interface NumOpts {
  min?: number;
  max?: number;
  int?: boolean;
  def?: number;
  required?: boolean;
}

/** Bộ thu thập lỗi – đọc từng trường, cuối cùng gọi done() */
export class Reader {
  private src: Obj;
  errors: string[] = [];

  constructor(raw: unknown) {
    this.src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Obj) : {};
    if (!raw || typeof raw !== 'object') this.errors.push('Dữ liệu gửi lên không hợp lệ.');
  }

  has(key: string) {
    return this.src[key] !== undefined && this.src[key] !== null;
  }

  raw(key: string) {
    return this.src[key];
  }

  num(key: string, label: string, opts: NumOpts = {}): number {
    const v = this.src[key];
    if (v === undefined || v === null || v === '') {
      if (opts.required) this.errors.push(`Thiếu ${label}.`);
      return opts.def ?? 0;
    }
    let n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
    if (!Number.isFinite(n)) {
      this.errors.push(`${label} phải là số.`);
      return opts.def ?? 0;
    }
    if (opts.int) n = Math.round(n);
    if (opts.min !== undefined && n < opts.min) this.errors.push(`${label} phải ≥ ${opts.min.toLocaleString('vi-VN')}.`);
    if (opts.max !== undefined && n > opts.max) this.errors.push(`${label} phải ≤ ${opts.max.toLocaleString('vi-VN')}.`);
    return n;
  }

  str(key: string, label: string, opts: { required?: boolean; max?: number; def?: string } = {}): string {
    const v = this.src[key];
    const s = v === undefined || v === null ? '' : String(v).trim();
    if (!s) {
      if (opts.required) this.errors.push(`Thiếu ${label}.`);
      return opts.def ?? '';
    }
    const max = opts.max ?? 500;
    if (s.length > max) this.errors.push(`${label} tối đa ${max} ký tự.`);
    return s;
  }

  bool(key: string, def = false): boolean {
    const v = this.src[key];
    if (v === undefined || v === null) return def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
  }

  oneOf<T extends string>(key: string, label: string, values: readonly T[], def: T): T {
    const v = this.src[key];
    if (v === undefined || v === null || v === '') return def;
    if (!values.includes(v as T)) {
      this.errors.push(`${label} không hợp lệ.`);
      return def;
    }
    return v as T;
  }

  done() {
    if (this.errors.length > 0) throw new ValidationError(this.errors);
  }
}

export function parseId(value: unknown, label = 'ID'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError([`${label} không hợp lệ.`]);
  return n;
}

// -----------------------------------------------------------------------------
// Đầu vào tính giá
// -----------------------------------------------------------------------------

export const PRODUCT_TYPES = ['to_roi', 'namecard', 'catalogue', 'hop_giay', 'tui_giay', 'decal', 'khac'] as const satisfies readonly ProductType[];
const PRINT_TECHS = ['auto', 'offset', 'digital'] as const satisfies readonly PrintTech[];
const SIDES = ['1_side', '2_side'] as const satisfies readonly PrintSides[];
const WORK_TYPES = ['self_turn', 'sheetwise', 'tumble'] as const satisfies readonly OffsetWorkType[];
const DIGITAL_MODES = ['with_paper', 'without_paper'] as const satisfies readonly DigitalMode[];
const MATERIALS = ['paper', 'decal', 'decal_clear', 'synthetic', 'pvc'] as const satisfies readonly DigitalMaterial[];

export function parseCalculationInput(raw: unknown): CalculationInput {
  const r = new Reader(raw);
  const printSides = r.oneOf('printSides', 'Số mặt in', SIDES, '2_side');

  const rawFinishing = r.raw('selectedFinishing');
  const selectedFinishing: SelectedFinishing[] = [];
  if (rawFinishing !== undefined && !Array.isArray(rawFinishing)) r.errors.push('Danh sách gia công không hợp lệ.');
  if (Array.isArray(rawFinishing)) {
    for (const item of rawFinishing) {
      const id = Number((item as Obj)?.serviceId);
      if (!Number.isInteger(id) || id <= 0) continue;
      selectedFinishing.push({ serviceId: id, sides: Number((item as Obj)?.sides) === 2 ? 2 : 1 });
    }
  }

  const material = r.raw('digitalMaterial');
  const input: CalculationInput = {
    jobName: r.str('jobName', 'Tên bài in', { max: 200, def: 'Bài in' }),
    productType: r.oneOf('productType', 'Loại sản phẩm', PRODUCT_TYPES, 'to_roi'),
    printTech: r.oneOf('printTech', 'Công nghệ in', PRINT_TECHS, 'auto'),
    quantity: r.num('quantity', 'Số lượng', { required: true, int: true, min: 1, max: 10_000_000 }),
    widthMm: r.num('widthMm', 'Chiều rộng', { required: true, min: 10, max: 2000 }),
    heightMm: r.num('heightMm', 'Chiều dài', { required: true, min: 10, max: 2000 }),
    pages: r.num('pages', 'Số trang', { int: true, min: 1, max: 2000, def: 2 }),
    bleedMm: r.num('bleedMm', 'Tràn lề', { min: 0, max: 10, def: 2 }),
    paperTypeId: r.num('paperTypeId', 'Loại giấy', { required: true, int: true, min: 1 }),
    printSides,
    colorsFront: r.num('colorsFront', 'Số màu mặt trước', { int: true, min: 1, max: 8, def: 4 }),
    colorsBack: printSides === '2_side' ? r.num('colorsBack', 'Số màu mặt sau', { int: true, min: 1, max: 8, def: 4 }) : 0,
    offsetWorkType: r.oneOf('offsetWorkType', 'Kiểu trở', WORK_TYPES, 'self_turn'),
    offsetMachineId: r.has('offsetMachineId') && Number(r.raw('offsetMachineId')) > 0 ? r.num('offsetMachineId', 'Máy offset', { int: true, min: 1 }) : undefined,
    digitalMode: r.oneOf('digitalMode', 'Chế độ in nhanh', DIGITAL_MODES, 'with_paper'),
    kemGiayCode: r.str('kemGiayCode', 'Mã giấy INTC', { max: 50 }) || undefined,
    digitalMaterial: material ? r.oneOf('digitalMaterial', 'Chất liệu in gia công', MATERIALS, 'paper') : undefined,
    customerSuppliedPaper: r.bool('customerSuppliedPaper'),
    whiteInk: r.bool('whiteInk'),
    selectedFinishing,
    profitMarginPercent: r.num('profitMarginPercent', 'Lợi nhuận', { min: 0, max: 1000, def: 0 }),
    discountAmount: r.num('discountAmount', 'Giảm giá', { min: 0, max: 1e12, def: 0 }),
    vatPercent: r.num('vatPercent', 'VAT', { min: 0, max: 100, def: 0 }),
  };
  r.done();
  return input;
}

// -----------------------------------------------------------------------------
// Danh mục
// -----------------------------------------------------------------------------

export function parsePaper(raw: unknown) {
  const r = new Reader(raw);
  const priceAbove500 = r.num('priceAbove500', 'Giá từ 500 tờ', { required: true, min: 0, max: 1e10 });
  const below = r.num('priceBelow500', 'Giá dưới 500 tờ', { min: 0, max: 1e10, def: 0 });
  const value = {
    code: r.str('code', 'Mã giấy', { required: true, max: 80 }),
    name: r.str('name', 'Tên giấy', { required: true, max: 200 }),
    gsm: r.num('gsm', 'Định lượng', { required: true, int: true, min: 20, max: 2000 }),
    parentWidthCm: r.num('parentWidthCm', 'Khổ mẹ (rộng)', { required: true, min: 10, max: 300 }),
    parentHeightCm: r.num('parentHeightCm', 'Khổ mẹ (dài)', { required: true, min: 10, max: 300 }),
    priceAbove500,
    priceBelow500: below > 0 ? below : priceAbove500,
    supplier: r.str('supplier', 'Nhà cung cấp', { max: 100, def: 'Thuận Phát' }),
    description: r.str('description', 'Mô tả', { max: 500 }),
    isActive: r.bool('isActive', true),
  };
  r.done();
  return value;
}

export function parseOffsetMachine(raw: unknown) {
  const r = new Reader(raw);
  const value = {
    name: r.str('name', 'Tên máy', { required: true, max: 200 }),
    maxWidthMm: r.num('maxWidthMm', 'Khổ in lớn nhất (rộng)', { required: true, min: 100, max: 3000 }),
    maxHeightMm: r.num('maxHeightMm', 'Khổ in lớn nhất (dài)', { required: true, min: 100, max: 3000 }),
    minWidthMm: r.num('minWidthMm', 'Khổ in nhỏ nhất (rộng)', { min: 0, max: 3000, def: 0 }),
    minHeightMm: r.num('minHeightMm', 'Khổ in nhỏ nhất (dài)', { min: 0, max: 3000, def: 0 }),
    platePrice: r.num('platePrice', 'Giá kẽm', { min: 0, max: 1e9 }),
    setupCost: r.num('setupCost', 'Giá mở máy', { required: true, min: 0, max: 1e10 }),
    stepCost: r.num('stepCost', 'Giá mỗi 1.000 lượt', { min: 0, max: 1e10 }),
    defaultWasteSheets: r.num('defaultWasteSheets', 'Bù hao', { int: true, min: 0, max: 10000 }),
    gripperMarginMm: r.num('gripperMarginMm', 'Lề nhíp', { min: 0, max: 50, def: 10 }),
    baseImpressions: r.num('baseImpressions', 'Số lượt trong gói', { int: true, min: 0, max: 1e7, def: 3000 }),
    includesPlate: r.bool('includesPlate', true),
  };
  if (Math.min(value.minWidthMm, value.minHeightMm) > Math.min(value.maxWidthMm, value.maxHeightMm) ||
      Math.max(value.minWidthMm, value.minHeightMm) > Math.max(value.maxWidthMm, value.maxHeightMm)) {
    r.errors.push('Khổ in nhỏ nhất không được lớn hơn khổ in lớn nhất.');
  }
  r.done();
  return value;
}

export function parseGiaCongRow(raw: unknown) {
  const r = new Reader(raw);
  const price = (k: string, label: string) => r.num(k, label, { min: 0, max: 1e8 });
  const value = {
    machineName: r.str('machineName', 'Tên máy', { required: true, max: 200 }),
    sheetSize: r.str('sheetSize', 'Tên khổ', { required: true, max: 50 }),
    widthMm: r.num('widthMm', 'Rộng', { required: true, min: 50, max: 3000 }),
    heightMm: r.num('heightMm', 'Dài', { required: true, min: 50, max: 3000 }),
    paperLt249: price('paperLt249', 'Giá giấy < 250gsm'),
    paper250To349: price('paper250To349', 'Giá giấy 250–349gsm'),
    paper350To450: price('paper350To450', 'Giá giấy 350–450gsm'),
    decalPaperPlastic: price('decalPaperPlastic', 'Giá decal'),
    decalClear: price('decalClear', 'Giá decal trong'),
    syntheticPaper: price('syntheticPaper', 'Giá giấy nhựa'),
    pvcPlastic: price('pvcPlastic', 'Giá PVC'),
  };
  r.done();
  return value;
}

export function parseKemGiayRow(raw: unknown) {
  const r = new Reader(raw);
  const value = {
    paperCode: r.str('paperCode', 'Mã giấy', { required: true, max: 50 }).toUpperCase(),
    paperName: r.str('paperName', 'Tên giấy', { required: true, max: 200 }),
    gsm: r.num('gsm', 'Định lượng', { required: true, int: true, min: 20, max: 2000 }),
    sheetSize: r.str('sheetSize', 'Khổ', { max: 50 }),
    widthMm: r.num('widthMm', 'Rộng', { required: true, min: 50, max: 2000 }),
    heightMm: r.num('heightMm', 'Dài', { required: true, min: 50, max: 2000 }),
    price1Side: r.num('price1Side', 'Giá 1 mặt', { required: true, min: 0, max: 1e8 }),
    price2Side: r.num('price2Side', 'Giá 2 mặt', { required: true, min: 0, max: 1e8 }),
  };
  if (!value.sheetSize) value.sheetSize = `${value.widthMm}x${value.heightMm}`;
  r.done();
  return value;
}

const CATEGORIES = ['can_mang', 'can_gap', 'be', 'ep_kim', 'phu_uv', 'dong_cuon', 'dan', 'khac'] as const satisfies readonly FinishingCategory[];
const CALC_TYPES = ['per_m2', 'per_sheet', 'per_product', 'fixed', 'die_cut'] as const satisfies readonly FinishingCalcType[];

export function parseFinishing(raw: unknown) {
  const r = new Reader(raw);
  const value = {
    code: r.str('code', 'Mã dịch vụ', { required: true, max: 80 }).toUpperCase().replace(/\s+/g, '_'),
    name: r.str('name', 'Tên dịch vụ', { required: true, max: 200 }),
    category: r.oneOf('category', 'Nhóm', CATEGORIES, 'khac'),
    calcType: r.oneOf('calcType', 'Cách tính', CALC_TYPES, 'per_product'),
    unitPrice: r.num('unitPrice', 'Đơn giá', { required: true, min: 0, max: 1e10 }),
    minPrice: r.num('minPrice', 'Giá tối thiểu', { min: 0, max: 1e10 }),
    setupFee: r.num('setupFee', 'Tiền khuôn', { min: 0, max: 1e10 }),
    wastePercent: r.num('wastePercent', '% bù hao', { min: 0, max: 100 }),
    wasteSheets: r.num('wasteSheets', 'Tờ bù hao', { int: true, min: 0, max: 100000 }),
    isActive: r.bool('isActive', true),
  };
  r.done();
  return value;
}

export function parseCustomer(raw: unknown) {
  const r = new Reader(raw);
  const value = {
    name: r.str('name', 'Tên khách hàng', { required: true, max: 200 }),
    phone: r.str('phone', 'Số điện thoại', { max: 30 }),
    email: r.str('email', 'Email', { max: 200 }),
    company: r.str('company', 'Công ty', { max: 200 }),
    address: r.str('address', 'Địa chỉ', { max: 500 }),
    notes: r.str('notes', 'Ghi chú', { max: 2000 }),
  };
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) r.errors.push('Email không hợp lệ.');
  r.done();
  return value;
}

export function parseSettings(raw: unknown): Partial<SystemSetting> {
  const r = new Reader(raw);
  const out: Partial<SystemSetting> = {};
  const textKeys = ['companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'bankAccount', 'bankName', 'quoteFooterNote'] as const;
  for (const k of textKeys) if (r.has(k)) out[k] = r.str(k, k, { max: k === 'quoteFooterNote' ? 4000 : 300 });
  if (r.has('defaultProfitMargin')) out.defaultProfitMargin = r.num('defaultProfitMargin', 'Lợi nhuận mặc định', { min: 0, max: 1000 });
  if (r.has('defaultVatPercent')) out.defaultVatPercent = r.num('defaultVatPercent', 'VAT mặc định', { min: 0, max: 100 });
  r.done();
  return out;
}

export const ORDER_STATUSES = ['quote', 'approved', 'printing', 'finishing', 'completed', 'delivered', 'cancelled'] as const satisfies readonly OrderStatus[];

export function parseOrderStatus(value: unknown): OrderStatus {
  if (!ORDER_STATUSES.includes(value as OrderStatus)) throw new ValidationError(['Trạng thái đơn hàng không hợp lệ.']);
  return value as OrderStatus;
}

export function parseCreateOrder(raw: unknown): CreateOrderPayload {
  const r = new Reader(raw);
  const input = parseCalculationInput(r.raw('input'));
  const c = new Reader(r.raw('customer') ?? {});
  const customer = {
    id: c.has('id') && Number(c.raw('id')) > 0 ? c.num('id', 'Mã khách hàng', { int: true, min: 1 }) : null,
    name: c.str('name', 'Tên khách hàng', { max: 200, def: 'Khách vãng lai' }),
    phone: c.str('phone', 'Số điện thoại', { max: 30 }),
    email: c.str('email', 'Email', { max: 200 }),
    company: c.str('company', 'Công ty', { max: 200 }),
  };
  const notes = r.str('notes', 'Ghi chú', { max: 2000 });
  r.errors.push(...c.errors);
  r.done();
  return { input, customer, notes };
}

export function parseOrderUpdate(raw: unknown) {
  const r = new Reader(raw);
  const value = {
    customerName: r.str('customerName', 'Tên khách hàng', { required: true, max: 200 }),
    customerPhone: r.str('customerPhone', 'Số điện thoại', { max: 30 }),
    customerEmail: r.str('customerEmail', 'Email', { max: 200 }),
    customerCompany: r.str('customerCompany', 'Công ty', { max: 200 }),
    jobName: r.str('jobName', 'Tên bài in', { required: true, max: 200 }),
    notes: r.str('notes', 'Ghi chú', { max: 2000 }),
    status: r.oneOf('status', 'Trạng thái', ORDER_STATUSES, 'quote'),
  };
  r.done();
  return value;
}
