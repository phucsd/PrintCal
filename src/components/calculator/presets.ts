import type { CalculatorForm, MasterData } from './types';
import { pickPaper } from './types';
import type { SelectedFinishing } from '@/types';

export interface Preset {
  id: string;
  label: string;
  apply: (form: CalculatorForm, master: MasterData) => CalculatorForm;
}

function finishingByCodes(master: MasterData, items: [code: string, sides?: 1 | 2][]): SelectedFinishing[] {
  const out: SelectedFinishing[] = [];
  for (const [code, sides] of items) {
    const s = master.finishing.find((f) => f.code === code && f.isActive);
    if (s) out.push({ serviceId: s.id, sides: sides ?? 1 });
  }
  return out;
}

const paperId = (master: MasterData, prefix: string, gsm: number, fallback: number) => pickPaper(master.papers, prefix, gsm)?.id ?? fallback;

export const PRESETS: Preset[] = [
  {
    id: 'a4',
    label: 'Tờ rơi A4',
    apply: (f, m) => ({
      ...f,
      jobName: 'Tờ rơi A4',
      productType: 'to_roi',
      widthMm: 210,
      heightMm: 297,
      quantity: 1000,
      printSides: '2_side',
      paperTypeId: paperId(m, 'C', 150, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: [],
    }),
  },
  {
    id: 'a5',
    label: 'Tờ rơi A5',
    apply: (f, m) => ({
      ...f,
      jobName: 'Tờ rơi A5',
      productType: 'to_roi',
      widthMm: 148,
      heightMm: 210,
      quantity: 2000,
      printSides: '2_side',
      paperTypeId: paperId(m, 'C', 150, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: [],
    }),
  },
  {
    id: 'namecard',
    label: 'Danh thiếp',
    apply: (f, m) => ({
      ...f,
      jobName: 'Danh thiếp 2 mặt',
      productType: 'namecard',
      widthMm: 90,
      heightMm: 54,
      quantity: 500,
      printSides: '2_side',
      paperTypeId: paperId(m, 'C', 300, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: finishingByCodes(m, [['CAN_MANG_MO', 2]]),
    }),
  },
  {
    id: 'brochure',
    label: 'Brochure gấp 3',
    apply: (f, m) => ({
      ...f,
      jobName: 'Brochure A4 gấp 3',
      productType: 'to_roi',
      widthMm: 297,
      heightMm: 210,
      quantity: 1000,
      printSides: '2_side',
      paperTypeId: paperId(m, 'C', 200, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: finishingByCodes(m, [['CAN_MANG_MO', 2], ['CAN_GAP_2_DUONG']]),
    }),
  },
  {
    id: 'catalogue',
    label: 'Catalogue A4 16 trang',
    apply: (f, m) => ({
      ...f,
      jobName: 'Catalogue A4 16 trang',
      productType: 'catalogue',
      widthMm: 210,
      heightMm: 297,
      pages: 16,
      quantity: 500,
      printSides: '2_side',
      paperTypeId: paperId(m, 'C', 150, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: finishingByCodes(m, [['DONG_GHIM_LONG']]),
    }),
  },
  {
    id: 'box',
    label: 'Hộp mỹ phẩm',
    apply: (f, m) => ({
      ...f,
      jobName: 'Hộp giấy mỹ phẩm',
      productType: 'hop_giay',
      widthMm: 240,
      heightMm: 320,
      quantity: 1000,
      printSides: '1_side',
      paperTypeId: paperId(m, 'I', 350, f.paperTypeId),
      kemGiayCode: undefined,
      selectedFinishing: finishingByCodes(m, [['CAN_MANG_MO', 1], ['BE_THANH_PHAM'], ['DAN_HOP_TU_DONG']]),
    }),
  },
];
