import type { H3Event } from "h3";
import type { Holiday } from "#shared/types/backoffice";

interface HolidayRow {
  id: string;
  start: string;
  end: string;
}

/**
 * Closed days of the backoffice's sales channel (plugin entity `shopbite_holiday`, whole days).
 * Stored as midday UTC so the date reads the same in every time zone; the storefront compares
 * the local date of `start` and `end` with today.
 */
export const toStored = (day: string) => `${day}T12:00:00.000+00:00`;

export function toDay(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(iso));
}

export async function loadHolidays(event: H3Event): Promise<{ channelId: string; holidays: Holiday[] }> {
  const channel = await currentSalesChannel(event);
  const result = await adminSearch<HolidayRow>(event, "shopbite-holiday", {
    limit: 100,
    filter: [{ type: "equals", field: "salesChannelId", value: channel.id }],
    sort: [{ field: "start", order: "ASC" }],
  });
  return {
    channelId: channel.id,
    holidays: result.data.map((h) => ({ id: h.id, start: toDay(h.start), end: toDay(h.end) })),
  };
}
