import { ok, readJson, route } from '@/lib/api';
import { orders } from '@/lib/repositories';
import { quote } from '@/lib/server';
import { parseCreateOrder } from '@/lib/validation';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const customerId = Number(sp.get('customerId')) || undefined;
  return ok(orders.list({ status: sp.get('status') ?? undefined, search: sp.get('search') ?? undefined, customerId }));
});

/** Lưu báo giá: server tự tính lại giá từ đầu vào để số liệu luôn đúng với bảng giá hiện hành */
export const POST = route(async (req) => {
  const payload = parseCreateOrder(await readJson(req));
  const { result, paper } = quote(payload.input);
  const created = orders.create({
    customerId: payload.customer.id ?? null,
    customerName: payload.customer.name || 'Khách vãng lai',
    customerPhone: payload.customer.phone,
    customerEmail: payload.customer.email ?? '',
    customerCompany: payload.customer.company ?? '',
    notes: payload.notes ?? '',
    spec: { input: payload.input, result, paper: { id: paper.id, code: paper.code, name: paper.name, gsm: paper.gsm } },
  });
  return ok({ success: true, ...created, order: orders.get(created.id) }, 201);
});
