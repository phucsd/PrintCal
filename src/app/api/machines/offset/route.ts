import { collectionRoutes } from '@/lib/server';
import { offsetMachines } from '@/lib/repositories';
import { parseOffsetMachine } from '@/lib/validation';

const h = collectionRoutes({ list: () => offsetMachines.list(), parse: parseOffsetMachine, create: offsetMachines.create });
export const GET = h.GET;
export const POST = h.POST;
