// =============================================================================
// PrintCal – kiểu dữ liệu dùng chung giữa engine, API và giao diện
// =============================================================================

export type PrintTech = 'offset' | 'digital' | 'auto';
export type ChosenTech = 'offset' | 'digital';
export type ProductType = 'to_roi' | 'namecard' | 'catalogue' | 'hop_giay' | 'tui_giay' | 'decal' | 'khac';
/** Tự trở (work & turn) | In 2 bài (sheetwise) | Trở nhíp (work & tumble) */
export type OffsetWorkType = 'self_turn' | 'sheetwise' | 'tumble';
export type PrintSides = '1_side' | '2_side';
export type OrderStatus = 'quote' | 'approved' | 'printing' | 'finishing' | 'completed' | 'delivered' | 'cancelled';
/** with_paper: In nhanh kèm giấy (INTC) – without_paper: In gia công Konica (giấy rời) */
export type DigitalMode = 'with_paper' | 'without_paper';
/** Nhóm chất liệu của bảng giá in gia công Konica */
export type DigitalMaterial = 'paper' | 'decal' | 'decal_clear' | 'synthetic' | 'pvc';

export type FinishingCategory = 'can_mang' | 'can_gap' | 'be' | 'ep_kim' | 'phu_uv' | 'dong_cuon' | 'dan' | 'khac';
export type FinishingCalcType = 'per_m2' | 'per_sheet' | 'per_product' | 'fixed' | 'die_cut';

// -----------------------------------------------------------------------------
// Dữ liệu danh mục
// -----------------------------------------------------------------------------

export interface PaperType {
  id: number;
  code: string;
  name: string;
  gsm: number;
  parentWidthCm: number;
  parentHeightCm: number;
  /** Giá 1 ram (500 tờ) khi mua từ 500 tờ trở lên */
  priceAbove500: number;
  /** Giá 1 ram (500 tờ) khi mua lẻ dưới 500 tờ */
  priceBelow500: number;
  supplier: string;
  description: string;
  isActive: boolean;
}

export interface OffsetMachine {
  id: number;
  name: string;
  /** Khổ tờ in lớn nhất (mm) */
  maxWidthMm: number;
  maxHeightMm: number;
  /** Khổ tờ in nhỏ nhất (mm) */
  minWidthMm: number;
  minHeightMm: number;
  /** Giá 1 lá kẽm CTP */
  platePrice: number;
  /** Giá trọn gói 1 lần mở máy (đến baseImpressions lượt) */
  setupCost: number;
  /** Đơn giá mỗi 1.000 lượt vượt gói */
  stepCost: number;
  /** Bù hao canh màu mỗi lần lên máy */
  defaultWasteSheets: number;
  /** Lề kẹp nhíp */
  gripperMarginMm: number;
  /** Số lượt in trong gói mở máy */
  baseImpressions: number;
  /** Gói mở máy đã gồm 4 kẽm (CMYK) cho mỗi lần lên máy */
  includesPlate: boolean;
}

export interface DigitalPrintGiaCong {
  id: number;
  machineName: string;
  sheetSize: string;
  widthMm: number;
  heightMm: number;
  paperLt249: number;
  paper250To349: number;
  paper350To450: number;
  decalPaperPlastic: number;
  decalClear: number;
  syntheticPaper: number;
  pvcPlastic: number;
}

export interface DigitalPrintKemGiay {
  id: number;
  paperCode: string;
  paperName: string;
  gsm: number;
  sheetSize: string;
  widthMm: number;
  heightMm: number;
  price1Side: number;
  price2Side: number;
}

export interface FinishingService {
  id: number;
  code: string;
  name: string;
  category: FinishingCategory;
  calcType: FinishingCalcType;
  unitPrice: number;
  /** Thành tiền tối thiểu (chưa gồm tiền khuôn) */
  minPrice: number;
  /** Tiền làm khuôn / phí cố định thêm */
  setupFee: number;
  /** % bù hao trên số tờ in (chỉ áp dụng offset) */
  wastePercent: number;
  /** Số tờ bù hao cố định (chỉ áp dụng offset) */
  wasteSheets: number;
  isActive: boolean;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface SystemSetting {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  bankAccount: string;
  bankName: string;
  quoteFooterNote: string;
  defaultProfitMargin: number;
  defaultVatPercent: number;
}

// -----------------------------------------------------------------------------
// Đầu vào tính giá
// -----------------------------------------------------------------------------

export interface SelectedFinishing {
  serviceId: number;
  /** Số mặt (cán màng, phủ UV…) – mặc định 1 */
  sides?: 1 | 2;
}

export interface CalculationInput {
  jobName: string;
  productType: ProductType;
  printTech: PrintTech;
  /** Số lượng thành phẩm (cái / cuốn / hộp) */
  quantity: number;
  /** Kích thước thành phẩm (mm) */
  widthMm: number;
  heightMm: number;
  /** Số trang mỗi cuốn (chỉ dùng cho catalogue, mỗi tờ = 2 trang) */
  pages: number;
  bleedMm: number;
  paperTypeId: number;
  printSides: PrintSides;
  colorsFront: number;
  colorsBack: number;
  offsetWorkType: OffsetWorkType;
  /** 0 / undefined = tự chọn máy rẻ nhất */
  offsetMachineId?: number;
  digitalMode: DigitalMode;
  /** Mã giấy INTC (in kèm giấy). Bỏ trống = tự khớp theo giấy đã chọn */
  kemGiayCode?: string;
  /** Nhóm chất liệu in gia công. Bỏ trống = tự nhận diện theo tên giấy */
  digitalMaterial?: DigitalMaterial;
  customerSuppliedPaper: boolean;
  whiteInk: boolean;
  selectedFinishing: SelectedFinishing[];
  profitMarginPercent: number;
  discountAmount: number;
  vatPercent: number;
}

// -----------------------------------------------------------------------------
// Kết quả bình trang
// -----------------------------------------------------------------------------

export interface PaperCutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'vertical' | 'horizontal';
  label?: string;
}

export interface PaperCutBlock {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

export interface PaperCutScheme {
  parentWidthMm: number;
  parentHeightMm: number;
  cutDescription: string;
  cutsCount: number;
  cutSheetWidthMm: number;
  cutSheetHeightMm: number;
  blocks: PaperCutBlock[];
  cutLines: PaperCutLine[];
  wasteAreaPercent: number;
  /** Phôi cắt sẵn (in kèm giấy) – không xả từ khổ mẹ */
  preCut: boolean;
}

export interface BoxCoordinate {
  index: number;
  /** Toạ độ vùng thành phẩm (đã xén) trên tờ in, mm */
  x: number;
  y: number;
  w: number;
  h: number;
  isRotated: boolean;
}

export interface ImpositionResult {
  parentSheet: { widthCm: number; heightCm: number; name: string };
  printSheet: { widthMm: number; heightMm: number; name: string };
  upsPerPrintSheet: number;
  cutsPerParentSheet: number;
  totalUpsPerParentSheet: number;
  gripperMarginMm: number;
  sideMarginMm: number;
  tailMarginMm: number;
  bleedMm: number;
  /** Khoảng cách giữa các con (mm) – 0 = xén chung dao */
  gapMm: number;
  boxes: BoxCoordinate[];
  sheetEfficiencyPercent: number;
  cutScheme: PaperCutScheme;
}

// -----------------------------------------------------------------------------
// Kết quả tính giá
// -----------------------------------------------------------------------------

export interface FinishingCostDetail {
  serviceId: number;
  name: string;
  category: FinishingCategory;
  calcType: FinishingCalcType;
  sides: number;
  quantity: number;
  unit: string;
  unitPrice: number;
  setupFee: number;
  subtotal: number;
  formula: string;
}

export interface ComparisonItem {
  quantity: number;
  digitalTotal: number | null;
  digitalUnit: number | null;
  offsetTotal: number | null;
  offsetUnit: number | null;
  recommended: ChosenTech | null;
}

export interface PrintCostLine {
  label: string;
  amount: number;
  note?: string;
}

export interface CalculationResult {
  chosenTech: ChosenTech;
  imposition: ImpositionResult;
  quantities: {
    productQty: number;
    /** Số tờ thành phẩm cần in (catalogue = số cuốn × số tờ/cuốn) */
    printUnits: number;
    netPrintSheets: number;
    printWasteSheets: number;
    finishingWasteSheets: number;
    totalPrintSheets: number;
    parentSheetsNeeded: number;
    ramsNeeded: number;
    kgNeeded: number;
    impressions: number;
  };
  printing: {
    machineId?: number;
    machineName: string;
    sheetName: string;
    workType?: OffsetWorkType;
    passes: number;
    platesCount: number;
    ratePerSheet?: number;
    lines: PrintCostLine[];
  };
  costs: {
    paperCost: number;
    paperNote: string;
    plateCost: number;
    printRunCost: number;
    shortRunFee: number;
    whiteInkCost: number;
    totalPrintCost: number;
    finishingCost: number;
    finishingDetails: FinishingCostDetail[];
    totalBaseCost: number;
    profitMarginPercent: number;
    profitAmount: number;
    discountAmount: number;
    preTaxTotal: number;
    vatPercent: number;
    vatAmount: number;
    finalPrice: number;
    unitPrice: number;
  };
  warnings: string[];
  recommendation: {
    bestTech: ChosenTech | null;
    reason: string;
    digitalTotal: number | null;
    offsetTotal: number | null;
    digitalError?: string;
    offsetError?: string;
    breakEvenQty: number | null;
    comparisonTable: ComparisonItem[];
  };
}

// -----------------------------------------------------------------------------
// Đơn hàng / báo giá
// -----------------------------------------------------------------------------

export interface OrderSpec {
  input: CalculationInput;
  result: CalculationResult;
  paper: { id: number; code: string; name: string; gsm: number };
}

export interface QuoteOrder {
  id: number;
  code: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerCompany: string;
  jobName: string;
  productType: ProductType;
  printTech: ChosenTech;
  quantity: number;
  widthMm: number;
  heightMm: number;
  pages: number;
  paperName: string;
  paperGsm: number;
  parentSize: string;
  printSize: string;
  upsPerSheet: number;
  totalPrintSheets: number;
  totalParentSheets: number;
  paperCost: number;
  printCost: number;
  finishingCost: number;
  totalCost: number;
  profitMarginPercent: number;
  profitAmount: number;
  discountAmount: number;
  vatPercent: number;
  vatAmount: number;
  finalPrice: number;
  unitPrice: number;
  status: OrderStatus;
  notes: string;
  spec: OrderSpec | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  input: CalculationInput;
  customer: {
    id?: number | null;
    name: string;
    phone: string;
    email?: string;
    company?: string;
  };
  notes?: string;
}
