// Chạy: npm test  (node --test, Node ≥ 22.18 hỗ trợ chạy trực tiếp TypeScript)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CalculationInput, DigitalPrintGiaCong, DigitalPrintKemGiay, FinishingService, OffsetMachine, PaperType } from '@/types';
import { calculateQuote, parsePaperCode, resolveKemGiay, QuoteError, type PricingContext } from './pricing.ts';
import { layoutOnSheet, standardDivisions, buildCutScheme } from './imposition.ts';

const root = process.cwd();
const giaCong: DigitalPrintGiaCong[] = JSON.parse(readFileSync(join(root, 'data/digital_pricing_giacong.json'), 'utf8')).map(
  (r: Record<string, number | string>, i: number) => ({
    id: i + 1,
    machineName: r.machine_name,
    sheetSize: r.sheet_size,
    widthMm: r.width_mm,
    heightMm: r.height_mm,
    paperLt249: r.paper_lt_249,
    paper250To349: r.paper_250_349,
    paper350To450: r.paper_350_450,
    decalPaperPlastic: r.decal_paper_plastic,
    decalClear: r.decal_clear,
    syntheticPaper: r.synthetic_paper,
    pvcPlastic: r.pvc_plastic,
  })
);
const kemGiay: DigitalPrintKemGiay[] = JSON.parse(readFileSync(join(root, 'data/digital_pricing_kem_giay.json'), 'utf8')).map(
  (r: Record<string, number | string>, i: number) => ({
    id: i + 1,
    paperCode: r.paper_code,
    paperName: r.paper_name,
    gsm: r.gsm,
    sheetSize: r.sheet_size,
    widthMm: r.width_mm,
    heightMm: r.height_mm,
    price1Side: r.price_1side,
    price2Side: r.price_2side,
  })
);

const machines: OffsetMachine[] = [
  { id: 1, name: 'Nhỏ 65x43', maxWidthMm: 650, maxHeightMm: 430, minWidthMm: 210, minHeightMm: 297, platePrice: 75000, setupCost: 900000, stepCost: 150000, defaultWasteSheets: 80, gripperMarginMm: 10, baseImpressions: 3000, includesPlate: true },
  { id: 2, name: 'Lớn 65x86', maxWidthMm: 860, maxHeightMm: 650, minWidthMm: 430, minHeightMm: 650, platePrice: 100000, setupCost: 1200000, stepCost: 200000, defaultWasteSheets: 100, gripperMarginMm: 10, baseImpressions: 3000, includesPlate: true },
];

const c150: PaperType = {
  id: 1, code: 'C150_65x86_Test', name: 'Couche 150gsm (65x86cm)', gsm: 150, parentWidthCm: 65, parentHeightCm: 86,
  priceAbove500: 1000000, priceBelow500: 1020000, supplier: 'Test', description: '', isActive: true,
};

const lamination: FinishingService = {
  id: 10, code: 'CAN_MANG', name: 'Cán màng', category: 'can_mang', calcType: 'per_m2', unitPrice: 800, minPrice: 80000,
  setupFee: 0, wastePercent: 1.5, wasteSheets: 10, isActive: true,
};
const dieCut: FinishingService = {
  id: 11, code: 'BE', name: 'Bế', category: 'be', calcType: 'die_cut', unitPrice: 150, minPrice: 150000,
  setupFee: 220000, wastePercent: 2, wasteSheets: 30, isActive: true,
};

const ctx = (paper: PaperType = c150): PricingContext => ({ paper, offsetMachines: machines, giaCong, kemGiay, finishing: [lamination, dieCut] });

const baseInput = (over: Partial<CalculationInput> = {}): CalculationInput => ({
  jobName: 'Test', productType: 'to_roi', printTech: 'auto', quantity: 1000, widthMm: 210, heightMm: 297, pages: 2, bleedMm: 2,
  paperTypeId: 1, printSides: '2_side', colorsFront: 4, colorsBack: 4, offsetWorkType: 'self_turn', digitalMode: 'with_paper',
  customerSuppliedPaper: false, whiteInk: false, selectedFinishing: [], profitMarginPercent: 25, discountAmount: 0, vatPercent: 8,
  ...over,
});

test('bình trang in nhanh trên phôi 325x430: A4=2, A5=4, A6=8', () => {
  const lay = (w: number, h: number) =>
    layoutOnSheet({ sheetW: 430, sheetH: 325, itemW: w, itemH: h, outerBleed: 0, gap: 0, gripper: 2.5, side: 2.5, tail: 2.5 }).ups;
  assert.equal(lay(210, 297), 2);
  assert.equal(lay(148, 210), 4);
  assert.equal(lay(105, 148), 8);
});

test('các con không chồng lên nhau và nằm trong vùng in', () => {
  const l = layoutOnSheet({ sheetW: 430, sheetH: 325, itemW: 90, itemH: 54, outerBleed: 0, gap: 0, gripper: 2.5, side: 2.5, tail: 2.5 });
  assert.ok(l.ups >= 21);
  for (const a of l.boxes) {
    assert.ok(a.x >= 2.4 && a.y >= 2.4 && a.x + a.w <= 430 - 2.4 && a.y + a.h <= 325 - 2.4, 'trong vùng in');
    for (const b of l.boxes) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
      assert.ok(!overlap, `con #${a.index} chồng #${b.index}`);
    }
  }
});

test('tự trở bắt buộc số con chẵn', () => {
  const l = layoutOnSheet({ sheetW: 650, sheetH: 430, itemW: 200, itemH: 400, outerBleed: 2, gap: 0, gripper: 10, side: 4, tail: 4, requireEven: true });
  assert.equal(l.ups % 2, 0);
});

test('chia khổ 65x86 có chia 2 (430x650) và chia 4 (430x325)', () => {
  const divs = standardDivisions(860, 650);
  assert.ok(divs.some((d) => d.widthMm === 650 && d.heightMm === 430 && d.cuts === 2));
  assert.ok(divs.some((d) => d.widthMm === 430 && d.heightMm === 325 && d.cuts === 4));
  const scheme = buildCutScheme(860, 650, 650, 430);
  assert.equal(scheme.cutsCount, 2);
  assert.equal(scheme.blocks.length, 2);
});

test('offset A4 1000 tờ 2 mặt: dùng gói mở máy, tiền giấy đúng bậc giá', () => {
  const r = calculateQuote(baseInput({ printTech: 'offset' }), ctx());
  assert.equal(r.chosenTech, 'offset');
  const q = r.quantities;
  assert.equal(q.totalPrintSheets, q.netPrintSheets + q.printWasteSheets + q.finishingWasteSheets);
  assert.equal(q.netPrintSheets, Math.ceil(1000 / r.imposition.upsPerPrintSheet));
  assert.equal(q.parentSheetsNeeded, Math.ceil(q.totalPrintSheets / r.imposition.cutsPerParentSheet));
  const ram = q.parentSheetsNeeded >= 500 ? 1000000 : 1020000;
  assert.equal(r.costs.paperCost, Math.round((q.parentSheetsNeeded * ram) / 500));
  // Tổng = giấy + in + gia công
  assert.equal(r.costs.totalBaseCost, r.costs.paperCost + r.costs.totalPrintCost + r.costs.finishingCost);
  assert.equal(r.costs.finalPrice, r.costs.preTaxTotal + r.costs.vatAmount);
});

test('offset in 2 bài tính 2 lần mở máy, mỗi lần đã gồm 4 kẽm', () => {
  const r = calculateQuote(baseInput({ printTech: 'offset', offsetWorkType: 'sheetwise', quantity: 500 }), ctx());
  assert.equal(r.printing.passes, 2);
  assert.equal(r.costs.plateCost, 0);
  assert.equal(r.printing.platesCount, 8);
});

test('in nhanh kèm giấy: không bù hao, tiền giấy = 0, có phụ phí SL ít', () => {
  const r = calculateQuote(baseInput({ printTech: 'digital', quantity: 60 }), ctx());
  assert.equal(r.chosenTech, 'digital');
  assert.equal(r.quantities.printWasteSheets, 0);
  assert.equal(r.costs.paperCost, 0);
  assert.equal(r.imposition.upsPerPrintSheet, 2);
  assert.equal(r.quantities.totalPrintSheets, 30);
  assert.equal(r.costs.shortRunFee, 30000);
  assert.equal(r.printing.ratePerSheet, 3000); // C150 2 mặt
});

test('khớp mã giấy INTC theo tiền tố + định lượng, F180 có thêm khổ 325x355', () => {
  assert.deepEqual(parsePaperCode('F180_79x109_IK'), { prefix: 'F', gsm: 180 });
  const f180 = { ...c150, code: 'F180_65x86_IK', name: 'Fort 180', gsm: 180 };
  const { entries } = resolveKemGiay({}, f180, kemGiay);
  assert.equal(entries.length, 2);
  const nearest = resolveKemGiay({}, { ...c150, code: 'C115_x', gsm: 115 }, kemGiay);
  assert.equal(nearest.entries[0].gsm, 120);
  assert.ok(nearest.warning);
  assert.throws(() => resolveKemGiay({}, { ...c150, code: 'B300_x', gsm: 300 }, kemGiay), QuoteError);
});

test('in gia công Konica: 2 mặt = 2 lần đơn giá, khách cấp giấy thì tiền giấy = 0', () => {
  const r = calculateQuote(baseInput({ printTech: 'digital', digitalMode: 'without_paper', quantity: 400, customerSuppliedPaper: true }), ctx());
  assert.equal(r.costs.paperCost, 0);
  assert.ok(r.printing.ratePerSheet! > 0);
  const r2 = calculateQuote(baseInput({ printTech: 'digital', digitalMode: 'without_paper', quantity: 400 }), ctx());
  assert.ok(r2.costs.paperCost > 0);
});

test('tự động chọn công nghệ rẻ hơn và bảng so sánh nhất quán', () => {
  const small = calculateQuote(baseInput({ quantity: 50 }), ctx());
  assert.equal(small.chosenTech, 'digital');
  const big = calculateQuote(baseInput({ quantity: 20000 }), ctx());
  assert.equal(big.chosenTech, 'offset');
  const row = big.recommendation.comparisonTable.find((c) => c.quantity === 20000)!;
  assert.equal(row.offsetTotal, big.costs.finalPrice);
  assert.ok(big.recommendation.breakEvenQty !== null);
  const be = big.recommendation.breakEvenQty!;
  assert.ok(be > 50 && be < 20000);
});

test('gia công: cán màng tính theo m² có tối thiểu, bế thêm tiền khuôn và chừa khoảng cách giữa các con', () => {
  const r = calculateQuote(
    baseInput({ printTech: 'offset', quantity: 100, selectedFinishing: [{ serviceId: 10, sides: 2 }, { serviceId: 11 }] }),
    ctx()
  );
  const lam = r.costs.finishingDetails.find((f) => f.serviceId === 10)!;
  assert.equal(lam.subtotal, 80000);
  const be = r.costs.finishingDetails.find((f) => f.serviceId === 11)!;
  assert.equal(be.subtotal, 150000 + 220000);
  assert.equal(r.imposition.gapMm, 4);
  assert.ok(r.quantities.finishingWasteSheets >= 40);
});

test('catalogue tính theo số tờ/cuốn', () => {
  const r = calculateQuote(baseInput({ productType: 'catalogue', pages: 16, quantity: 500, printTech: 'offset' }), ctx());
  assert.equal(r.quantities.printUnits, 500 * 8);
});

test('thành phẩm quá khổ báo lỗi rõ ràng', () => {
  assert.throws(() => calculateQuote(baseInput({ widthMm: 1200, heightMm: 900 }), ctx()), QuoteError);
});

test('giảm giá không làm tổng âm', () => {
  const r = calculateQuote(baseInput({ quantity: 10, discountAmount: 1e12 }), ctx());
  assert.equal(r.costs.preTaxTotal, 0);
  assert.equal(r.costs.finalPrice, 0);
});
