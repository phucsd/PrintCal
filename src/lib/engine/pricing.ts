// =============================================================================
// ENGINE TÍNH GIÁ IN (Offset / In nhanh kèm giấy INTC / In gia công Konica)
// -----------------------------------------------------------------------------
// Module thuần – không đọc DB, không phụ thuộc Next. Mọi dữ liệu bảng giá được
// truyền vào qua PricingContext. Dùng chung 1 hàm định giá cho kết quả chính
// lẫn bảng so sánh / điểm hoà vốn để các con số luôn nhất quán.
// =============================================================================

import type {
  CalculationInput,
  CalculationResult,
  ChosenTech,
  ComparisonItem,
  DigitalMaterial,
  DigitalPrintGiaCong,
  DigitalPrintKemGiay,
  FinishingCostDetail,
  FinishingService,
  ImpositionResult,
  OffsetMachine,
  OffsetWorkType,
  PaperCutScheme,
  PaperType,
  PrintCostLine,
} from '@/types';
import {
  buildCutScheme,
  buildPreCutScheme,
  layoutOnSheet,
  piecesFromParent,
  standardDivisions,
  type SheetLayout,
} from './imposition.ts';
import {
  COMPARISON_QUANTITIES,
  DIGITAL_MARGIN_MM,
  DIGITAL_MATERIAL_LABELS,
  DIGITAL_SHORT_RUN_FEES,
  OFFSET_SIDE_MARGIN_MM,
  OFFSET_TAIL_MARGIN_MM,
  PLATES_INCLUDED_PER_PASS,
  WHITE_INK_PER_SIDE,
  WORK_TYPE_LABELS,
} from './constants.ts';

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteError';
  }
}

export interface PricingContext {
  paper: PaperType;
  offsetMachines: OffsetMachine[];
  giaCong: DigitalPrintGiaCong[];
  kemGiay: DigitalPrintKemGiay[];
  finishing: FinishingService[];
}

const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN');

// -----------------------------------------------------------------------------
// Thông tin chung của bài in (không phụ thuộc công nghệ)
// -----------------------------------------------------------------------------

interface JobFacts {
  printUnits: number;
  leavesPerCopy: number;
  twoSided: boolean;
  bleed: number;
  gap: number;
  finishing: { service: FinishingService; sides: 1 | 2 }[];
  wastePercent: number;
  wasteSheets: number;
  warnings: string[];
}

function jobFacts(input: CalculationInput, ctx: PricingContext): JobFacts {
  const warnings: string[] = [];
  let leavesPerCopy = 1;
  let twoSided = input.printSides === '2_side';

  if (input.productType === 'catalogue') {
    const pages = Math.max(2, Math.round(input.pages || 2));
    if (pages % 4 !== 0 && pages > 4) {
      warnings.push(`Catalogue ${pages} trang không chia hết cho 4 – thường phải làm tròn lên ${Math.ceil(pages / 4) * 4} trang khi đóng ghim.`);
    }
    leavesPerCopy = Math.ceil(pages / 2);
    if (!twoSided && pages > 1) {
      twoSided = true;
      warnings.push('Catalogue nhiều trang luôn in 2 mặt – đã tự chuyển sang in 2 mặt.');
    }
  }

  const finishing: JobFacts['finishing'] = [];
  const seen = new Set<number>();
  for (const sel of input.selectedFinishing) {
    if (seen.has(sel.serviceId)) continue;
    seen.add(sel.serviceId);
    const service = ctx.finishing.find((s) => s.id === sel.serviceId);
    if (!service) {
      warnings.push(`Dịch vụ gia công #${sel.serviceId} không tồn tại hoặc đã ngưng – bỏ qua.`);
      continue;
    }
    finishing.push({ service, sides: sel.sides === 2 ? 2 : 1 });
  }

  const hasDieCut = finishing.some((f) => f.service.calcType === 'die_cut');
  const bleed = Math.max(0, input.bleedMm);

  return {
    printUnits: input.quantity * leavesPerCopy,
    leavesPerCopy,
    twoSided,
    bleed,
    // Sản phẩm bế cần chừa tràn lề riêng cho từng con, còn lại xén chung dao
    gap: hasDieCut ? bleed * 2 : 0,
    finishing,
    wastePercent: finishing.reduce((s, f) => s + f.service.wastePercent, 0),
    wasteSheets: finishing.reduce((s, f) => s + f.service.wasteSheets, 0),
    warnings,
  };
}

// -----------------------------------------------------------------------------
// Gia công sau in
// -----------------------------------------------------------------------------

function finishingCosts(input: CalculationInput, facts: JobFacts, netSheets: number) {
  const details: FinishingCostDetail[] = [];
  const areaM2 = ((input.widthMm + facts.bleed * 2) / 1000) * ((input.heightMm + facts.bleed * 2) / 1000);

  for (const { service: s, sides } of facts.finishing) {
    let qty = input.quantity;
    let unit = 'sp';
    let raw = 0;
    let formula = '';

    switch (s.calcType) {
      case 'per_m2': {
        const m2 = areaM2 * input.quantity * sides;
        qty = Math.round(m2 * 100) / 100;
        unit = 'm²';
        raw = m2 * s.unitPrice;
        formula = `${qty.toLocaleString('vi-VN')} m² (${sides} mặt) × ${vnd(s.unitPrice)}đ`;
        break;
      }
      case 'per_sheet': {
        qty = netSheets * sides;
        unit = 'tờ';
        raw = qty * s.unitPrice;
        formula = `${vnd(netSheets)} tờ in${sides === 2 ? ' × 2 mặt' : ''} × ${vnd(s.unitPrice)}đ`;
        break;
      }
      case 'die_cut': {
        raw = input.quantity * s.unitPrice;
        formula = `Khuôn ${vnd(s.setupFee)}đ + ${vnd(input.quantity)} con × ${vnd(s.unitPrice)}đ`;
        break;
      }
      case 'fixed': {
        qty = 1;
        unit = 'gói';
        raw = s.unitPrice;
        formula = `Trọn gói ${vnd(s.unitPrice)}đ`;
        break;
      }
      default: {
        raw = input.quantity * s.unitPrice;
        formula = `${vnd(input.quantity)} sp × ${vnd(s.unitPrice)}đ`;
      }
    }

    const work = s.calcType === 'fixed' ? Math.round(raw) : Math.max(s.minPrice, Math.round(raw));
    if (s.calcType !== 'fixed' && s.minPrice > Math.round(raw)) formula += ` → tối thiểu ${vnd(s.minPrice)}đ`;
    if (s.setupFee > 0 && s.calcType !== 'die_cut') formula += ` + phí khuôn ${vnd(s.setupFee)}đ`;

    details.push({
      serviceId: s.id,
      name: s.name,
      category: s.category,
      calcType: s.calcType,
      sides,
      quantity: qty,
      unit,
      unitPrice: s.unitPrice,
      setupFee: s.setupFee,
      subtotal: work + s.setupFee,
      formula,
    });
  }

  return { details, total: details.reduce((s, d) => s + d.subtotal, 0) };
}

// -----------------------------------------------------------------------------
// Tiền giấy
// -----------------------------------------------------------------------------

export function paperCostFor(parentSheets: number, paper: PaperType) {
  const above = paper.priceAbove500;
  const below = paper.priceBelow500 || above;
  const wholesale = parentSheets >= 500;
  const ramPrice = wholesale ? above : below;
  return {
    cost: Math.round((parentSheets * ramPrice) / 500),
    note: `${vnd(parentSheets)} tờ mẹ × ${vnd(ramPrice)}đ/ram ÷ 500 (${wholesale ? 'giá từ 500 tờ' : 'giá lẻ dưới 500 tờ'})`,
  };
}

function kgFor(sheets: number, wMm: number, hMm: number, gsm: number) {
  return Math.round(((sheets * (wMm / 1000) * (hMm / 1000) * gsm) / 1000) * 10) / 10;
}

// -----------------------------------------------------------------------------
// Ứng viên phương án in
// -----------------------------------------------------------------------------

interface Candidate {
  tech: ChosenTech;
  imposition: ImpositionResult;
  quantities: CalculationResult['quantities'];
  printing: CalculationResult['printing'];
  paperCost: number;
  paperNote: string;
  plateCost: number;
  printRunCost: number;
  shortRunFee: number;
  whiteInkCost: number;
  finishingCost: number;
  finishingDetails: FinishingCostDetail[];
  baseCost: number;
  warnings: string[];
}

function makeImposition(
  layout: SheetLayout,
  sheetName: string,
  parent: { widthCm: number; heightCm: number; name: string },
  cuts: number,
  cutScheme: PaperCutScheme,
  margins: { gripper: number; side: number; tail: number },
  facts: JobFacts
): ImpositionResult {
  return {
    parentSheet: parent,
    printSheet: { widthMm: layout.sheetW, heightMm: layout.sheetH, name: sheetName },
    upsPerPrintSheet: layout.ups,
    cutsPerParentSheet: cuts,
    totalUpsPerParentSheet: layout.ups * cuts,
    gripperMarginMm: margins.gripper,
    sideMarginMm: margins.side,
    tailMarginMm: margins.tail,
    bleedMm: facts.bleed,
    gapMm: facts.gap,
    boxes: layout.boxes,
    sheetEfficiencyPercent: Math.round(layout.efficiency * 10) / 10,
    cutScheme,
  };
}

function shortRunFeeFor(sheets: number) {
  for (const t of DIGITAL_SHORT_RUN_FEES) if (sheets < t.below) return t.fee;
  return 0;
}

const better = (a: Candidate | null, b: Candidate) =>
  !a || b.baseCost < a.baseCost || (b.baseCost === a.baseCost && b.quantities.totalPrintSheets < a.quantities.totalPrintSheets);

// -----------------------------------------------------------------------------
// OFFSET
// -----------------------------------------------------------------------------

function offsetRunCost(m: OffsetMachine, impressions: number) {
  const extra = Math.max(0, impressions - m.baseImpressions);
  const steps = Math.ceil(extra / 1000);
  return { cost: m.setupCost + steps * m.stepCost, steps };
}

function evaluateOffset(input: CalculationInput, ctx: PricingContext, facts: JobFacts): Candidate {
  const machines = input.offsetMachineId
    ? ctx.offsetMachines.filter((m) => m.id === input.offsetMachineId)
    : ctx.offsetMachines;
  if (ctx.offsetMachines.length === 0) throw new QuoteError('Chưa cấu hình máy in offset nào.');
  if (machines.length === 0) throw new QuoteError('Máy in offset đã chọn không còn tồn tại.');

  const paper = ctx.paper;
  const PW = Math.max(paper.parentWidthCm, paper.parentHeightCm) * 10;
  const PH = Math.min(paper.parentWidthCm, paper.parentHeightCm) * 10;
  const divisions = standardDivisions(PW, PH, 4);

  const attempt = (workType: OffsetWorkType | null): Candidate | null => {
    let best: Candidate | null = null;
    const turn = facts.twoSided && workType !== 'sheetwise';

    for (const m of machines) {
      const mLong = Math.max(m.maxWidthMm, m.maxHeightMm);
      const mShort = Math.min(m.maxWidthMm, m.maxHeightMm);
      const minLong = Math.max(m.minWidthMm, m.minHeightMm);
      const minShort = Math.min(m.minWidthMm, m.minHeightMm);

      for (const d of divisions) {
        if (d.widthMm > mLong || d.heightMm > mShort) continue;
        if (d.widthMm < minLong || d.heightMm < minShort) continue;

        const layout = layoutOnSheet({
          sheetW: d.widthMm,
          sheetH: d.heightMm,
          itemW: input.widthMm,
          itemH: input.heightMm,
          outerBleed: facts.bleed,
          gap: facts.gap,
          gripper: m.gripperMarginMm,
          side: OFFSET_SIDE_MARGIN_MM,
          tail: OFFSET_TAIL_MARGIN_MM,
          requireEven: turn,
        });
        if (layout.ups === 0) continue;

        const net = Math.ceil(facts.printUnits / layout.ups);
        const finWaste = facts.wasteSheets + Math.ceil((net * facts.wastePercent) / 100);
        const printWaste = m.defaultWasteSheets;
        const total = net + printWaste + finWaste;
        const parentSheets = Math.ceil(total / d.cuts);
        const paperPart = input.customerSuppliedPaper
          ? { cost: 0, note: 'Khách cấp giấy' }
          : paperCostFor(parentSheets, paper);

        // Các lần lên máy
        const passes: { label: string; colors: number; impressions: number }[] = !facts.twoSided
          ? [{ label: 'In 1 mặt', colors: input.colorsFront, impressions: total }]
          : workType === 'sheetwise'
            ? [
                { label: 'Bài mặt trước', colors: input.colorsFront, impressions: total },
                { label: 'Bài mặt sau', colors: Math.max(1, input.colorsBack), impressions: total },
              ]
            : [
                {
                  label: workType === 'tumble' ? 'Trở nhíp (2 lượt ép)' : 'Tự trở (2 lượt ép)',
                  colors: Math.max(input.colorsFront, input.colorsBack),
                  impressions: total * 2,
                },
              ];

        const lines: PrintCostLine[] = [];
        let printRunCost = 0;
        let plates = 0;
        let platesCharged = 0;
        let impressions = 0;
        for (const p of passes) {
          const run = offsetRunCost(m, p.impressions);
          printRunCost += run.cost;
          plates += p.colors;
          impressions += p.impressions;
          const charged = m.includesPlate ? Math.max(0, p.colors - PLATES_INCLUDED_PER_PASS) : p.colors;
          platesCharged += charged;
          lines.push({
            label: `${p.label}: mở máy ${p.colors} màu`,
            amount: run.cost,
            note:
              run.steps > 0
                ? `${vnd(p.impressions)} lượt: gói ${vnd(m.setupCost)}đ (${vnd(m.baseImpressions)} lượt) + ${run.steps} × ${vnd(m.stepCost)}đ/1.000 lượt`
                : `${vnd(p.impressions)} lượt ≤ ${vnd(m.baseImpressions)} lượt – trọn gói${m.includesPlate ? ' đã gồm 4 kẽm' : ''}`,
          });
        }
        const plateCost = platesCharged * m.platePrice;
        if (plateCost > 0) {
          lines.push({
            label: `Kẽm CTP${m.includesPlate ? ' (ngoài gói)' : ''}`,
            amount: plateCost,
            note: `${platesCharged} lá × ${vnd(m.platePrice)}đ`,
          });
        }

        const fin = finishingCosts(input, facts, net);
        const baseCost = paperPart.cost + printRunCost + plateCost + fin.total;
        const cutScheme = buildCutScheme(PW, PH, d.widthMm, d.heightMm);

        const cand: Candidate = {
          tech: 'offset',
          imposition: makeImposition(
            layout,
            d.cuts === 1 ? `Nguyên khổ ${d.widthMm} × ${d.heightMm} mm` : `Khổ chia ${d.cuts} (${d.widthMm} × ${d.heightMm} mm)`,
            { widthCm: paper.parentWidthCm, heightCm: paper.parentHeightCm, name: `${paper.name}` },
            d.cuts,
            cutScheme,
            { gripper: m.gripperMarginMm, side: OFFSET_SIDE_MARGIN_MM, tail: OFFSET_TAIL_MARGIN_MM },
            facts
          ),
          quantities: {
            productQty: input.quantity,
            printUnits: facts.printUnits,
            netPrintSheets: net,
            printWasteSheets: printWaste,
            finishingWasteSheets: finWaste,
            totalPrintSheets: total,
            parentSheetsNeeded: parentSheets,
            ramsNeeded: Math.round((parentSheets / 500) * 100) / 100,
            kgNeeded: kgFor(parentSheets, PW, PH, paper.gsm),
            impressions,
          },
          printing: {
            machineId: m.id,
            machineName: m.name,
            sheetName: `${d.widthMm} × ${d.heightMm} mm`,
            workType: facts.twoSided ? (workType ?? undefined) : undefined,
            passes: passes.length,
            platesCount: plates,
            lines,
          },
          paperCost: paperPart.cost,
          paperNote: paperPart.note,
          plateCost,
          printRunCost,
          shortRunFee: 0,
          whiteInkCost: 0,
          finishingCost: fin.total,
          finishingDetails: fin.details,
          baseCost,
          warnings: [],
        };
        if (better(best, cand)) best = cand;
      }
    }
    return best;
  };

  const workType: OffsetWorkType | null = facts.twoSided ? input.offsetWorkType : null;
  let best = attempt(workType);
  if (!best && workType && workType !== 'sheetwise') {
    best = attempt('sheetwise');
    if (best) {
      best.warnings.push(`Không xếp được số con chẵn để ${WORK_TYPE_LABELS[workType].toLowerCase()} – đã chuyển sang in 2 bài.`);
    }
  }
  if (!best) {
    const machineText = input.offsetMachineId ? 'máy offset đã chọn' : 'máy offset nào';
    throw new QuoteError(
      `Thành phẩm ${input.widthMm} × ${input.heightMm} mm không vừa khổ in của ${machineText} khi xả từ giấy ${paper.parentWidthCm} × ${paper.parentHeightCm} cm.`
    );
  }
  if (input.colorsFront > PLATES_INCLUDED_PER_PASS || input.colorsBack > PLATES_INCLUDED_PER_PASS) {
    best.warnings.push('In trên 4 màu: kẽm màu pha được tính thêm ngoài gói mở máy.');
  }
  return best;
}

// -----------------------------------------------------------------------------
// IN NHANH KÈM GIẤY (INTC)
// -----------------------------------------------------------------------------

/** Tách tiền tố chất liệu + định lượng từ mã giấy, ví dụ "C150_65x86_…" → { prefix: 'C', gsm: 150 } */
export function parsePaperCode(code: string): { prefix: string; gsm: number } | null {
  const m = /^([A-Za-z]+)(\d+)/.exec(code.trim());
  return m ? { prefix: m[1].toUpperCase(), gsm: Number(m[2]) } : null;
}

const baseKemGiayCode = (code: string) => code.split('_')[0].toUpperCase();

export function resolveKemGiay(
  input: Pick<CalculationInput, 'kemGiayCode'>,
  paper: PaperType,
  list: DigitalPrintKemGiay[]
): { entries: DigitalPrintKemGiay[]; warning?: string } {
  if (list.length === 0) throw new QuoteError('Chưa có bảng giá in nhanh kèm giấy (INTC).');

  if (input.kemGiayCode) {
    const base = baseKemGiayCode(input.kemGiayCode);
    const entries = list.filter((e) => baseKemGiayCode(e.paperCode) === base);
    if (entries.length === 0) throw new QuoteError(`Mã giấy INTC "${input.kemGiayCode}" không có trong bảng giá.`);
    return { entries };
  }

  const key = parsePaperCode(paper.code);
  if (!key) throw new QuoteError(`Không nhận diện được loại giấy "${paper.code}" để khớp bảng giá INTC – hãy chọn mã giấy INTC.`);

  const sameMaterial = list.filter((e) => parsePaperCode(e.paperCode)?.prefix === key.prefix);
  if (sameMaterial.length === 0) {
    throw new QuoteError(`Bảng giá INTC không có loại giấy nhóm "${key.prefix}" (${paper.name}).`);
  }
  const exact = sameMaterial.filter((e) => e.gsm === key.gsm);
  if (exact.length > 0) return { entries: exact };

  const nearestGsm = sameMaterial.reduce((a, b) => (Math.abs(b.gsm - key.gsm) < Math.abs(a.gsm - key.gsm) ? b : a)).gsm;
  const entries = sameMaterial.filter((e) => e.gsm === nearestGsm);
  return {
    entries,
    warning: `Bảng giá INTC không có ${key.prefix}${key.gsm} – tạm tính theo ${key.prefix}${nearestGsm} gần nhất.`,
  };
}

function evaluateDigitalWithPaper(input: CalculationInput, ctx: PricingContext, facts: JobFacts): Candidate {
  const { entries, warning } = resolveKemGiay(input, ctx.paper, ctx.kemGiay);
  let best: Candidate | null = null;

  for (const e of entries) {
    const rate = facts.twoSided ? e.price2Side : e.price1Side;
    if (!(rate > 0)) continue;
    const layout = layoutOnSheet({
      sheetW: e.widthMm,
      sheetH: e.heightMm,
      itemW: input.widthMm,
      itemH: input.heightMm,
      outerBleed: 0,
      gap: facts.gap,
      gripper: DIGITAL_MARGIN_MM,
      side: DIGITAL_MARGIN_MM,
      tail: DIGITAL_MARGIN_MM,
    });
    if (layout.ups === 0) continue;

    const net = Math.ceil(facts.printUnits / layout.ups);
    const total = net; // In nhanh: không bù hao
    const shortRunFee = shortRunFeeFor(total);
    const printRunCost = total * rate;
    const fin = finishingCosts(input, facts, net);
    const sheetLabel = `${layout.sheetW} × ${layout.sheetH} mm`;

    const cand: Candidate = {
      tech: 'digital',
      imposition: makeImposition(
        layout,
        `Phôi INTC ${sheetLabel}`,
        { widthCm: layout.sheetW / 10, heightCm: layout.sheetH / 10, name: `Phôi INTC ${e.paperName} (${sheetLabel})` },
        1,
        buildPreCutScheme(layout.sheetW, layout.sheetH, e.paperName),
        { gripper: DIGITAL_MARGIN_MM, side: DIGITAL_MARGIN_MM, tail: DIGITAL_MARGIN_MM },
        facts
      ),
      quantities: {
        productQty: input.quantity,
        printUnits: facts.printUnits,
        netPrintSheets: net,
        printWasteSheets: 0,
        finishingWasteSheets: 0,
        totalPrintSheets: total,
        parentSheetsNeeded: total,
        ramsNeeded: Math.round((total / 500) * 100) / 100,
        kgNeeded: kgFor(total, layout.sheetW, layout.sheetH, e.gsm),
        impressions: total * (facts.twoSided ? 2 : 1),
      },
      printing: {
        machineName: 'In nhanh kèm giấy (INTC)',
        sheetName: `${e.paperCode} – ${sheetLabel}`,
        passes: 1,
        platesCount: 0,
        ratePerSheet: rate,
        lines: [
          {
            label: `In ${facts.twoSided ? '2' : '1'} mặt + giấy ${e.paperName}`,
            amount: printRunCost,
            note: `${vnd(total)} tờ × ${vnd(rate)}đ (đã gồm giấy, không bù hao)`,
          },
          ...(shortRunFee > 0 ? [{ label: 'Phụ phí số lượng ít', amount: shortRunFee, note: `${vnd(total)} tờ < 100 tờ` }] : []),
        ],
      },
      paperCost: 0,
      paperNote: 'Đã gồm trong đơn giá in kèm giấy',
      plateCost: 0,
      printRunCost,
      shortRunFee,
      whiteInkCost: 0,
      finishingCost: fin.total,
      finishingDetails: fin.details,
      baseCost: printRunCost + shortRunFee + fin.total,
      warnings: warning ? [warning] : [],
    };
    if (better(best, cand)) best = cand;
  }

  if (!best) {
    throw new QuoteError(`Thành phẩm ${input.widthMm} × ${input.heightMm} mm không vừa phôi in nhanh kèm giấy.`);
  }
  if (input.whiteInk) best.warnings.push('In mực trắng chỉ áp dụng cho in gia công Konica – bỏ qua với in kèm giấy.');
  return best;
}

// -----------------------------------------------------------------------------
// IN GIA CÔNG KONICA (giấy rời)
// -----------------------------------------------------------------------------

export function detectMaterial(paper: Pick<PaperType, 'name' | 'code'>): DigitalMaterial {
  const n = `${paper.name} ${paper.code}`.toLowerCase();
  if (n.includes('pvc')) return 'pvc';
  if (n.includes('decal') && n.includes('trong')) return 'decal_clear';
  if (n.includes('decal')) return 'decal';
  if (n.includes('nhựa') || n.includes('synthetic') || n.includes('yupo')) return 'synthetic';
  return 'paper';
}

export function giaCongRate(row: DigitalPrintGiaCong, material: DigitalMaterial, gsm: number): number {
  switch (material) {
    case 'decal':
      return row.decalPaperPlastic;
    case 'decal_clear':
      return row.decalClear;
    case 'synthetic':
      return row.syntheticPaper;
    case 'pvc':
      return row.pvcPlastic;
    default:
      if (gsm < 250) return row.paperLt249;
      if (gsm < 350) return row.paper250To349;
      if (gsm <= 450) return row.paper350To450;
      return 0;
  }
}

function evaluateDigitalGiaCong(input: CalculationInput, ctx: PricingContext, facts: JobFacts): Candidate {
  if (ctx.giaCong.length === 0) throw new QuoteError('Chưa có bảng giá in gia công Konica.');
  const paper = ctx.paper;
  const material = input.digitalMaterial ?? detectMaterial(paper);
  const PW = Math.max(paper.parentWidthCm, paper.parentHeightCm) * 10;
  const PH = Math.min(paper.parentWidthCm, paper.parentHeightCm) * 10;
  const sides = facts.twoSided ? 2 : 1;
  let best: Candidate | null = null;

  for (const row of ctx.giaCong) {
    const rate1 = giaCongRate(row, material, paper.gsm);
    if (!(rate1 > 0)) continue;

    const layout = layoutOnSheet({
      sheetW: row.widthMm,
      sheetH: row.heightMm,
      itemW: input.widthMm,
      itemH: input.heightMm,
      outerBleed: 0,
      gap: facts.gap,
      gripper: DIGITAL_MARGIN_MM,
      side: DIGITAL_MARGIN_MM,
      tail: DIGITAL_MARGIN_MM,
    });
    if (layout.ups === 0) continue;

    const cuts = input.customerSuppliedPaper ? 1 : piecesFromParent(PW, PH, layout.sheetW, layout.sheetH);
    if (cuts === 0) continue; // khổ máy lớn hơn khổ giấy mẹ

    const net = Math.ceil(facts.printUnits / layout.ups);
    const total = net;
    const parentSheets = Math.ceil(total / cuts);
    const rate = rate1 * sides;
    const printRunCost = total * rate;
    const whiteInkCost = input.whiteInk ? total * WHITE_INK_PER_SIDE * sides : 0;
    const shortRunFee = shortRunFeeFor(total);
    const paperPart = input.customerSuppliedPaper ? { cost: 0, note: 'Khách cấp giấy' } : paperCostFor(parentSheets, paper);
    const fin = finishingCosts(input, facts, net);
    const sheetLabel = `${row.sheetSize} (${layout.sheetW} × ${layout.sheetH} mm)`;

    const lines: PrintCostLine[] = [
      {
        label: `In ${sides} mặt – ${DIGITAL_MATERIAL_LABELS[material]}`,
        amount: printRunCost,
        note: `${vnd(total)} tờ × ${vnd(rate)}đ${sides === 2 ? ` (${vnd(rate1)}đ × 2 mặt)` : ''}`,
      },
    ];
    if (whiteInkCost > 0) lines.push({ label: 'Mực trắng', amount: whiteInkCost, note: `${vnd(total)} tờ × ${vnd(WHITE_INK_PER_SIDE * sides)}đ` });
    if (shortRunFee > 0) lines.push({ label: 'Phụ phí số lượng ít', amount: shortRunFee, note: `${vnd(total)} tờ < 100 tờ` });

    const cand: Candidate = {
      tech: 'digital',
      imposition: makeImposition(
        layout,
        `Khổ Konica ${sheetLabel}`,
        input.customerSuppliedPaper
          ? { widthCm: layout.sheetW / 10, heightCm: layout.sheetH / 10, name: `Giấy khách cấp (${layout.sheetW} × ${layout.sheetH} mm)` }
          : { widthCm: paper.parentWidthCm, heightCm: paper.parentHeightCm, name: paper.name },
        cuts,
        input.customerSuppliedPaper
          ? buildPreCutScheme(layout.sheetW, layout.sheetH, 'giấy khách cấp')
          : buildCutScheme(PW, PH, layout.sheetW, layout.sheetH),
        { gripper: DIGITAL_MARGIN_MM, side: DIGITAL_MARGIN_MM, tail: DIGITAL_MARGIN_MM },
        facts
      ),
      quantities: {
        productQty: input.quantity,
        printUnits: facts.printUnits,
        netPrintSheets: net,
        printWasteSheets: 0,
        finishingWasteSheets: 0,
        totalPrintSheets: total,
        parentSheetsNeeded: parentSheets,
        ramsNeeded: Math.round((parentSheets / 500) * 100) / 100,
        kgNeeded: input.customerSuppliedPaper ? 0 : kgFor(parentSheets, PW, PH, paper.gsm),
        impressions: total * sides,
      },
      printing: {
        machineName: row.machineName || 'Konica C12000',
        sheetName: sheetLabel,
        passes: 1,
        platesCount: 0,
        ratePerSheet: rate,
        lines,
      },
      paperCost: paperPart.cost,
      paperNote: paperPart.note,
      plateCost: 0,
      printRunCost,
      shortRunFee,
      whiteInkCost,
      finishingCost: fin.total,
      finishingDetails: fin.details,
      baseCost: paperPart.cost + printRunCost + whiteInkCost + shortRunFee + fin.total,
      warnings: [],
    };
    if (better(best, cand)) best = cand;
  }

  if (!best) {
    throw new QuoteError(
      `Không có khổ in Konica phù hợp cho thành phẩm ${input.widthMm} × ${input.heightMm} mm với chất liệu "${DIGITAL_MATERIAL_LABELS[material]}" (${paper.gsm}gsm).`
    );
  }
  return best;
}

// -----------------------------------------------------------------------------
// Tổng hợp
// -----------------------------------------------------------------------------

function evaluateTech(tech: ChosenTech, input: CalculationInput, ctx: PricingContext): Candidate {
  const facts = jobFacts(input, ctx);
  const cand =
    tech === 'offset'
      ? evaluateOffset(input, ctx, facts)
      : input.digitalMode === 'without_paper'
        ? evaluateDigitalGiaCong(input, ctx, facts)
        : evaluateDigitalWithPaper(input, ctx, facts);
  cand.warnings = [...facts.warnings, ...cand.warnings];
  return cand;
}

function totals(input: CalculationInput, baseCost: number) {
  const profitAmount = Math.round((baseCost * input.profitMarginPercent) / 100);
  const discountAmount = Math.min(Math.max(0, input.discountAmount), baseCost + profitAmount);
  const preTaxTotal = baseCost + profitAmount - discountAmount;
  const vatAmount = Math.round((preTaxTotal * input.vatPercent) / 100);
  const finalPrice = preTaxTotal + vatAmount;
  return {
    profitAmount,
    discountAmount,
    preTaxTotal,
    vatAmount,
    finalPrice,
    unitPrice: input.quantity > 0 ? Math.round(finalPrice / input.quantity) : 0,
  };
}

type TechOutcome = { ok: true; cand: Candidate; finalPrice: number } | { ok: false; error: string };

function tryTech(tech: ChosenTech, input: CalculationInput, ctx: PricingContext): TechOutcome {
  try {
    const cand = evaluateTech(tech, input, ctx);
    return { ok: true, cand, finalPrice: totals(input, cand.baseCost).finalPrice };
  } catch (err) {
    if (err instanceof QuoteError) return { ok: false, error: err.message };
    throw err;
  }
}

function priceAt(input: CalculationInput, ctx: PricingContext, quantity: number) {
  const q = { ...input, quantity };
  const d = tryTech('digital', q, ctx);
  const o = tryTech('offset', q, ctx);
  return { d: d.ok ? d.finalPrice : null, o: o.ok ? o.finalPrice : null };
}

function findBreakEven(input: CalculationInput, ctx: PricingContext, table: ComparisonItem[]): number | null {
  for (let i = 1; i < table.length; i++) {
    const prev = table[i - 1];
    const cur = table[i];
    if (prev.recommended !== 'digital' || cur.recommended !== 'offset') continue;
    // Tìm nhị phân điểm giao giữa 2 mốc
    let lo = prev.quantity;
    let hi = cur.quantity;
    for (let iter = 0; iter < 16 && hi - lo > Math.max(1, Math.round(lo * 0.01)); iter++) {
      const mid = Math.round((lo + hi) / 2);
      const p = priceAt(input, ctx, mid);
      if (p.d !== null && p.o !== null && p.o <= p.d) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return null;
}

export interface QuoteOptions {
  /** Tính bảng so sánh & điểm hoà vốn (mặc định true) */
  compare?: boolean;
}

export function calculateQuote(input: CalculationInput, ctx: PricingContext, options: QuoteOptions = {}): CalculationResult {
  const compare = options.compare ?? true;
  const digital = tryTech('digital', input, ctx);
  const offset = tryTech('offset', input, ctx);

  let chosen: Candidate;
  if (input.printTech === 'offset') {
    if (!offset.ok) throw new QuoteError(offset.error);
    chosen = offset.cand;
  } else if (input.printTech === 'digital') {
    if (!digital.ok) throw new QuoteError(digital.error);
    chosen = digital.cand;
  } else if (digital.ok && offset.ok) {
    chosen = digital.finalPrice <= offset.finalPrice ? digital.cand : offset.cand;
  } else if (digital.ok) {
    chosen = digital.cand;
  } else if (offset.ok) {
    chosen = offset.cand;
  } else {
    throw new QuoteError(`Không tính được giá. Offset: ${offset.error} In nhanh: ${digital.error}`);
  }

  const t = totals(input, chosen.baseCost);

  // Bảng so sánh
  const comparisonTable: ComparisonItem[] = [];
  let breakEvenQty: number | null = null;
  if (compare) {
    const qtys = [...new Set([...COMPARISON_QUANTITIES, input.quantity])].sort((a, b) => a - b);
    for (const q of qtys) {
      const p = q === input.quantity
        ? { d: digital.ok ? digital.finalPrice : null, o: offset.ok ? offset.finalPrice : null }
        : priceAt(input, ctx, q);
      comparisonTable.push({
        quantity: q,
        digitalTotal: p.d,
        digitalUnit: p.d !== null ? Math.round(p.d / q) : null,
        offsetTotal: p.o,
        offsetUnit: p.o !== null ? Math.round(p.o / q) : null,
        recommended: p.d === null && p.o === null ? null : p.o === null || (p.d !== null && p.d <= p.o) ? 'digital' : 'offset',
      });
    }
    breakEvenQty = findBreakEven(input, ctx, comparisonTable);
  }

  const qtyText = `${input.quantity.toLocaleString('vi-VN')} sản phẩm`;
  let bestTech: ChosenTech | null = null;
  let reason = '';
  if (digital.ok && offset.ok) {
    const diff = Math.abs(digital.finalPrice - offset.finalPrice);
    if (digital.finalPrice <= offset.finalPrice) {
      bestTech = 'digital';
      const pct = offset.finalPrice > 0 ? Math.round((diff / offset.finalPrice) * 100) : 0;
      reason = `Với ${qtyText}, in nhanh rẻ hơn offset ${vnd(diff)}đ (${pct}%) – không tốn kẽm, mở máy, lấy nhanh.`;
    } else {
      bestTech = 'offset';
      const pct = digital.finalPrice > 0 ? Math.round((diff / digital.finalPrice) * 100) : 0;
      reason = `Với ${qtyText}, in offset rẻ hơn in nhanh ${vnd(diff)}đ (${pct}%) – giá đơn vị giảm mạnh theo số lượng.`;
    }
  } else if (digital.ok) {
    bestTech = 'digital';
    reason = `Chỉ in nhanh khả thi. Offset: ${!offset.ok ? offset.error : ''}`;
  } else if (offset.ok) {
    bestTech = 'offset';
    reason = `Chỉ in offset khả thi. In nhanh: ${!digital.ok ? digital.error : ''}`;
  }

  return {
    chosenTech: chosen.tech,
    imposition: chosen.imposition,
    quantities: chosen.quantities,
    printing: chosen.printing,
    costs: {
      paperCost: chosen.paperCost,
      paperNote: chosen.paperNote,
      plateCost: chosen.plateCost,
      printRunCost: chosen.printRunCost,
      shortRunFee: chosen.shortRunFee,
      whiteInkCost: chosen.whiteInkCost,
      totalPrintCost: chosen.plateCost + chosen.printRunCost + chosen.shortRunFee + chosen.whiteInkCost,
      finishingCost: chosen.finishingCost,
      finishingDetails: chosen.finishingDetails,
      totalBaseCost: chosen.baseCost,
      profitMarginPercent: input.profitMarginPercent,
      profitAmount: t.profitAmount,
      discountAmount: t.discountAmount,
      preTaxTotal: t.preTaxTotal,
      vatPercent: input.vatPercent,
      vatAmount: t.vatAmount,
      finalPrice: t.finalPrice,
      unitPrice: t.unitPrice,
    },
    warnings: chosen.warnings,
    recommendation: {
      bestTech,
      reason,
      digitalTotal: digital.ok ? digital.finalPrice : null,
      offsetTotal: offset.ok ? offset.finalPrice : null,
      digitalError: digital.ok ? undefined : digital.error,
      offsetError: offset.ok ? undefined : offset.error,
      breakEvenQty,
      comparisonTable,
    },
  };
}
