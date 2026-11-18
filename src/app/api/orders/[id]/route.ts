import { ok, readJson, route } from '@/lib/api';
import { NotFoundError, orders } from '@/lib/repositories';
import { Reader, parseId, parseOrderStatus, parseOrderUpdate } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const order = orders.get(parseId((await params).id));
  if (!order) throw new NotFoundError('Không tìm thấy đơn hàng.');
  return ok(order);
});

/** Cập nhật thông tin đơn hàng */
export const PUT = route<Ctx>(async (req, { params }) => {
  const id = parseId((await params).id);
  orders.update(id, parseOrderUpdate(await readJson(req)));
  return ok(orders.get(id));
});

/** Đổi trạng thái: { status } */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = parseId((await params).id);
  const body = new Reader(await readJson(req));
  orders.setStatus(id, parseOrderStatus(body.raw('status')));
  return ok(orders.get(id));
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  orders.remove(parseId((await params).id));
  return ok({ success: true });
});
