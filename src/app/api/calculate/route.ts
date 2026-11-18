import { ok, readJson, route } from '@/lib/api';
import { quote } from '@/lib/server';
import { parseCalculationInput } from '@/lib/validation';

export const POST = route(async (req) => {
  const input = parseCalculationInput(await readJson(req));
  const { result } = quote(input);
  return ok(result);
});
