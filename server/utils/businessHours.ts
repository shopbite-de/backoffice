import type { H3Event } from "h3";

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  openingTime: string;
  closingTime: string;
}

/** Opening hours of the backoffice's sales channel (ShopBite plugin entity). */
export async function loadBusinessHours(event: H3Event) {
  const channel = await currentSalesChannel(event);
  const result = await adminSearch<BusinessHour>(event, "shopbite-business-hour", {
    limit: 100,
    filter: [{ type: "equals", field: "salesChannelId", value: channel.id }],
    sort: [
      { field: "dayOfWeek", order: "ASC" },
      { field: "openingTime", order: "ASC" },
    ],
  });
  return { channel, hours: result.data };
}
