import { itemRoutes } from '@/lib/server';
import { customers } from '@/lib/repositories';
import { parseCustomer } from '@/lib/validation';

const h = itemRoutes({ parse: parseCustomer, update: customers.update, remove: customers.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
