// =============================================================================
// SQLite (node:sqlite) – kết nối, migration theo PRAGMA user_version, seed lần đầu
// -----------------------------------------------------------------------------
// Nguyên tắc: KHÔNG BAO GIỜ xoá / ghi đè dữ liệu người dùng đã sửa.
// Seed chỉ chạy khi bảng đang trống.
// =============================================================================

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.PRINTCAL_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'printcal.db');
const SEED_DIR = path.join(process.cwd(), 'data');

const globalForDb = globalThis as unknown as { __printcalDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__printcalDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    migrate(db);
    globalForDb.__printcalDb = db;
  }
  return globalForDb.__printcalDb;
}

/** Chạy fn trong 1 transaction (BEGIN IMMEDIATE để tránh tranh chấp ghi) */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Migration
// -----------------------------------------------------------------------------

const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS paper_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    gsm INTEGER NOT NULL,
    parent_width_cm REAL NOT NULL,
    parent_height_cm REAL NOT NULL,
    price_above_500 REAL NOT NULL DEFAULT 0,
    price_below_500 REAL NOT NULL DEFAULT 0,
    price_per_ram REAL NOT NULL DEFAULT 0,
    price_per_kg REAL NOT NULL DEFAULT 0,
    supplier TEXT NOT NULL DEFAULT 'Thuận Phát',
    unit TEXT NOT NULL DEFAULT 'ram',
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS offset_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    max_width_mm REAL NOT NULL,
    max_height_mm REAL NOT NULL,
    min_width_mm REAL NOT NULL,
    min_height_mm REAL NOT NULL,
    plate_price REAL NOT NULL,
    setup_cost REAL NOT NULL,
    step_cost REAL NOT NULL,
    default_waste_sheets INTEGER NOT NULL,
    gripper_margin_mm REAL NOT NULL DEFAULT 10,
    base_impressions INTEGER NOT NULL DEFAULT 3000,
    includes_plate INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS digital_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    max_width_mm REAL NOT NULL,
    max_height_mm REAL NOT NULL,
    click_a4_1side REAL NOT NULL,
    click_a4_2side REAL NOT NULL,
    click_a3_1side REAL NOT NULL,
    click_a3_2side REAL NOT NULL,
    default_waste_sheets INTEGER NOT NULL DEFAULT 3,
    min_charge REAL NOT NULL DEFAULT 20000,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS digital_pricing_giacong (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_name TEXT NOT NULL,
    sheet_size TEXT NOT NULL UNIQUE,
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    paper_lt_249 REAL NOT NULL,
    paper_250_349 REAL NOT NULL,
    paper_350_450 REAL NOT NULL,
    decal_paper_plastic REAL NOT NULL,
    decal_clear REAL NOT NULL,
    synthetic_paper REAL NOT NULL,
    pvc_plastic REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS digital_pricing_kem_giay (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_code TEXT NOT NULL UNIQUE,
    paper_name TEXT NOT NULL,
    gsm INTEGER NOT NULL,
    sheet_size TEXT NOT NULL,
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    price_1side REAL NOT NULL,
    price_2side REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS finishing_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    calc_type TEXT NOT NULL,
    unit_price REAL NOT NULL,
    min_price REAL NOT NULL DEFAULT 0,
    setup_fee REAL NOT NULL DEFAULT 0,
    waste_percent REAL NOT NULL DEFAULT 0,
    waste_sheets INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    company TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quotes_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    customer_company TEXT,
    job_name TEXT NOT NULL,
    product_type TEXT NOT NULL,
    print_tech TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    pages INTEGER NOT NULL DEFAULT 2,
    paper_name TEXT NOT NULL,
    paper_gsm INTEGER NOT NULL,
    parent_size TEXT NOT NULL,
    print_size TEXT NOT NULL,
    ups_per_sheet INTEGER NOT NULL,
    total_print_sheets INTEGER NOT NULL,
    total_parent_sheets INTEGER NOT NULL,
    paper_cost REAL NOT NULL,
    print_cost REAL NOT NULL,
    finishing_cost REAL NOT NULL,
    total_cost REAL NOT NULL,
    profit_margin_percent REAL NOT NULL,
    profit_amount REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    vat_percent REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    final_price REAL NOT NULL,
    unit_price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'quote',
    notes TEXT,
    spec_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function columnNames(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string) {
  if (!columnNames(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
}

const MIGRATIONS: ((db: DatabaseSync) => void)[] = [
  // v1 – lược đồ gốc + vá cột cho các DB cũ
  (db) => {
    db.exec(SCHEMA_V1);
    addColumnIfMissing(db, 'offset_machines', 'base_impressions', 'INTEGER NOT NULL DEFAULT 3000');
    addColumnIfMissing(db, 'offset_machines', 'includes_plate', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing(db, 'paper_types', 'supplier', "TEXT NOT NULL DEFAULT 'Thuận Phát'");
    addColumnIfMissing(db, 'paper_types', 'price_above_500', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'paper_types', 'price_below_500', 'REAL NOT NULL DEFAULT 0');
    // Giấy cũ chỉ có price_per_ram → chép sang cột mới
    db.exec('UPDATE paper_types SET price_above_500 = price_per_ram WHERE price_above_500 = 0 AND price_per_ram > 0;');
    db.exec('UPDATE paper_types SET price_below_500 = price_above_500 WHERE price_below_500 = 0;');
  },
  // v2 – chỉ mục tìm kiếm
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON quotes_orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON quotes_orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    `);
    // Bản cũ lưu ghi chú báo giá với chuỗi "\n" dạng ký tự thường → đổi thành xuống dòng thật
    db.exec(`UPDATE system_settings SET value = replace(value, '\\n', char(10)) WHERE key = 'quoteFooterNote';`);
  },
];

function migrate(db: DatabaseSync) {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  seedIfEmpty(db);
}

// -----------------------------------------------------------------------------
// Seed dữ liệu mặc định (chỉ khi bảng trống)
// -----------------------------------------------------------------------------

function isEmpty(db: DatabaseSync, table: string) {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c === 0;
}

function readSeed<T>(file: string): T[] {
  const p = path.join(SEED_DIR, file);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T[];
  } catch (err) {
    console.error(`[printcal] Không đọc được file seed ${file}:`, err);
    return [];
  }
}

type Row = Record<string, string | number | null | undefined>;

function seedIfEmpty(db: DatabaseSync) {
  if (isEmpty(db, 'paper_types')) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO paper_types (code, name, gsm, parent_width_cm, parent_height_cm, price_above_500, price_below_500,
        price_per_ram, price_per_kg, supplier, unit, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ram', ?, ?)
    `);
    for (const p of readSeed<Row>('papers_t9_26.json')) {
      const above = Number(p.price_above_500 ?? p.price_per_ram) || 0;
      stmt.run(
        String(p.code),
        String(p.name),
        Number(p.gsm),
        Number(p.parent_width_cm),
        Number(p.parent_height_cm),
        above,
        Number(p.price_below_500) || above,
        above,
        String(p.supplier || 'Thuận Phát'),
        String(p.description || ''),
        p.is_active === 0 ? 0 : 1
      );
    }
  }

  if (isEmpty(db, 'offset_machines')) {
    const stmt = db.prepare(`
      INSERT INTO offset_machines (name, max_width_mm, max_height_mm, min_width_mm, min_height_mm, plate_price, setup_cost,
        step_cost, default_waste_sheets, gripper_margin_mm, base_impressions, includes_plate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run('Máy Offset Khổ Nhỏ (dưới 65x43cm)', 650, 430, 210, 297, 75000, 900000, 150000, 80, 10, 3000, 1);
    stmt.run('Máy Offset Khổ 65x86cm (Bắt nhíp chiều 86)', 860, 650, 430, 650, 100000, 1200000, 200000, 100, 10, 3000, 1);
  }

  if (isEmpty(db, 'digital_pricing_giacong')) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO digital_pricing_giacong (machine_name, sheet_size, width_mm, height_mm, paper_lt_249, paper_250_349,
        paper_350_450, decal_paper_plastic, decal_clear, synthetic_paper, pvc_plastic)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of readSeed<Row>('digital_pricing_giacong.json')) {
      stmt.run(
        String(r.machine_name), String(r.sheet_size), Number(r.width_mm), Number(r.height_mm),
        Number(r.paper_lt_249), Number(r.paper_250_349), Number(r.paper_350_450),
        Number(r.decal_paper_plastic), Number(r.decal_clear), Number(r.synthetic_paper), Number(r.pvc_plastic)
      );
    }
  }

  if (isEmpty(db, 'digital_pricing_kem_giay')) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO digital_pricing_kem_giay (paper_code, paper_name, gsm, sheet_size, width_mm, height_mm, price_1side, price_2side)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of readSeed<Row>('digital_pricing_kem_giay.json')) {
      stmt.run(
        String(r.paper_code), String(r.paper_name), Number(r.gsm), String(r.sheet_size),
        Number(r.width_mm), Number(r.height_mm), Number(r.price_1side), Number(r.price_2side)
      );
    }
  }

  if (isEmpty(db, 'finishing_services')) {
    const stmt = db.prepare(`
      INSERT INTO finishing_services (code, name, category, calc_type, unit_price, min_price, setup_fee, waste_percent, waste_sheets, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const rows: [string, string, string, string, number, number, number, number, number][] = [
      ['CAN_MANG_MO', 'Cán màng mờ nhiệt', 'can_mang', 'per_m2', 850, 80000, 0, 1.5, 10],
      ['CAN_MANG_BONG', 'Cán màng bóng nhiệt', 'can_mang', 'per_m2', 800, 80000, 0, 1.5, 10],
      ['CAN_MANG_METALIZE', 'Cán màng Metalize bạc/vàng', 'can_mang', 'per_m2', 3500, 250000, 0, 2.5, 20],
      ['BE_THANH_PHAM', 'Làm khuôn bế & Công bế hộp/túi/thẻ', 'be', 'die_cut', 150, 150000, 220000, 2.0, 30],
      ['BE_DEMI_DECAL', 'Bế demi decal tem nhãn (đứt decal)', 'be', 'die_cut', 120, 120000, 180000, 1.5, 15],
      ['CAN_GAP_1_DUONG', 'Cấn 1 đường & Gấp đôi (Flyer)', 'can_gap', 'per_product', 80, 50000, 0, 0.5, 10],
      ['CAN_GAP_2_DUONG', 'Cấn 2 đường & Gấp 3 (Brochure)', 'can_gap', 'per_product', 140, 70000, 0, 1.0, 15],
      ['EP_KIM_LOGO', 'Ép kim nhũ vàng/bạc logo (khuôn kẽm)', 'ep_kim', 'per_product', 200, 150000, 180000, 2.0, 25],
      ['DAP_NOI_LOGO', 'Dập nổi/dập chìm logo', 'ep_kim', 'per_product', 180, 150000, 160000, 1.5, 20],
      ['PHU_UV_DINH_HINH', 'Phủ UV định hình (Spot UV)', 'phu_uv', 'per_product', 350, 250000, 200000, 2.0, 30],
      ['XEN_THANH_PHAM', 'Xén thành phẩm đóng gói', 'khac', 'fixed', 30000, 30000, 0, 0.2, 5],
      ['BO_GOC_NAMECARD', 'Bo 4 góc (Namecard/Thẻ)', 'khac', 'per_product', 50, 40000, 0, 0.5, 5],
      ['DONG_GHIM_LONG', 'Đóng 2 ghim lồng giữa', 'dong_cuon', 'per_product', 350, 80000, 0, 1.0, 10],
      ['DAN_GAY_KEO_NHIET', 'Dán keo nhiệt gáy sách', 'dong_cuon', 'per_product', 2500, 200000, 0, 1.5, 15],
      ['DONG_LO_XO', 'Đóng gáy lò xo kẽm', 'dong_cuon', 'per_product', 4000, 150000, 0, 1.0, 10],
      ['DAN_HOP_TU_DONG', 'Dán dính mép hộp giấy', 'dan', 'per_product', 250, 150000, 0, 1.0, 20],
      ['DAN_DAY_TUI_GIAY', 'Gấp dán túi giấy & xỏ dây quai', 'dan', 'per_product', 1500, 300000, 0, 1.5, 25],
    ];
    for (const r of rows) stmt.run(...r);
  }

  const settingDefaults: Record<string, string> = {
    companyName: 'XƯỞNG IN ẤN & THIẾT KẾ PRINTCAL',
    companyAddress: 'Số 123 Đường In Ấn, TP.HCM',
    companyPhone: '0900.888.999',
    companyEmail: 'baogia@printcal.vn',
    bankAccount: '19038889999999 - CTK: PRINTCAL VIETNAM',
    bankName: 'Techcombank Chi nhánh TP.HCM',
    quoteFooterNote:
      '1. Báo giá có hiệu lực trong vòng 15 ngày.\n2. Giá trên chưa bao gồm phí vận chuyển ngoại tỉnh.\n3. Thời gian giao hàng tính từ lúc duyệt bản in mẫu và đặt cọc 50%.',
    defaultProfitMargin: '25',
    defaultVatPercent: '8',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settingDefaults)) insertSetting.run(k, v);
}
