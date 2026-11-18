import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Khởi tạo thư mục DB tạm trước khi nạp db.ts
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printcal-test-'));
process.env.PRINTCAL_DATA_DIR = tmpDir;

const { getDb } = await import('./db.ts');
const {
  NotFoundError,
  customers,
  finishingServices,
  giaCongPrices,
  kemGiayPrices,
  offsetMachines,
  orders,
  papers,
  settings,
} = await import('./repositories.ts');
const {
  ValidationError,
  parseCalculationInput,
  parseCreateOrder,
  parseCustomer,
  parseFinishing,
  parseOffsetMachine,
  parseOrderUpdate,
  parsePaper,
  parseSettings,
} = await import('./validation.ts');
const { calculateQuote } = await import('./engine/pricing.ts');

after(() => {
  try {
    getDb().close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Windows có thể giữ file WAL thêm vài ms
  }
});

test('khởi tạo DB mới nạp đủ dữ liệu mặc định và PRAGMA user_version >= 2', () => {
  const db = getDb();
  const ver = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  assert.ok(ver >= 2);
  assert.equal(papers.list().length, 125);
  assert.equal(offsetMachines.list().length, 2);
  assert.equal(giaCongPrices.list().length, 5);
  assert.equal(kemGiayPrices.list().length, 16);
  assert.equal(finishingServices.list().length, 17);
  const s = settings.get();
  assert.equal(s.defaultProfitMargin, 25);
  assert.equal(s.defaultVatPercent, 8);
});

test('cài đặt cho phép lưu lợi nhuận 0% và VAT 0% mà không bị ghi đè về mặc định', () => {
  settings.update(parseSettings({ defaultProfitMargin: 0, defaultVatPercent: 0, companyName: 'Nhà In Thử Nghiệm' }));
  const s = settings.get();
  assert.equal(s.defaultProfitMargin, 0);
  assert.equal(s.defaultVatPercent, 0);
  assert.equal(s.companyName, 'Nhà In Thử Nghiệm');
});

test('CRUD giấy, kiểm tra trùng mã và bảo toàn dữ liệu khi đọc lại', () => {
  const p = parsePaper({
    code: 'TEST_C200',
    name: 'Couche 200 Test',
    gsm: 200,
    parentWidthCm: 65,
    parentHeightCm: 86,
    priceAbove500: 1200000,
    priceBelow500: 0, // tự điền = priceAbove500
    supplier: 'NCC A',
    description: 'Giấy test',
    isActive: true,
  });
  const id = papers.create(p);
  const loaded = papers.get(id)!;
  assert.equal(loaded.priceBelow500, 1200000);

  // Trùng mã ném lỗi UNIQUE
  assert.throws(() => papers.create(p), /UNIQUE/);

  papers.update(id, { ...p, priceAbove500: 1350000, priceBelow500: 1400000, isActive: false });
  assert.equal(papers.get(id)?.priceAbove500, 1350000);
  assert.equal(papers.get(id)?.isActive, false);

  papers.remove(id);
  assert.equal(papers.get(id), null);
  assert.throws(() => papers.remove(id), NotFoundError);
});

test('validation từ chối dữ liệu sai định dạng với thông báo tiếng Việt', () => {
  assert.throws(() => parsePaper({ code: '', name: '', gsm: 5, parentWidthCm: 0, parentHeightCm: 0, priceAbove500: -1 }), ValidationError);
  assert.throws(
    () =>
      parseOffsetMachine({
        name: 'Máy lỗi',
        maxWidthMm: 400,
        maxHeightMm: 300,
        minWidthMm: 500,
        minHeightMm: 400,
        setupCost: 500000,
      }),
    ValidationError
  );
  assert.throws(() => parseCustomer({ name: 'A', email: 'sai-email' }), ValidationError);
  assert.throws(() => parseFinishing({ code: '', name: '', unitPrice: -10 }), ValidationError);
});

test('tạo đơn hàng tự liên kết khách theo SĐT, tăng mã an toàn sau khi xoá, xoá khách không mất đơn', () => {
  const firstPaper = papers.list({ activeOnly: true })[0]!;
  const payload = parseCreateOrder({
    input: parseCalculationInput({
      jobName: 'Tờ rơi khai trương',
      productType: 'to_roi',
      printTech: 'auto',
      quantity: 1000,
      widthMm: 210,
      heightMm: 297,
      paperTypeId: firstPaper.id,
      printSides: '2_side',
      profitMarginPercent: 20,
      vatPercent: 8,
    }),
    customer: {
      name: 'Chị Hương',
      phone: '0911222333',
      company: 'Hương Trà',
    },
    notes: 'Giao gấp',
  });

  const ctx = {
    paper: firstPaper,
    offsetMachines: offsetMachines.list(),
    giaCong: giaCongPrices.list(),
    kemGiay: kemGiayPrices.list(),
    finishing: finishingServices.list(true),
  };
  const result = calculateQuote(payload.input, ctx);
  const spec = {
    input: payload.input,
    result,
    paper: { id: firstPaper.id, code: firstPaper.code, name: firstPaper.name, gsm: firstPaper.gsm },
  };

  const o1 = orders.create({
    customerId: null,
    customerName: payload.customer.name,
    customerPhone: payload.customer.phone,
    customerEmail: '',
    customerCompany: payload.customer.company ?? '',
    notes: payload.notes ?? '',
    spec,
  });
  assert.match(o1.code, /^PC-\d{6}-001$/);
  assert.ok(o1.customerId !== null);

  const o2 = orders.create({
    customerId: null,
    customerName: 'Chị Hương',
    customerPhone: '0911222333',
    customerEmail: '',
    customerCompany: 'Hương Trà',
    notes: '',
    spec,
  });
  assert.equal(o2.customerId, o1.customerId, 'cùng SĐT phải gắn chung khách hàng');
  assert.match(o2.code, /^PC-\d{6}-002$/);

  // Xoá đơn 1 rồi tạo đơn 3 -> mã phải là 003 (không trùng 002!)
  orders.remove(o1.id);
  const o3 = orders.create({
    customerId: o1.customerId,
    customerName: 'Chị Hương',
    customerPhone: '0911222333',
    customerEmail: '',
    customerCompany: 'Hương Trà',
    notes: '',
    spec,
  });
  assert.match(o3.code, /^PC-\d{6}-003$/);

  // Chốt đơn -> doanh thu khách hàng tăng tương ứng
  orders.setStatus(o3.id, 'approved');
  const custRow = customers.list('0911222333')[0]!;
  assert.equal(custRow.orderCount, 2);
  assert.equal(custRow.totalRevenue, result.costs.finalPrice);

  // Cập nhật thông tin đơn
  orders.update(
    o3.id,
    parseOrderUpdate({
      customerName: 'Chị Hương (VIP)',
      customerPhone: '0911222333',
      customerEmail: 'huong@tra.vn',
      customerCompany: 'Hương Trà',
      jobName: 'Tờ rơi khai trương Q1',
      status: 'printing',
      notes: 'Đã lên kẽm',
    })
  );
  const full = orders.get(o3.id)!;
  assert.equal(full.status, 'printing');
  assert.equal(full.jobName, 'Tờ rơi khai trương Q1');
  assert.ok(full.spec !== null);

  // Xoá khách hàng -> đơn vẫn còn và giữ tên khách, customerId về null
  customers.remove(o1.customerId!);
  const afterDeleteCust = orders.get(o3.id)!;
  assert.equal(afterDeleteCust.customerId, null);
  assert.equal(afterDeleteCust.customerName, 'Chị Hương (VIP)');
});

test('migration DB cũ không bao giờ xoá giấy hoặc máy in người dùng đã chỉnh sửa', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printcal-legacy-'));
  const legacyDbPath = path.join(legacyDir, 'printcal.db');
  const raw = new DatabaseSync(legacyDbPath);
  raw.exec(`
    CREATE TABLE paper_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gsm INTEGER NOT NULL,
      parent_width_cm REAL NOT NULL,
      parent_height_cm REAL NOT NULL,
      price_per_ram REAL NOT NULL DEFAULT 999000,
      price_per_kg REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'ram',
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO paper_types (code, name, gsm, parent_width_cm, parent_height_cm, price_per_ram)
    VALUES ('CUSTOM_1', 'Giấy Riêng Của Xưởng', 250, 65, 86, 1550000);

    CREATE TABLE offset_machines (
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
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO offset_machines (name, max_width_mm, max_height_mm, min_width_mm, min_height_mm, plate_price, setup_cost, step_cost, default_waste_sheets)
    VALUES ('Heidelberg SM74 Riêng', 740, 520, 210, 297, 85000, 1100000, 180000, 90);
  `);
  raw.close();

  // Chạy db.ts trong tiến trình con trỏ tới legacyDir để kiểm tra migrate() thực tế
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { papers, offsetMachines } = await import('./src/lib/repositories.ts');
       console.log(JSON.stringify({ papers: papers.list(), machines: offsetMachines.list() }));`,
    ],
    { env: { ...process.env, PRINTCAL_DATA_DIR: legacyDir }, encoding: 'utf-8' }
  );
  const parsed = JSON.parse(out.trim().split('\n').pop()!);
  assert.equal(parsed.papers.length, 1, 'không được xoá bảng giấy khi số dòng < 120');
  assert.equal(parsed.papers[0].code, 'CUSTOM_1');
  assert.equal(parsed.papers[0].priceAbove500, 1550000, 'tự chép price_per_ram sang price_above_500');
  assert.equal(parsed.machines.length, 1, 'không được xoá máy offset tuỳ chỉnh của xưởng');
  assert.equal(parsed.machines[0].name, 'Heidelberg SM74 Riêng');

  try {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
