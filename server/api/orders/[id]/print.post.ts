import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * "Jetzt drucken": sets the request time on the order; the order printer prints the receipt
 * (again) on its next poll and stores shopbite_printed_at. No order state changes here.
 */
export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  // staff of one branch must not print another branch's orders
  const channels = await restaurantChannels(event);
  const found = await adminSearch<{ id: string }>(event, "order", {
    ids: [id],
    filter: [{ type: "equalsAny", field: "salesChannelId", value: channels.map((c) => c.id) }],
    includes: { order: ["id"] },
  });
  if (!found.data.length) {
    throw createError({ statusCode: 404, statusMessage: "Bestellung nicht gefunden" });
  }
  const requestedAt = new Date().toISOString();
  await adminApi(event, `/order/${id}`, {
    method: "PATCH",
    body: { customFields: { shopbite_print_requested_at: requestedAt } },
  });
  return { printRequestedAt: requestedAt };
});
