import { itemRoutes } from '@/lib/server';
import { giaCongPrices } from '@/lib/repositories';
import { parseGiaCongRow } from '@/lib/validation';

const h = itemRoutes({ parse: parseGiaCongRow, update: giaCongPrices.update, remove: giaCongPrices.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
