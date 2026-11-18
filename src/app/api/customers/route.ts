import { collectionRoutes } from '@/lib/server';
import { customers } from '@/lib/repositories';
import { parseCustomer } from '@/lib/validation';

const h = collectionRoutes({
  list: (req) => customers.list(req.nextUrl.searchParams.get('q') ?? undefined),
  parse: parseCustomer,
  create: customers.create,
});
export const GET = h.GET;
export const POST = h.POST;
