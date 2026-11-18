import { ok, readJson, route } from '@/lib/api';
import { settings } from '@/lib/repositories';
import { parseSettings } from '@/lib/validation';

export const GET = route(async () => ok(settings.get()));

export const PUT = route(async (req) => {
  settings.update(parseSettings(await readJson(req)));
  return ok(settings.get());
});
