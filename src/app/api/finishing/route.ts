import { collectionRoutes } from '@/lib/server';
import { finishingServices } from '@/lib/repositories';
import { parseFinishing } from '@/lib/validation';

const h = collectionRoutes({
  list: (req) => finishingServices.list(req.nextUrl.searchParams.get('active') === '1'),
  parse: parseFinishing,
  create: finishingServices.create,
});
export const GET = h.GET;
export const POST = h.POST;
