import { itemRoutes } from '@/lib/server';
import { papers } from '@/lib/repositories';
import { parsePaper } from '@/lib/validation';

const h = itemRoutes({ parse: parsePaper, update: papers.update, remove: papers.remove });
export const PUT = h.PUT;
export const DELETE = h.DELETE;
