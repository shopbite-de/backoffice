import { z } from "zod";
import type { Holiday } from "#shared/types/backoffice";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum wie 2026-12-24");
const Body = z
  .object({ start: Day, end: Day })
  .refine((b) => b.start <= b.end, { message: "Das Ende liegt vor dem Anfang" });

/** One closed period (a single day when start equals end). */
export default defineEventHandler(async (event): Promise<Holiday> => {
  const { start, end } = await readValidBody(event, Body);
  const channel = await currentSalesChannel(event);
  const id = crypto.randomUUID().replaceAll("-", "");
  await adminApi(event, "/shopbite-holiday", {
    method: "POST",
    body: { id, salesChannelId: channel.id, start: toStored(start), end: toStored(end) },
  });
  return { id, start, end };
});
