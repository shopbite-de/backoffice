import { z } from "zod";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Body = z.object({
  intervals: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(1).max(7),
          openingTime: Time,
          closingTime: Time,
        })
        .refine((i) => i.openingTime < i.closingTime, {
          message: "Schließt vor dem Öffnen",
        }),
    )
    .max(50),
});

/**
 * Replaces the whole week in one sync request: Shopware runs it in a single
 * transaction, so the storefront never sees a half-saved week.
 */
export default defineEventHandler(async (event) => {
  const { intervals } = await readValidBody(event, Body);
  const { channel, hours } = await loadBusinessHours(event);

  const operations = [];
  if (hours.length) {
    operations.push({
      key: "delete-hours",
      action: "delete",
      entity: "shopbite_business_hour",
      payload: hours.map((h) => ({ id: h.id })),
    });
  }
  if (intervals.length) {
    operations.push({
      key: "write-hours",
      action: "upsert",
      entity: "shopbite_business_hour",
      payload: intervals.map((i) => ({
        id: crypto.randomUUID().replaceAll("-", ""),
        salesChannelId: channel.id,
        dayOfWeek: i.dayOfWeek,
        openingTime: i.openingTime,
        closingTime: i.closingTime,
      })),
    });
  }
  await adminApi(event, "/_action/sync", { method: "POST", body: operations });
  return { ok: true };
});
