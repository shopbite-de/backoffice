import { z } from "zod";

/**
 * Only the two steps a restaurant takes by hand. "open" → "in_progress"
 * belongs to the order-printer (it marks a printed order).
 */
const TRANSITIONS = { fertig: "complete", storniert: "cancel" } as const;

const Body = z.object({ status: z.enum(["fertig", "storniert"]) });
const Id = z.string().regex(/^[0-9a-f]{32}$/);

export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  const { status } = await readValidBody(event, Body);
  // staff of one branch must not change another branch's orders
  const channels = await restaurantChannels(event);
  const found = await adminSearch<{ id: string }>(event, "order", {
    ids: [id],
    filter: [{ type: "equalsAny", field: "salesChannelId", value: channels.map((c) => c.id) }],
    includes: { order: ["id"] },
  });
  if (!found.data.length) {
    throw createError({ statusCode: 404, statusMessage: "Bestellung nicht gefunden" });
  }
  await adminApi(event, `/_action/order/${id}/state/${TRANSITIONS[status]}`, {
    method: "POST",
    body: {},
  });
  return { ok: true };
});
