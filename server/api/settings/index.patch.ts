import { z } from "zod";
import type { ShopSettings } from "#shared/types/backoffice";

const Body = z
  .object({
    orderingOpen: z.boolean().optional(),
    deliveryMinutes: z.number().int().min(5).max(240).optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

/** Written for this sales channel only, so other branches keep theirs (plugin settings route, no system_config). */
export default defineEventHandler(async (event) => {
  const body = await readValidBody(event, Body);
  const channel = await currentSalesChannel(event);
  return adminApi<ShopSettings>(event, `/_action/shopbite/settings/${channel.id}`, { method: "PATCH", body });
});
