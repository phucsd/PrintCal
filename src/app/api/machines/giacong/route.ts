import { collectionRoutes } from '@/lib/server';
import { giaCongPrices } from '@/lib/repositories';
import { parseGiaCongRow } from '@/lib/validation';

const h = collectionRoutes({ list: () => giaCongPrices.list(), parse: parseGiaCongRow, create: giaCongPrices.create });
export const GET = h.GET;
export const POST = h.POST;
