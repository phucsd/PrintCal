import type {
  CalculationInput,
  Customer,
  DigitalPrintGiaCong,
  DigitalPrintKemGiay,
  FinishingService,
  OffsetMachine,
  OrderSpec,
  PaperType,
  QuoteOrder,
  SystemSetting,
} from '@/types';

export interface MasterData {
  papers: PaperType[];
  offsetMachines: OffsetMachine[];
  giaCong: DigitalPrintGiaCong[];
  kemGiay: DigitalPrintKemGiay[];
  finishing: FinishingService[];
  customers: (Customer & { orderCount?: number; totalRevenue?: number })[];
  settings: SystemSetting;
  orderCount: number;
}

export interface CustomerFields {
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerCompany: string;
  notes: string;
}

export type CalculatorForm = CalculationInput & CustomerFields;

export interface LoadRequest {
  form: CalculatorForm;
  nonce: number;
  sourceCode?: string;
}

export function defaultForm(master: MasterData): CalculatorForm {
  return {
    jobName: 'Tờ rơi A4',
    productType: 'to_roi',
    printTech: 'auto',
    quantity: 1000,
    widthMm: 210,
    heightMm: 297,
    pages: 8,
    bleedMm: 2,
    paperTypeId: pickPaper(master.papers, 'C', 150)?.id ?? 0,
    printSides: '2_side',
    colorsFront: 4,
    colorsBack: 4,
    offsetWorkType: 'self_turn',
    offsetMachineId: undefined,
    digitalMode: 'with_paper',
    kemGiayCode: undefined,
    digitalMaterial: undefined,
    customerSuppliedPaper: false,
    whiteInk: false,
    selectedFinishing: [],
    profitMarginPercent: master.settings.defaultProfitMargin,
    discountAmount: 0,
    vatPercent: master.settings.defaultVatPercent,
    customerId: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerCompany: '',
    notes: '',
  };
}

/** Tìm giấy cùng nhóm (C/I/F/B/D) có định lượng gần nhất, ưu tiên khổ 65×86 và đang sử dụng */
export function pickPaper(papers: PaperType[], prefix: string, gsm: number): PaperType | undefined {
  const pool = papers.filter((p) => p.isActive && p.code.toUpperCase().startsWith(prefix.toUpperCase()) && /^\D+\d/.test(p.code));
  const list = pool.length > 0 ? pool : papers.filter((p) => p.isActive);
  let best: PaperType | undefined;
  let bestScore = Infinity;
  for (const p of list) {
    const is6586 = (p.parentWidthCm === 65 && p.parentHeightCm === 86) || (p.parentWidthCm === 86 && p.parentHeightCm === 65);
    const score = Math.abs(p.gsm - gsm) * 10 + (is6586 ? 0 : 1);
    if (score < bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ?? papers[0];
}

function matchPaperForOrder(order: QuoteOrder, papers: PaperType[]): PaperType | undefined {
  const exact = papers.find((p) => p.name === order.paperName && p.gsm === order.paperGsm);
  if (exact) return exact;
  const n = order.paperName.toLowerCase();
  const prefix = n.includes('ivory') ? 'I' : n.includes('fort') || n.includes('ford') ? 'F' : n.includes('bristol') ? 'B' : n.includes('duplex') ? 'D' : 'C';
  return pickPaper(papers, prefix, order.paperGsm);
}

/** Khôi phục form máy tính từ đơn hàng đã lưu (hỗ trợ cả đơn cũ chưa có spec_json) */
export function formFromOrder(order: QuoteOrder, master: MasterData): CalculatorForm {
  const base = defaultForm(master);
  const customerPatch: CustomerFields = {
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerCompany: order.customerCompany,
    notes: order.notes,
  };
  if (order.spec) {
    return {
      ...base,
      ...order.spec.input,
      ...customerPatch,
    };
  }
  const matched = matchPaperForOrder(order, master.papers);
  return {
    ...base,
    jobName: order.jobName,
    productType: order.productType,
    printTech: order.printTech,
    quantity: order.quantity,
    widthMm: order.widthMm,
    heightMm: order.heightMm,
    pages: Math.max(2, order.pages || 2),
    paperTypeId: matched?.id ?? base.paperTypeId,
    printSides: order.pages === 1 ? '1_side' : '2_side',
    profitMarginPercent: order.profitMarginPercent,
    discountAmount: order.discountAmount,
    vatPercent: order.vatPercent,
    ...customerPatch,
  };
}

/** Dựng OrderSpec từ đơn hàng (dùng spec đã lưu, hoặc tổng hợp lại cho đơn cũ chưa có spec_json) */
export function specFromOrder(order: QuoteOrder): OrderSpec {
  if (order.spec) return order.spec;

  const sizeMatch = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(order.printSize);
  const printW = sizeMatch ? Math.max(Number(sizeMatch[1]), Number(sizeMatch[2])) : 650;
  const printH = sizeMatch ? Math.min(Number(sizeMatch[1]), Number(sizeMatch[2])) : 430;
  const parentMatch = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(order.parentSize);
  const parentWcm = parentMatch ? Number(parentMatch[1]) : 65;
  const parentHcm = parentMatch ? Number(parentMatch[2]) : 86;

  const ups = Math.max(1, order.upsPerSheet);
  const netSheets = Math.ceil(order.quantity / ups);
  const wasteSheets = Math.max(0, order.totalPrintSheets - netSheets);
  const cuts = order.totalParentSheets > 0 ? Math.max(1, Math.round(order.totalPrintSheets / order.totalParentSheets)) : 1;
  const preTaxTotal = Math.max(0, order.finalPrice - order.vatAmount);
  const twoSided = order.pages !== 1;
  const areaM2 = (parentWcm / 100) * (parentHcm / 100);
  const kgNeeded = Math.round(((order.totalParentSheets * areaM2 * order.paperGsm) / 1000) * 10) / 10;

  // Xếp lưới minh hoạ trên tờ in cho phiếu lệnh sản xuất
  const cols = Math.max(1, Math.round(Math.sqrt(ups * (printW / Math.max(1, printH)))));
  const rows = Math.max(1, Math.ceil(ups / cols));
  const boxW = Math.min(order.widthMm, Math.floor((printW - 20) / cols));
  const boxH = Math.min(order.heightMm, Math.floor((printH - 20) / rows));
  const startX = Math.max(4, Math.round((printW - cols * boxW) / 2));
  const startY = Math.max(4, Math.round((printH - 10 - rows * boxH) / 2));
  const boxes = Array.from({ length: ups }, (_, idx) => ({
    index: idx + 1,
    x: startX + (idx % cols) * boxW,
    y: startY + Math.floor(idx / cols) * boxH,
    w: boxW,
    h: boxH,
    isRotated: false,
  }));

  const finishingDetails =
    order.finishingCost > 0
      ? [
          {
            serviceId: 0,
            name: 'Gia công hoàn thiện sau in',
            category: 'khac' as const,
            calcType: 'fixed' as const,
            sides: 1,
            quantity: 1,
            unit: 'gói',
            unitPrice: order.finishingCost,
            setupFee: 0,
            subtotal: order.finishingCost,
            formula: 'Theo báo giá đã lưu',
          },
        ]
      : [];

  return {
    paper: { id: 0, code: '', name: order.paperName, gsm: order.paperGsm },
    input: {
      jobName: order.jobName,
      productType: order.productType,
      printTech: order.printTech,
      quantity: order.quantity,
      widthMm: order.widthMm,
      heightMm: order.heightMm,
      pages: Math.max(1, order.pages || 2),
      bleedMm: 2,
      paperTypeId: 0,
      printSides: twoSided ? '2_side' : '1_side',
      colorsFront: 4,
      colorsBack: twoSided ? 4 : 0,
      offsetWorkType: 'self_turn',
      digitalMode: 'with_paper',
      customerSuppliedPaper: false,
      whiteInk: false,
      selectedFinishing: [],
      profitMarginPercent: order.profitMarginPercent,
      discountAmount: order.discountAmount,
      vatPercent: order.vatPercent,
    },
    result: {
      chosenTech: order.printTech,
      imposition: {
        parentSheet: { widthCm: parentWcm, heightCm: parentHcm, name: order.parentSize || `${parentWcm}×${parentHcm}cm` },
        printSheet: { widthMm: printW, heightMm: printH, name: order.printSize || `${printW}×${printH}mm` },
        upsPerPrintSheet: ups,
        cutsPerParentSheet: cuts,
        totalUpsPerParentSheet: ups * cuts,
        gripperMarginMm: order.printTech === 'offset' ? 10 : 2.5,
        sideMarginMm: order.printTech === 'offset' ? 4 : 2.5,
        tailMarginMm: order.printTech === 'offset' ? 4 : 2.5,
        bleedMm: 2,
        gapMm: 0,
        boxes,
        sheetEfficiencyPercent: Math.min(99, Math.round(((ups * order.widthMm * order.heightMm) / (printW * printH)) * 1000) / 10),
        cutScheme: {
          parentWidthMm: Math.max(parentWcm, parentHcm) * 10,
          parentHeightMm: Math.min(parentWcm, parentHcm) * 10,
          cutDescription: cuts > 1 ? `Chia ${cuts} từ khổ ${order.parentSize}` : `Khổ ${order.parentSize}`,
          cutsCount: cuts,
          cutSheetWidthMm: printW,
          cutSheetHeightMm: printH,
          blocks: [{ index: 1, x: 0, y: 0, w: printW, h: printH, name: 'Tờ in #1' }],
          cutLines: [],
          wasteAreaPercent: 0,
          preCut: order.printTech === 'digital',
        },
      },
      quantities: {
        productQty: order.quantity,
        printUnits: order.quantity,
        netPrintSheets: netSheets,
        printWasteSheets: wasteSheets,
        finishingWasteSheets: 0,
        totalPrintSheets: order.totalPrintSheets,
        parentSheetsNeeded: order.totalParentSheets,
        ramsNeeded: Math.round((order.totalParentSheets / 500) * 100) / 100,
        kgNeeded,
        impressions: order.totalPrintSheets * (twoSided ? 2 : 1),
      },
      printing: {
        machineName: order.printTech === 'offset' ? 'Máy in Offset' : 'Máy in nhanh KTS',
        sheetName: order.printSize,
        workType: order.printTech === 'offset' && twoSided ? 'self_turn' : undefined,
        passes: 1,
        platesCount: order.printTech === 'offset' ? 4 : 0,
        lines: [{ label: 'Chi phí in ấn', amount: order.printCost }],
      },
      costs: {
        paperCost: order.paperCost,
        paperNote: `${order.totalParentSheets} tờ khổ mẹ`,
        plateCost: 0,
        printRunCost: order.printCost,
        shortRunFee: 0,
        whiteInkCost: 0,
        totalPrintCost: order.printCost,
        finishingCost: order.finishingCost,
        finishingDetails,
        totalBaseCost: order.totalCost,
        profitMarginPercent: order.profitMarginPercent,
        profitAmount: order.profitAmount,
        discountAmount: order.discountAmount,
        preTaxTotal,
        vatPercent: order.vatPercent,
        vatAmount: order.vatAmount,
        finalPrice: order.finalPrice,
        unitPrice: order.unitPrice,
      },
      warnings: [],
      recommendation: {
        bestTech: order.printTech,
        reason: '',
        digitalTotal: null,
        offsetTotal: null,
        breakEvenQty: null,
        comparisonTable: [],
      },
    },
  };
}

export function toCalculationInput(form: CalculatorForm): CalculationInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customerId, customerName, customerPhone, customerEmail, customerCompany, notes, ...input } = form;
  return input;
}
