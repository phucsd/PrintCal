import { collectionRoutes } from '@/lib/server';
import { kemGiayPrices } from '@/lib/repositories';
import { parseKemGiayRow } from '@/lib/validation';

const h = collectionRoutes({ list: () => kemGiayPrices.list(), parse: parseKemGiayRow, create: kemGiayPrices.create });
export const GET = h.GET;
export const POST = h.POST;
