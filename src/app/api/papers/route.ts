import { collectionRoutes } from '@/lib/server';
import { papers } from '@/lib/repositories';
import { parsePaper } from '@/lib/validation';

const h = collectionRoutes({
  list: (req) => {
    const sp = req.nextUrl.searchParams;
    return papers.list({ q: sp.get('q') ?? undefined, supplier: sp.get('supplier') ?? undefined, activeOnly: sp.get('active') === '1' });
  },
  parse: parsePaper,
  create: papers.create,
});
export const GET = h.GET;
export const POST = h.POST;
