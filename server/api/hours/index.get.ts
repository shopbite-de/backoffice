import type { OpeningInterval } from "#shared/types/backoffice";

export default defineEventHandler(async (event): Promise<OpeningInterval[]> => {
  const { hours } = await loadBusinessHours(event);
  return hours.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    openingTime: h.openingTime.slice(0, 5),
    closingTime: h.closingTime.slice(0, 5),
  }));
});
