// =============================================================================
// Truy cập dữ liệu: ánh xạ hàng SQLite ↔ kiểu TypeScript và các thao tác CRUD
// =============================================================================

import { getDb, transaction } from './db.ts';
import type {
  Customer,
  DigitalPrintGiaCong,
  DigitalPrintKemGiay,
  FinishingService,
  OffsetMachine,
  OrderSpec,
  OrderStatus,
  PaperType,
  QuoteOrder,
  SystemSetting,
} from '@/types';
import type {
  parseCustomer,
  parseFinishing,
  parseGiaCongRow,
  parseKemGiayRow,
  parseOffsetMachine,
  parseOrderUpdate,
  parsePaper,
} from './validation';

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

function requireChange(changes: number | bigint, what: string) {
  if (Number(changes) === 0) throw new NotFoundError(`Không tìm thấy ${what}.`);
}

// -----------------------------------------------------------------------------
// Giấy
// -----------------------------------------------------------------------------

export function mapPaper(r: Row): PaperType {
  const above = n(r.price_above_500) || n(r.price_per_ram);
  return {
    id: n(r.id),
    code: s(r.code),
    name: s(r.name),
    gsm: n(r.gsm),
    parentWidthCm: n(r.parent_width_cm),
    parentHeightCm: n(r.parent_height_cm),
    priceAbove500: above,
    priceBelow500: n(r.price_below_500) || above,
    supplier: s(r.supplier) || 'Thuận Phát',
    description: s(r.description),
    isActive: n(r.is_active) !== 0,
  };
}

export const papers = {
  list(filter: { q?: string; supplier?: string; activeOnly?: boolean } = {}): PaperType[] {
    let sql = 'SELECT * FROM paper_types WHERE 1=1';
    const params: (string | number)[] = [];
    if (filter.activeOnly) sql += ' AND is_active = 1';
    if (filter.supplier && filter.supplier !== 'all') {
      sql += ' AND supplier = ?';
      params.push(filter.supplier);
    }
    if (filter.q) {
      sql += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
      const t = `%${filter.q}%`;
      params.push(t, t, t);
    }
    sql += ' ORDER BY is_active DESC, substr(code, 1, 1), gsm, parent_width_cm, name';
    return (getDb().prepare(sql).all(...params) as Row[]).map(mapPaper);
  },
  get(id: number): PaperType | null {
    const r = getDb().prepare('SELECT * FROM paper_types WHERE id = ?').get(id) as Row | undefined;
    return r ? mapPaper(r) : null;
  },
  create(p: ReturnType<typeof parsePaper>): number {
    const res = getDb()
      .prepare(
        `INSERT INTO paper_types (code, name, gsm, parent_width_cm, parent_height_cm, price_above_500, price_below_500, price_per_ram,
           price_per_kg, supplier, unit, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ram', ?, ?)`
      )
      .run(p.code, p.name, p.gsm, p.parentWidthCm, p.parentHeightCm, p.priceAbove500, p.priceBelow500, p.priceAbove500, p.supplier, p.description, p.isActive ? 1 : 0);
    return Number(res.lastInsertRowid);
  },
  update(id: number, p: ReturnType<typeof parsePaper>) {
    const res = getDb()
      .prepare(
        `UPDATE paper_types SET code = ?, name = ?, gsm = ?, parent_width_cm = ?, parent_height_cm = ?, price_above_500 = ?,
           price_below_500 = ?, price_per_ram = ?, supplier = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(p.code, p.name, p.gsm, p.parentWidthCm, p.parentHeightCm, p.priceAbove500, p.priceBelow500, p.priceAbove500, p.supplier, p.description, p.isActive ? 1 : 0, id);
    requireChange(res.changes, 'loại giấy');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM paper_types WHERE id = ?').run(id).changes, 'loại giấy');
  },
  suppliers(): string[] {
    return (getDb().prepare('SELECT DISTINCT supplier FROM paper_types ORDER BY supplier').all() as Row[]).map((r) => s(r.supplier));
  },
};

// -----------------------------------------------------------------------------
// Máy offset & bảng giá in nhanh
// -----------------------------------------------------------------------------

export function mapOffsetMachine(r: Row): OffsetMachine {
  return {
    id: n(r.id),
    name: s(r.name),
    maxWidthMm: n(r.max_width_mm),
    maxHeightMm: n(r.max_height_mm),
    minWidthMm: n(r.min_width_mm),
    minHeightMm: n(r.min_height_mm),
    platePrice: n(r.plate_price),
    setupCost: n(r.setup_cost),
    stepCost: n(r.step_cost),
    defaultWasteSheets: n(r.default_waste_sheets),
    gripperMarginMm: r.gripper_margin_mm === null || r.gripper_margin_mm === undefined ? 10 : n(r.gripper_margin_mm),
    baseImpressions: r.base_impressions === null || r.base_impressions === undefined ? 3000 : n(r.base_impressions),
    includesPlate: n(r.includes_plate ?? 1) !== 0,
  };
}

export function mapGiaCong(r: Row): DigitalPrintGiaCong {
  return {
    id: n(r.id),
    machineName: s(r.machine_name),
    sheetSize: s(r.sheet_size),
    widthMm: n(r.width_mm),
    heightMm: n(r.height_mm),
    paperLt249: n(r.paper_lt_249),
    paper250To349: n(r.paper_250_349),
    paper350To450: n(r.paper_350_450),
    decalPaperPlastic: n(r.decal_paper_plastic),
    decalClear: n(r.decal_clear),
    syntheticPaper: n(r.synthetic_paper),
    pvcPlastic: n(r.pvc_plastic),
  };
}

export function mapKemGiay(r: Row): DigitalPrintKemGiay {
  return {
    id: n(r.id),
    paperCode: s(r.paper_code),
    paperName: s(r.paper_name),
    gsm: n(r.gsm),
    sheetSize: s(r.sheet_size),
    widthMm: n(r.width_mm),
    heightMm: n(r.height_mm),
    price1Side: n(r.price_1side),
    price2Side: n(r.price_2side),
  };
}

type OffsetInput = ReturnType<typeof parseOffsetMachine>;
const offsetParams = (m: OffsetInput) => [
  m.name, m.maxWidthMm, m.maxHeightMm, m.minWidthMm, m.minHeightMm, m.platePrice, m.setupCost, m.stepCost,
  m.defaultWasteSheets, m.gripperMarginMm, m.baseImpressions, m.includesPlate ? 1 : 0,
];

export const offsetMachines = {
  list(): OffsetMachine[] {
    return (getDb().prepare('SELECT * FROM offset_machines ORDER BY max_width_mm * max_height_mm, id').all() as Row[]).map(mapOffsetMachine);
  },
  create(m: OffsetInput): number {
    const res = getDb()
      .prepare(
        `INSERT INTO offset_machines (name, max_width_mm, max_height_mm, min_width_mm, min_height_mm, plate_price, setup_cost, step_cost,
           default_waste_sheets, gripper_margin_mm, base_impressions, includes_plate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...offsetParams(m));
    return Number(res.lastInsertRowid);
  },
  update(id: number, m: OffsetInput) {
    const res = getDb()
      .prepare(
        `UPDATE offset_machines SET name = ?, max_width_mm = ?, max_height_mm = ?, min_width_mm = ?, min_height_mm = ?, plate_price = ?,
           setup_cost = ?, step_cost = ?, default_waste_sheets = ?, gripper_margin_mm = ?, base_impressions = ?, includes_plate = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(...offsetParams(m), id);
    requireChange(res.changes, 'máy offset');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM offset_machines WHERE id = ?').run(id).changes, 'máy offset');
  },
};

type GiaCongInput = ReturnType<typeof parseGiaCongRow>;
const giaCongParams = (g: GiaCongInput) => [
  g.machineName, g.sheetSize, g.widthMm, g.heightMm, g.paperLt249, g.paper250To349, g.paper350To450,
  g.decalPaperPlastic, g.decalClear, g.syntheticPaper, g.pvcPlastic,
];

export const giaCongPrices = {
  list(): DigitalPrintGiaCong[] {
    return (getDb().prepare('SELECT * FROM digital_pricing_giacong ORDER BY width_mm * height_mm, id').all() as Row[]).map(mapGiaCong);
  },
  create(g: GiaCongInput): number {
    const res = getDb()
      .prepare(
        `INSERT INTO digital_pricing_giacong (machine_name, sheet_size, width_mm, height_mm, paper_lt_249, paper_250_349, paper_350_450,
           decal_paper_plastic, decal_clear, synthetic_paper, pvc_plastic)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...giaCongParams(g));
    return Number(res.lastInsertRowid);
  },
  update(id: number, g: GiaCongInput) {
    const res = getDb()
      .prepare(
        `UPDATE digital_pricing_giacong SET machine_name = ?, sheet_size = ?, width_mm = ?, height_mm = ?, paper_lt_249 = ?, paper_250_349 = ?,
           paper_350_450 = ?, decal_paper_plastic = ?, decal_clear = ?, synthetic_paper = ?, pvc_plastic = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(...giaCongParams(g), id);
    requireChange(res.changes, 'khổ in gia công');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM digital_pricing_giacong WHERE id = ?').run(id).changes, 'khổ in gia công');
  },
};

type KemGiayInput = ReturnType<typeof parseKemGiayRow>;
const kemGiayParams = (k: KemGiayInput) => [k.paperCode, k.paperName, k.gsm, k.sheetSize, k.widthMm, k.heightMm, k.price1Side, k.price2Side];

export const kemGiayPrices = {
  list(): DigitalPrintKemGiay[] {
    return (getDb().prepare("SELECT * FROM digital_pricing_kem_giay ORDER BY substr(paper_code, 1, 1), gsm, paper_code").all() as Row[]).map(mapKemGiay);
  },
  create(k: KemGiayInput): number {
    const res = getDb()
      .prepare(
        `INSERT INTO digital_pricing_kem_giay (paper_code, paper_name, gsm, sheet_size, width_mm, height_mm, price_1side, price_2side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...kemGiayParams(k));
    return Number(res.lastInsertRowid);
  },
  update(id: number, k: KemGiayInput) {
    const res = getDb()
      .prepare(
        `UPDATE digital_pricing_kem_giay SET paper_code = ?, paper_name = ?, gsm = ?, sheet_size = ?, width_mm = ?, height_mm = ?,
           price_1side = ?, price_2side = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(...kemGiayParams(k), id);
    requireChange(res.changes, 'giá in kèm giấy');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM digital_pricing_kem_giay WHERE id = ?').run(id).changes, 'giá in kèm giấy');
  },
};

// -----------------------------------------------------------------------------
// Gia công
// -----------------------------------------------------------------------------

export function mapFinishing(r: Row): FinishingService {
  return {
    id: n(r.id),
    code: s(r.code),
    name: s(r.name),
    category: s(r.category) as FinishingService['category'],
    calcType: s(r.calc_type) as FinishingService['calcType'],
    unitPrice: n(r.unit_price),
    minPrice: n(r.min_price),
    setupFee: n(r.setup_fee),
    wastePercent: n(r.waste_percent),
    wasteSheets: n(r.waste_sheets),
    isActive: n(r.is_active) !== 0,
  };
}

type FinishingInput = ReturnType<typeof parseFinishing>;
const finishingParams = (f: FinishingInput) => [
  f.code, f.name, f.category, f.calcType, f.unitPrice, f.minPrice, f.setupFee, f.wastePercent, f.wasteSheets, f.isActive ? 1 : 0,
];

export const finishingServices = {
  list(activeOnly = false): FinishingService[] {
    const sql = `SELECT * FROM finishing_services ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY category, id`;
    return (getDb().prepare(sql).all() as Row[]).map(mapFinishing);
  },
  create(f: FinishingInput): number {
    const res = getDb()
      .prepare(
        `INSERT INTO finishing_services (code, name, category, calc_type, unit_price, min_price, setup_fee, waste_percent, waste_sheets, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...finishingParams(f));
    return Number(res.lastInsertRowid);
  },
  update(id: number, f: FinishingInput) {
    const res = getDb()
      .prepare(
        `UPDATE finishing_services SET code = ?, name = ?, category = ?, calc_type = ?, unit_price = ?, min_price = ?, setup_fee = ?,
           waste_percent = ?, waste_sheets = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(...finishingParams(f), id);
    requireChange(res.changes, 'dịch vụ gia công');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM finishing_services WHERE id = ?').run(id).changes, 'dịch vụ gia công');
  },
};

// -----------------------------------------------------------------------------
// Khách hàng
// -----------------------------------------------------------------------------

export function mapCustomer(r: Row): Customer & { orderCount?: number; totalRevenue?: number } {
  return {
    id: n(r.id),
    name: s(r.name),
    phone: s(r.phone),
    email: s(r.email),
    company: s(r.company),
    address: s(r.address),
    notes: s(r.notes),
    createdAt: s(r.created_at),
    orderCount: r.order_count === undefined ? undefined : n(r.order_count),
    totalRevenue: r.total_revenue === undefined ? undefined : n(r.total_revenue),
  };
}

type CustomerInput = ReturnType<typeof parseCustomer>;

export const customers = {
  list(q?: string) {
    let sql = `
      SELECT c.*, COUNT(o.id) AS order_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' AND o.status != 'quote' THEN o.final_price ELSE 0 END), 0) AS total_revenue
      FROM customers c LEFT JOIN quotes_orders o ON o.customer_id = c.id`;
    const params: string[] = [];
    if (q) {
      sql += ' WHERE c.name LIKE ? OR c.phone LIKE ? OR c.company LIKE ? OR c.email LIKE ?';
      const t = `%${q}%`;
      params.push(t, t, t, t);
    }
    sql += ' GROUP BY c.id ORDER BY c.id DESC';
    return (getDb().prepare(sql).all(...params) as Row[]).map(mapCustomer);
  },
  get(id: number): Customer | null {
    const r = getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id) as Row | undefined;
    return r ? mapCustomer(r) : null;
  },
  findByPhone(phone: string): Customer | null {
    const r = getDb().prepare('SELECT * FROM customers WHERE phone = ? ORDER BY id LIMIT 1').get(phone) as Row | undefined;
    return r ? mapCustomer(r) : null;
  },
  create(c: CustomerInput): number {
    const res = getDb()
      .prepare('INSERT INTO customers (name, phone, email, company, address, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.name, c.phone, c.email, c.company, c.address, c.notes);
    return Number(res.lastInsertRowid);
  },
  update(id: number, c: CustomerInput) {
    const res = getDb()
      .prepare('UPDATE customers SET name = ?, phone = ?, email = ?, company = ?, address = ?, notes = ? WHERE id = ?')
      .run(c.name, c.phone, c.email, c.company, c.address, c.notes, id);
    requireChange(res.changes, 'khách hàng');
  },
  remove(id: number) {
    // Đơn hàng cũ vẫn giữ tên/SĐT khách (customer_id → NULL nhờ ON DELETE SET NULL)
    requireChange(getDb().prepare('DELETE FROM customers WHERE id = ?').run(id).changes, 'khách hàng');
  },
};

// -----------------------------------------------------------------------------
// Cài đặt
// -----------------------------------------------------------------------------

export const settings = {
  get(): SystemSetting {
    const rows = getDb().prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: string, def: number) => {
      const v = m.get(k);
      const x = v === undefined || v === '' ? NaN : Number(v);
      return Number.isFinite(x) ? x : def;
    };
    return {
      companyName: m.get('companyName') ?? 'XƯỞNG IN PRINTCAL',
      companyAddress: m.get('companyAddress') ?? '',
      companyPhone: m.get('companyPhone') ?? '',
      companyEmail: m.get('companyEmail') ?? '',
      bankAccount: m.get('bankAccount') ?? '',
      bankName: m.get('bankName') ?? '',
      quoteFooterNote: m.get('quoteFooterNote') ?? '',
      defaultProfitMargin: num('defaultProfitMargin', 25),
      defaultVatPercent: num('defaultVatPercent', 8),
    };
  },
  update(patch: Partial<SystemSetting>) {
    transaction((db) => {
      const stmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, String(v));
    });
  },
};

// -----------------------------------------------------------------------------
// Đơn hàng / báo giá
// -----------------------------------------------------------------------------

function parseSpec(raw: unknown): OrderSpec | null {
  if (!raw) return null;
  try {
    const spec = JSON.parse(String(raw)) as OrderSpec;
    return spec && spec.input && spec.result ? spec : null;
  } catch {
    return null;
  }
}

export function mapOrder(r: Row, withSpec = true): QuoteOrder {
  return {
    id: n(r.id),
    code: s(r.code),
    customerId: r.customer_id === null || r.customer_id === undefined ? null : n(r.customer_id),
    customerName: s(r.customer_name),
    customerPhone: s(r.customer_phone),
    customerEmail: s(r.customer_email),
    customerCompany: s(r.customer_company),
    jobName: s(r.job_name),
    productType: s(r.product_type) as QuoteOrder['productType'],
    printTech: s(r.print_tech) as QuoteOrder['printTech'],
    quantity: n(r.quantity),
    widthMm: n(r.width_mm),
    heightMm: n(r.height_mm),
    pages: n(r.pages),
    paperName: s(r.paper_name),
    paperGsm: n(r.paper_gsm),
    parentSize: s(r.parent_size),
    printSize: s(r.print_size),
    upsPerSheet: n(r.ups_per_sheet),
    totalPrintSheets: n(r.total_print_sheets),
    totalParentSheets: n(r.total_parent_sheets),
    paperCost: n(r.paper_cost),
    printCost: n(r.print_cost),
    finishingCost: n(r.finishing_cost),
    totalCost: n(r.total_cost),
    profitMarginPercent: n(r.profit_margin_percent),
    profitAmount: n(r.profit_amount),
    discountAmount: n(r.discount_amount),
    vatPercent: n(r.vat_percent),
    vatAmount: n(r.vat_amount),
    finalPrice: n(r.final_price),
    unitPrice: n(r.unit_price),
    status: s(r.status) as OrderStatus,
    notes: s(r.notes),
    spec: withSpec ? parseSpec(r.spec_json) : null,
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export interface NewOrderRecord {
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerCompany: string;
  notes: string;
  spec: OrderSpec;
}

/** Sinh mã PC-YYYYMM-NNN theo số lớn nhất hiện có (an toàn khi đã xoá đơn) */
function nextOrderCode(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `PC-${ym}-`;
  const row = getDb()
    .prepare("SELECT MAX(CAST(substr(code, ?) AS INTEGER)) AS maxNo FROM quotes_orders WHERE code LIKE ?")
    .get(prefix.length + 1, `${prefix}%`) as { maxNo: number | null };
  return `${prefix}${String((row.maxNo ?? 0) + 1).padStart(3, '0')}`;
}

export const orders = {
  list(filter: { status?: string; search?: string; customerId?: number } = {}): QuoteOrder[] {
    let sql = 'SELECT * FROM quotes_orders WHERE 1=1';
    const params: (string | number)[] = [];
    if (filter.status && filter.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.customerId) {
      sql += ' AND customer_id = ?';
      params.push(filter.customerId);
    }
    if (filter.search) {
      sql += ' AND (code LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR job_name LIKE ?)';
      const t = `%${filter.search}%`;
      params.push(t, t, t, t);
    }
    sql += ' ORDER BY id DESC';
    return (getDb().prepare(sql).all(...params) as Row[]).map((r) => mapOrder(r, false));
  },
  get(id: number): QuoteOrder | null {
    const r = getDb().prepare('SELECT * FROM quotes_orders WHERE id = ?').get(id) as Row | undefined;
    return r ? mapOrder(r) : null;
  },
  count(): number {
    return (getDb().prepare('SELECT COUNT(*) AS c FROM quotes_orders').get() as { c: number }).c;
  },
  /** Tạo đơn (tự tạo / liên kết khách theo SĐT) trong 1 transaction */
  create(rec: NewOrderRecord): { id: number; code: string; customerId: number | null } {
    return transaction((db) => {
      let customerId = rec.customerId;
      if (customerId && !customers.get(customerId)) customerId = null;
      if (!customerId && rec.customerPhone) {
        const existing = customers.findByPhone(rec.customerPhone);
        customerId = existing
          ? existing.id
          : customers.create({ name: rec.customerName, phone: rec.customerPhone, email: rec.customerEmail, company: rec.customerCompany, address: '', notes: '' });
      }

      const { input, result, paper } = rec.spec;
      const code = nextOrderCode();
      const res = db
        .prepare(
          `INSERT INTO quotes_orders (
             code, customer_id, customer_name, customer_phone, customer_email, customer_company,
             job_name, product_type, print_tech, quantity, width_mm, height_mm, pages,
             paper_name, paper_gsm, parent_size, print_size, ups_per_sheet,
             total_print_sheets, total_parent_sheets, paper_cost, print_cost, finishing_cost,
             total_cost, profit_margin_percent, profit_amount, discount_amount,
             vat_percent, vat_amount, final_price, unit_price, status, notes, spec_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quote', ?, ?)`
        )
        .run(
          code,
          customerId,
          rec.customerName,
          rec.customerPhone,
          rec.customerEmail,
          rec.customerCompany,
          input.jobName,
          input.productType,
          result.chosenTech,
          input.quantity,
          input.widthMm,
          input.heightMm,
          input.productType === 'catalogue' ? input.pages : input.printSides === '2_side' ? 2 : 1,
          paper.name,
          paper.gsm,
          result.imposition.parentSheet.name,
          result.imposition.printSheet.name,
          result.imposition.upsPerPrintSheet,
          result.quantities.totalPrintSheets,
          result.quantities.parentSheetsNeeded,
          result.costs.paperCost,
          result.costs.totalPrintCost,
          result.costs.finishingCost,
          result.costs.totalBaseCost,
          result.costs.profitMarginPercent,
          result.costs.profitAmount,
          result.costs.discountAmount,
          result.costs.vatPercent,
          result.costs.vatAmount,
          result.costs.finalPrice,
          result.costs.unitPrice,
          rec.notes,
          JSON.stringify(rec.spec)
        );
      return { id: Number(res.lastInsertRowid), code, customerId };
    });
  },
  setStatus(id: number, status: OrderStatus) {
    const res = getDb().prepare('UPDATE quotes_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    requireChange(res.changes, 'đơn hàng');
  },
  update(id: number, u: ReturnType<typeof parseOrderUpdate>) {
    const res = getDb()
      .prepare(
        `UPDATE quotes_orders SET customer_name = ?, customer_phone = ?, customer_email = ?, customer_company = ?, job_name = ?, status = ?,
           notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(u.customerName, u.customerPhone, u.customerEmail, u.customerCompany, u.jobName, u.status, u.notes, id);
    requireChange(res.changes, 'đơn hàng');
  },
  remove(id: number) {
    requireChange(getDb().prepare('DELETE FROM quotes_orders WHERE id = ?').run(id).changes, 'đơn hàng');
  },
};
