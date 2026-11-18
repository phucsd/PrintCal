// =============================================================================
// Tiện ích cho Route Handlers: bọc lỗi thống nhất, đọc JSON an toàn
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from './validation';
import { NotFoundError } from './repositories';
import { QuoteError } from './engine/pricing';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, error: string, details?: string[]) {
  return NextResponse.json({ error, details }, { status });
}

export async function readJson(req: NextRequest | Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError(['Nội dung gửi lên không phải JSON hợp lệ.']);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

/** Bọc handler: chuyển các lỗi nghiệp vụ thành mã HTTP phù hợp */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ValidationError) return fail(400, err.details[0] ?? 'Dữ liệu không hợp lệ.', err.details);
      if (err instanceof QuoteError) return fail(422, err.message);
      if (err instanceof NotFoundError) return fail(404, err.message);
      const msg = err instanceof Error ? err.message : String(err);
      if (/UNIQUE constraint failed/i.test(msg)) return fail(409, 'Mã đã tồn tại – vui lòng dùng mã khác.');
      if (/FOREIGN KEY constraint failed/i.test(msg)) return fail(409, 'Dữ liệu đang được sử dụng ở nơi khác.');
      console.error(`[api] ${req.method} ${req.nextUrl?.pathname}:`, err);
      return fail(500, 'Lỗi máy chủ – vui lòng thử lại.');
    }
  };
}
