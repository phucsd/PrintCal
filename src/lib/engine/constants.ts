// =============================================================================
// Hằng số nghiệp vụ dùng chung (engine + giao diện)
// =============================================================================

import type { DigitalMaterial, FinishingCalcType, FinishingCategory, OffsetWorkType, OrderStatus, ProductType } from '@/types';

/** Lề tờ in offset (ngoài lề nhíp) */
export const OFFSET_SIDE_MARGIN_MM = 4;
export const OFFSET_TAIL_MARGIN_MM = 4;
/** Lề không in được của máy in nhanh (4 mép) */
export const DIGITAL_MARGIN_MM = 2.5;

/** Số kẽm đã gồm trong gói mở máy (1 bộ CMYK) cho mỗi lần lên máy */
export const PLATES_INCLUDED_PER_PASS = 4;

/** Phụ phí số lượng ít cho in nhanh (theo tổng số tờ in) */
export const DIGITAL_SHORT_RUN_FEES: { below: number; fee: number }[] = [
  { below: 50, fee: 30000 },
  { below: 100, fee: 20000 },
];

/** Đơn giá in mực trắng Konica (mỗi mặt / tờ) */
export const WHITE_INK_PER_SIDE = 2000;

/** Các mốc số lượng dùng cho bảng so sánh In nhanh vs Offset */
export const COMPARISON_QUANTITIES = [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  to_roi: 'Tờ rơi / Flyer',
  namecard: 'Danh thiếp',
  catalogue: 'Catalogue / Sách',
  hop_giay: 'Hộp giấy',
  tui_giay: 'Túi giấy',
  decal: 'Decal / Tem nhãn',
  khac: 'Khác',
};

export const PRODUCT_UNITS: Record<ProductType, string> = {
  to_roi: 'tờ',
  namecard: 'cái',
  catalogue: 'cuốn',
  hop_giay: 'hộp',
  tui_giay: 'túi',
  decal: 'con',
  khac: 'cái',
};

export const WORK_TYPE_LABELS: Record<OffsetWorkType, string> = {
  self_turn: 'Tự trở (1 bộ kẽm)',
  tumble: 'Trở nhíp (1 bộ kẽm)',
  sheetwise: 'In 2 bài (2 bộ kẽm)',
};

export const DIGITAL_MATERIAL_LABELS: Record<DigitalMaterial, string> = {
  paper: 'Giấy thường',
  decal: 'Decal giấy / nhựa',
  decal_clear: 'Decal trong',
  synthetic: 'Giấy nhựa (< 280gsm)',
  pvc: 'Nhựa PVC',
};

export const FINISHING_CATEGORY_LABELS: Record<FinishingCategory, string> = {
  can_mang: 'Cán màng',
  can_gap: 'Cấn & gấp',
  be: 'Bế',
  ep_kim: 'Ép kim & dập nổi',
  phu_uv: 'Phủ UV',
  dong_cuon: 'Đóng cuốn',
  dan: 'Dán',
  khac: 'Khác',
};

export const FINISHING_CALC_LABELS: Record<FinishingCalcType, string> = {
  per_m2: 'Theo m²',
  per_sheet: 'Theo tờ in',
  per_product: 'Theo sản phẩm',
  die_cut: 'Khuôn + công bế',
  fixed: 'Trọn gói',
};

export const ORDER_STATUS_FLOW: OrderStatus[] = ['quote', 'approved', 'printing', 'finishing', 'completed', 'delivered'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  quote: 'Báo giá',
  approved: 'Đã duyệt / cọc',
  printing: 'Đang in',
  finishing: 'Gia công',
  completed: 'Hoàn thành',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
};
