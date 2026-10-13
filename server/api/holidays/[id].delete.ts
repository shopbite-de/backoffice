import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

/** Only a holiday of the selected branch can go. */
export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  const { holidays } = await loadHolidays(event);
  if (!holidays.some((h) => h.id === id)) {
    throw createError({ statusCode: 404, statusMessage: "Schließtag nicht gefunden" });
  }
  await adminApi(event, `/shopbite-holiday/${id}`, { method: "DELETE" });
  return { ok: true };
});
