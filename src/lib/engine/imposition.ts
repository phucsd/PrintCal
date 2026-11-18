// =============================================================================
// BÌNH TRANG & SƠ ĐỒ CẮT GIẤY
// -----------------------------------------------------------------------------
// Module thuần (không phụ thuộc Next/DB) để có thể chạy unit test bằng node:test.
// Quy ước toạ độ tờ in: chiều dài (W) nằm ngang, chiều ngắn (H) dọc,
// lề nhíp nằm ở mép dưới (y = H - gripper … H).
// =============================================================================

import type { BoxCoordinate, PaperCutBlock, PaperCutLine, PaperCutScheme } from '@/types';

export interface SheetLayoutOptions {
  sheetW: number;
  sheetH: number;
  /** Kích thước thành phẩm (đã xén) */
  itemW: number;
  itemH: number;
  /** Tràn lề chừa quanh cụm con (offset). In nhanh để 0 – tràn lề ăn vào lề máy */
  outerBleed: number;
  /** Khoảng cách giữa các con. 0 = xén chung dao */
  gap: number;
  gripper: number;
  side: number;
  tail: number;
  /** Bắt buộc số con chẵn (in tự trở / trở nhíp) */
  requireEven?: boolean;
}

export interface SheetLayout {
  ups: number;
  boxes: BoxCoordinate[];
  efficiency: number;
  sheetW: number;
  sheetH: number;
}

interface Block {
  cols: number;
  rows: number;
  w: number; // kích thước 1 con theo hướng của block
  h: number;
  rotated: boolean;
}

interface Arrangement {
  blocks: { block: Block; dx: number; dy: number }[];
  usedW: number;
  usedH: number;
  count: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Số con xếp được trên một chiều dài `avail` với kích thước `size` và khoảng cách `gap` */
export function fitCount(avail: number, size: number, gap: number): number {
  if (size <= 0 || avail < size) return 0;
  return Math.floor((avail + gap + 1e-9) / (size + gap));
}

const span = (n: number, size: number, gap: number) => (n > 0 ? n * size + (n - 1) * gap : 0);

function makeBlock(availW: number, availH: number, w: number, h: number, gap: number, rotated: boolean): Block {
  return { cols: fitCount(availW, w, gap), rows: fitCount(availH, h, gap), w, h, rotated };
}

/**
 * Tìm cách xếp nhiều con nhất trong vùng availW × availH:
 * lưới thẳng, lưới xoay 90°, hoặc ghép 2 khối (thẳng + xoay) chia theo chiều ngang/dọc.
 */
function bestArrangement(availW: number, availH: number, itemW: number, itemH: number, gap: number): Arrangement {
  const candidates: Arrangement[] = [];

  for (const rotated of [false, true]) {
    const w = rotated ? itemH : itemW;
    const h = rotated ? itemW : itemH;
    const b = makeBlock(availW, availH, w, h, gap, rotated);
    const count = b.cols * b.rows;
    candidates.push({
      blocks: count > 0 ? [{ block: b, dx: 0, dy: 0 }] : [],
      usedW: span(b.cols, w, gap),
      usedH: span(b.rows, h, gap),
      count,
    });
  }

  // Ghép 2 khối – chỉ nhận khi nhiều con hơn hẳn lưới đơn
  for (const firstRotated of [false, true]) {
    const w1 = firstRotated ? itemH : itemW;
    const h1 = firstRotated ? itemW : itemH;
    const w2 = h1;
    const h2 = w1;

    // Chia theo chiều ngang: khối 1 bên trái, khối 2 bên phải
    const maxCols = fitCount(availW, w1, gap);
    const rows1 = fitCount(availH, h1, gap);
    for (let c = 1; c < maxCols; c++) {
      const used1 = span(c, w1, gap);
      const rest = availW - used1 - gap;
      const b2 = makeBlock(rest, availH, w2, h2, gap, !firstRotated);
      const count = c * rows1 + b2.cols * b2.rows;
      if (b2.cols * b2.rows === 0 || rows1 === 0) continue;
      candidates.push({
        blocks: [
          { block: { cols: c, rows: rows1, w: w1, h: h1, rotated: firstRotated }, dx: 0, dy: 0 },
          { block: b2, dx: used1 + gap, dy: 0 },
        ],
        usedW: used1 + gap + span(b2.cols, w2, gap),
        usedH: Math.max(span(rows1, h1, gap), span(b2.rows, h2, gap)),
        count,
      });
    }

    // Chia theo chiều dọc: khối 1 phía trên, khối 2 phía dưới
    const maxRows = fitCount(availH, h1, gap);
    const cols1 = fitCount(availW, w1, gap);
    for (let r = 1; r < maxRows; r++) {
      const used1 = span(r, h1, gap);
      const rest = availH - used1 - gap;
      const b2 = makeBlock(availW, rest, w2, h2, gap, !firstRotated);
      const count = r * cols1 + b2.cols * b2.rows;
      if (b2.cols * b2.rows === 0 || cols1 === 0) continue;
      candidates.push({
        blocks: [
          { block: { cols: cols1, rows: r, w: w1, h: h1, rotated: firstRotated }, dx: 0, dy: 0 },
          { block: b2, dx: 0, dy: used1 + gap },
        ],
        usedW: Math.max(span(cols1, w1, gap), span(b2.cols, w2, gap)),
        usedH: used1 + gap + span(b2.rows, h2, gap),
        count,
      });
    }
  }

  // Ưu tiên nhiều con nhất, sau đó ít khối hơn (dễ xén), rồi tới hướng thẳng
  let best = candidates[0];
  for (const c of candidates) {
    if (c.count > best.count || (c.count === best.count && c.blocks.length < best.blocks.length)) best = c;
  }
  return best;
}

/** Xếp con lên một tờ in. Trả về ups = 0 nếu không vừa. */
export function layoutOnSheet(opts: SheetLayoutOptions): SheetLayout {
  const W = Math.max(opts.sheetW, opts.sheetH);
  const H = Math.min(opts.sheetW, opts.sheetH);
  const empty: SheetLayout = { ups: 0, boxes: [], efficiency: 0, sheetW: W, sheetH: H };

  const availW = W - 2 * opts.side - 2 * opts.outerBleed;
  const availH = H - opts.gripper - opts.tail - 2 * opts.outerBleed;
  if (availW <= 0 || availH <= 0 || opts.itemW <= 0 || opts.itemH <= 0) return empty;

  const arr = bestArrangement(availW, availH, opts.itemW, opts.itemH, opts.gap);
  if (arr.count === 0) return empty;

  // Căn giữa cụm con trong vùng khả dụng
  const originX = opts.side + opts.outerBleed + (availW - arr.usedW) / 2;
  const originY = opts.tail + opts.outerBleed + (availH - arr.usedH) / 2;

  let boxes: BoxCoordinate[] = [];
  let idx = 1;
  for (const { block, dx, dy } of arr.blocks) {
    for (let r = 0; r < block.rows; r++) {
      for (let c = 0; c < block.cols; c++) {
        boxes.push({
          index: idx++,
          x: round1(originX + dx + c * (block.w + opts.gap)),
          y: round1(originY + dy + r * (block.h + opts.gap)),
          w: block.w,
          h: block.h,
          isRotated: block.rotated,
        });
      }
    }
  }

  if (opts.requireEven && boxes.length % 2 === 1) {
    boxes = boxes.slice(0, boxes.length - 1);
  }
  const ups = boxes.length;
  if (ups === 0) return empty;

  return {
    ups,
    boxes,
    efficiency: (ups * opts.itemW * opts.itemH * 100) / (W * H),
    sheetW: W,
    sheetH: H,
  };
}

// -----------------------------------------------------------------------------
// Chia khổ giấy mẹ
// -----------------------------------------------------------------------------

export interface SheetDivision {
  /** Kích thước tờ in (dài × ngắn) */
  widthMm: number;
  heightMm: number;
  /** Số tờ in xả được từ 1 tờ mẹ */
  cuts: number;
}

/**
 * Các cách chia khổ mẹ thông dụng: chia dọc cạnh dài a phần × cạnh ngắn b phần
 * (chia 1, 2, 3, 4, 6, 8, 9, 12, 16…).
 */
export function standardDivisions(parentW: number, parentH: number, maxParts = 4): SheetDivision[] {
  const PW = Math.max(parentW, parentH);
  const PH = Math.min(parentW, parentH);
  const seen = new Map<string, SheetDivision>();
  for (let a = 1; a <= maxParts; a++) {
    for (let b = 1; b <= maxParts; b++) {
      const w = Math.floor(PW / a);
      const h = Math.floor(PH / b);
      const div: SheetDivision = { widthMm: Math.max(w, h), heightMm: Math.min(w, h), cuts: a * b };
      const key = `${div.widthMm}x${div.heightMm}`;
      const prev = seen.get(key);
      if (!prev || prev.cuts < div.cuts) seen.set(key, div);
    }
  }
  return [...seen.values()].sort((x, y) => x.cuts - y.cuts);
}

/** Số tờ in kích thước pieceW × pieceH xả được từ tờ mẹ (lưới, chọn hướng tốt nhất) */
export function piecesFromParent(parentW: number, parentH: number, pieceW: number, pieceH: number): number {
  const a = Math.floor(parentW / pieceW) * Math.floor(parentH / pieceH);
  const b = Math.floor(parentW / pieceH) * Math.floor(parentH / pieceW);
  return Math.max(a, b);
}

/** Dựng sơ đồ xả tờ mẹ thành các tờ in (lưới đều, đường xén theo dao chém) */
export function buildCutScheme(parentW: number, parentH: number, pieceW: number, pieceH: number): PaperCutScheme {
  const PW = Math.max(parentW, parentH);
  const PH = Math.min(parentW, parentH);

  const optA = { cols: Math.floor(PW / pieceW), rows: Math.floor(PH / pieceH), w: pieceW, h: pieceH };
  const optB = { cols: Math.floor(PW / pieceH), rows: Math.floor(PH / pieceW), w: pieceH, h: pieceW };
  const opt = optB.cols * optB.rows > optA.cols * optA.rows ? optB : optA;
  const count = opt.cols * opt.rows;

  const blocks: PaperCutBlock[] = [];
  let idx = 1;
  for (let r = 0; r < opt.rows; r++) {
    for (let c = 0; c < opt.cols; c++) {
      blocks.push({
        index: idx,
        x: c * opt.w,
        y: r * opt.h,
        w: opt.w,
        h: opt.h,
        name: `Tờ in #${idx}`,
      });
      idx++;
    }
  }

  const usedW = opt.cols * opt.w;
  const usedH = opt.rows * opt.h;
  const cutLines: PaperCutLine[] = [];
  const lastCol = usedW < PW ? opt.cols : opt.cols - 1;
  for (let c = 1; c <= lastCol; c++) {
    cutLines.push({ x1: c * opt.w, y1: 0, x2: c * opt.w, y2: PH, type: 'vertical', label: `${c * opt.w}` });
  }
  const lastRow = usedH < PH ? opt.rows : opt.rows - 1;
  for (let r = 1; r <= lastRow; r++) {
    cutLines.push({ x1: 0, y1: r * opt.h, x2: Math.min(PW, usedW), y2: r * opt.h, type: 'horizontal', label: `${r * opt.h}` });
  }

  const waste = PW * PH > 0 ? Math.max(0, 100 - (count * pieceW * pieceH * 100) / (PW * PH)) : 0;
  const pieceLong = Math.max(pieceW, pieceH);
  const pieceShort = Math.min(pieceW, pieceH);

  return {
    parentWidthMm: PW,
    parentHeightMm: PH,
    cutDescription:
      count <= 1
        ? `In nguyên khổ ${PW} × ${PH} mm (không xả giấy)`
        : `Chia ${count}: xả tờ mẹ ${PW} × ${PH} mm thành ${count} tờ ${pieceLong} × ${pieceShort} mm`,
    cutsCount: count,
    cutSheetWidthMm: pieceLong,
    cutSheetHeightMm: pieceShort,
    blocks,
    cutLines,
    wasteAreaPercent: round1(waste),
    preCut: false,
  };
}

/** Sơ đồ cho phôi cắt sẵn (in nhanh kèm giấy) */
export function buildPreCutScheme(sheetW: number, sheetH: number, label: string): PaperCutScheme {
  const W = Math.max(sheetW, sheetH);
  const H = Math.min(sheetW, sheetH);
  return {
    parentWidthMm: W,
    parentHeightMm: H,
    cutDescription: `Phôi cắt sẵn ${W} × ${H} mm (${label}) – đã gồm trong đơn giá in, không xả từ khổ mẹ`,
    cutsCount: 1,
    cutSheetWidthMm: W,
    cutSheetHeightMm: H,
    blocks: [{ index: 1, x: 0, y: 0, w: W, h: H, name: 'Phôi in' }],
    cutLines: [],
    wasteAreaPercent: 0,
    preCut: true,
  };
}
