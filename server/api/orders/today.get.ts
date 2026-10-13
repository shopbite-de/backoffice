import type { OrderSummary } from "#shared/types/backoffice";

function startOfToday(): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(now);
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return new Date(`${day}T00:00:00${offset}`).toISOString();
}

export default defineEventHandler(async (event): Promise<OrderSummary[]> => {
  // all channels of the restaurant: the kitchen sees every order
  const channels = await restaurantChannels(event);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const search = (associations: Record<string, unknown>) =>
    adminSearch<ShopwareOrder>(event, "order", {
      limit: 100,
      filter: [
        { type: "equalsAny", field: "salesChannelId", value: channels.map((c) => c.id) },
        {
          type: "range",
          field: "orderDateTime",
          parameters: { gte: startOfToday() },
        },
      ],
      sort: [{ field: "orderDateTime", order: "DESC" }],
      associations,
      includes: ORDER_INCLUDES,
    });
  let result;
  try {
    result = await search(ORDER_ASSOCIATIONS);
  } catch (error) {
    // a role from before plugin 1.10 lacks payment_method:read: the orders still matter, just without the payment
    if (!(isError(error) && error.statusCode === 403)) throw error;
    const { transactions: _, ...withoutPayment } = ORDER_ASSOCIATIONS;
    result = await search(withoutPayment);
    result.data.forEach((order) => (order.transactions = []));
  }
  return result.data.map((order) => toOrderSummary(order, channelName));
});
