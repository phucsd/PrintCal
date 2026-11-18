import { ok, route } from '@/lib/api';
import { giaCongPrices, kemGiayPrices, offsetMachines } from '@/lib/repositories';

export const GET = route(async () =>
  ok({ offsetMachines: offsetMachines.list(), giaCong: giaCongPrices.list(), kemGiay: kemGiayPrices.list() })
);
