import { itemRoutes } from '@/lib/server';
import { offsetMachines } from '@/lib/repositories';
import { parseOffsetMachine } from '@/lib/validation';

const h = itemRoutes({ parse: parseOffsetMachine, update: offsetMachines.update, remove: offsetMachines.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
