import type { CalculationInput, CalculationResult, PaperType, SystemSetting } from '@/types';
import { formatNumber, formatVnd } from '@/lib/format';
import { PRODUCT_UNITS } from '@/lib/engine/constants';

/** Nội dung báo giá ngắn gọn để gửi qua Zalo / Messenger */
export function buildZaloText(
  input: CalculationInput,
  result: CalculationResult,
  paper: Pick<PaperType, 'name'>,
  settings: SystemSetting,
  code?: string
): string {
  const unit = PRODUCT_UNITS[input.productType];
  const c = result.costs;
  const lines = [
    `📄 BÁO GIÁ IN ẤN${code ? ` – ${code}` : ''}`,
    `• Sản phẩm: ${input.jobName}`,
    `• Quy cách: ${input.widthMm} × ${input.heightMm} mm${input.productType === 'catalogue' ? `, ${input.pages} trang` : ''}`,
    `• Giấy: ${paper.name}`,
    `• In: ${result.chosenTech === 'offset' ? 'Offset' : 'In nhanh KTS'} – ${input.printSides === '2_side' || input.productType === 'catalogue' ? '2 mặt' : '1 mặt'}`,
  ];
  if (c.finishingDetails.length > 0) lines.push(`• Gia công: ${c.finishingDetails.map((f) => f.name).join(', ')}`);
  lines.push(`• Số lượng: ${formatNumber(input.quantity)} ${unit}`);
  lines.push('');
  if (c.discountAmount > 0) lines.push(`Giảm giá: -${formatVnd(c.discountAmount)}`);
  if (c.vatAmount > 0) lines.push(`VAT ${c.vatPercent}%: ${formatVnd(c.vatAmount)}`);
  lines.push(`💰 TỔNG: ${formatVnd(c.finalPrice)}${c.vatAmount > 0 ? ' (đã gồm VAT)' : ''}`);
  lines.push(`   ≈ ${formatVnd(c.unitPrice)} / ${unit}`);
  lines.push('');
  lines.push(settings.companyName);
  if (settings.companyPhone) lines.push(`☎ ${settings.companyPhone}`);
  return lines.join('\n');
}
