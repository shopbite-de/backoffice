import type { Holiday } from "#shared/types/backoffice";

/** Past days drop out after a week, the list stays short. */
export default defineEventHandler(async (event): Promise<Holiday[]> => {
  const { holidays } = await loadHolidays(event);
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const since = toDay(cutoff.toISOString());
  return holidays.filter((h) => h.end >= since);
});
