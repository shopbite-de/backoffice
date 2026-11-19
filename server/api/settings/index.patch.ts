import { z } from "zod";
import type { ShopSettings } from "#shared/types/backoffice";
import { SHARED_METHOD_HINT } from "#shared/utils/leadTimes";

const Body = z
  .object({
    orderingOpen: z.boolean().optional(),
    // per shipping method id; the plugin checks that the method belongs to this channel
    leadTimes: z
      .record(z.string().regex(/^[0-9a-f]{32}$/), z.number().int().min(1).max(1440))
      .refine((times) => Object.keys(times).length > 0)
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

/**
 * The ordering switch is written for this sales channel only, so other branches keep theirs (plugin
 * settings route, no system_config). A lead time belongs to the shipping method and so applies to every
 * branch using it; the plugin refuses it (403) to staff not bound to all of those branches.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidBody(event, Body);
  const channel = await currentSalesChannel(event);
  const settings = await adminApi<ShopSettings>(event, `/_action/shopbite/settings/${channel.id}`, {
    method: "PATCH",
    body,
  }).catch((error: unknown) => {
    // the plugin's detail stays in the server log (toH3Error); a lead time is refused for a shared method only
    if (body.leadTimes && (error as { statusCode?: number }).statusCode === 403) {
      throw createError({ statusCode: 403, statusMessage: SHARED_METHOD_HINT });
    }
    throw error;
  });
  await purgeStorefronts(event, { layout: true });
  return toShopSettings(settings);
});
