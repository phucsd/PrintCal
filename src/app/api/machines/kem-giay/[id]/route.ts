import { itemRoutes } from '@/lib/server';
import { kemGiayPrices } from '@/lib/repositories';
import { parseKemGiayRow } from '@/lib/validation';

const h = itemRoutes({ parse: parseKemGiayRow, update: kemGiayPrices.update, remove: kemGiayPrices.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
