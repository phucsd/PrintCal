import { itemRoutes } from '@/lib/server';
import { finishingServices } from '@/lib/repositories';
import { parseFinishing } from '@/lib/validation';

const h = itemRoutes({ parse: parseFinishing, update: finishingServices.update, remove: finishingServices.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
