// Dịch vụ phía server: nạp bảng giá từ DB rồi gọi engine
import { calculateQuote, type PricingContext } from './engine/pricing';
import { finishingServices, giaCongPrices, kemGiayPrices, offsetMachines, papers } from './repositories';
import { ValidationError, parseId } from './validation';
import type { CalculationInput, CalculationResult, PaperType } from '@/types';
import type { NextRequest } from 'next/server';
import { ok, readJson, route } from './api';

export function buildPricingContext(paperTypeId: number): PricingContext {
  const paper = papers.get(paperTypeId);
  if (!paper) throw new ValidationError(['Loại giấy đã chọn không tồn tại (có thể đã bị xoá).']);
  return {
    paper,
    offsetMachines: offsetMachines.list(),
    giaCong: giaCongPrices.list(),
    kemGiay: kemGiayPrices.list(),
    finishing: finishingServices.list(true),
  };
}

export function quote(input: CalculationInput): { result: CalculationResult; paper: PaperType } {
  const ctx = buildPricingContext(input.paperTypeId);
  const result = calculateQuote(input, ctx);
  if (!ctx.paper.isActive) result.warnings.unshift('Loại giấy này đang ở trạng thái ngưng sử dụng.');
  return { result, paper: ctx.paper };
}

type IdCtx = { params: Promise<{ id: string }> };

/** Sinh cặp handler PUT/DELETE cho route /[id] */
export function itemRoutes<T>(opts: {
  parse: (raw: unknown) => T;
  update: (id: number, value: T) => void;
  remove: (id: number) => void;
}) {
  return {
    PUT: route<IdCtx>(async (req: NextRequest, { params }) => {
      const id = parseId((await params).id);
      opts.update(id, opts.parse(await readJson(req)));
      return ok({ success: true });
    }),
    DELETE: route<IdCtx>(async (_req: NextRequest, { params }) => {
      const id = parseId((await params).id);
      opts.remove(id);
      return ok({ success: true });
    }),
  };
}

/** Sinh cặp handler GET (danh sách) / POST (tạo mới) */
export function collectionRoutes<T, L>(opts: { list: (req: NextRequest) => L; parse: (raw: unknown) => T; create: (value: T) => number }) {
  return {
    GET: route(async (req: NextRequest) => ok(opts.list(req))),
    POST: route(async (req: NextRequest) => {
      const id = opts.create(opts.parse(await readJson(req)));
      return ok({ success: true, id }, 201);
    }),
  };
}
