import { ok, route } from '@/lib/api';
import { customers, finishingServices, giaCongPrices, kemGiayPrices, offsetMachines, orders, papers, settings } from '@/lib/repositories';

/** Toàn bộ dữ liệu danh mục cho màn hình tính giá – 1 request duy nhất */
export const GET = route(async () =>
  ok({
    papers: papers.list(),
    offsetMachines: offsetMachines.list(),
    giaCong: giaCongPrices.list(),
    kemGiay: kemGiayPrices.list(),
    finishing: finishingServices.list(),
    customers: customers.list(),
    settings: settings.get(),
    orderCount: orders.count(),
  })
);
