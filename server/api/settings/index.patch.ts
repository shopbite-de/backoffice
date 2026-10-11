import { z } from "zod";

const Body = z
  .object({
    orderingOpen: z.boolean().optional(),
    deliveryMinutes: z.number().int().min(5).max(240).optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

/** Written for this sales channel only, so other shops on the same Shopware keep theirs. */
export default defineEventHandler(async (event) => {
  const body = await readValidBody(event, Body);
  const channel = await currentSalesChannel(event);
  const values: Record<string, unknown> = {};
  if (body.orderingOpen !== undefined) {
    values["ShopBitePlugin.config.isCheckoutEnabled"] = body.orderingOpen;
  }
  if (body.deliveryMinutes !== undefined) {
    values["ShopBitePlugin.config.defaultDeliveryTime"] = body.deliveryMinutes;
  }
  await adminApi(event, "/_action/system-config", {
    method: "POST",
    query: { salesChannelId: channel.id },
    body: values,
  });
  return { ok: true };
});
