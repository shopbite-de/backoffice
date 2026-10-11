import type { OrderLine, OrderStatus, OrderSummary } from "#shared/types/backoffice";

interface LineItem {
  id: string;
  parentId: string | null;
  label: string;
  quantity: number;
  position: number;
}

interface Order {
  id: string;
  salesChannelId: string;
  orderNumber: string;
  orderDateTime: string;
  amountTotal: number;
  customerComment: string | null;
  customFields: Record<string, unknown> | null;
  stateMachineState: { technicalName: string };
  orderCustomer: { firstName: string; lastName: string } | null;
  lineItems: LineItem[];
  deliveries: {
    shippingMethod: { technicalName: string | null; name: string | null } | null;
    shippingOrderAddress: { street: string; zipcode: string; city: string } | null;
  }[];
}

/**
 * The order-printer prints every "open" order and moves it to
 * "in_progress"; the backoffice never takes an order out of "open" itself,
 * or the kitchen would miss the receipt.
 */
const STATUS: Record<string, OrderStatus> = {
  open: "neu",
  in_progress: "in_arbeit",
  completed: "fertig",
  cancelled: "storniert",
};

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

function toLines(items: LineItem[]): OrderLine[] {
  const byParent = new Map<string | null, LineItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  return (byParent.get(null) ?? [])
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      // a dish with extras is a container line item: first child = dish
      const children = (byParent.get(item.id) ?? []).sort((a, b) => a.position - b.position);
      return {
        quantity: item.quantity,
        label: children[0]?.label ?? item.label,
        extras: children.slice(1).map((child) => child.label),
      };
    });
}

function textField(fields: Record<string, unknown> | null, key: string): string | null {
  const value = fields?.[key];
  return typeof value === "string" && value ? value : null;
}

export default defineEventHandler(async (event): Promise<OrderSummary[]> => {
  // all channels of the restaurant: the kitchen sees every order
  const channels = await restaurantChannels(event);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const result = await adminSearch<Order>(event, "order", {
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
    associations: {
      stateMachineState: {},
      orderCustomer: {},
      lineItems: {},
      deliveries: {
        associations: { shippingMethod: {}, shippingOrderAddress: {} },
      },
    },
    includes: {
      order: [
        "id",
        "salesChannelId",
        "orderNumber",
        "orderDateTime",
        "amountTotal",
        "customerComment",
        "customFields",
        "stateMachineState",
        "orderCustomer",
        "lineItems",
        "deliveries",
      ],
      state_machine_state: ["technicalName"],
      order_customer: ["firstName", "lastName"],
      order_line_item: ["id", "parentId", "label", "quantity", "position"],
      order_delivery: ["shippingMethod", "shippingOrderAddress"],
      shipping_method: ["technicalName", "name"],
      order_address: ["street", "zipcode", "city"],
    },
  });

  return result.data.map((order) => {
    const delivery = order.deliveries[0];
    const method = `${delivery?.shippingMethod?.technicalName ?? ""} ${delivery?.shippingMethod?.name ?? ""}`;
    const isPickup = /abhol|pickup|selbst/i.test(method);
    const address = delivery?.shippingOrderAddress;
    return {
      id: order.id,
      number: order.orderNumber,
      channel: channelName.get(order.salesChannelId) ?? "",
      createdAt: order.orderDateTime,
      status: STATUS[order.stateMachineState.technicalName] ?? "neu",
      total: order.amountTotal,
      mode: isPickup ? "abholung" : "lieferung",
      customer: order.orderCustomer ? `${order.orderCustomer.firstName} ${order.orderCustomer.lastName}` : "Gast",
      address: !isPickup && address ? `${address.street}, ${address.zipcode} ${address.city}` : null,
      comment: order.customerComment,
      printRequestedAt: textField(order.customFields, "shopbite_print_requested_at"),
      printedAt: textField(order.customFields, "shopbite_printed_at"),
      lines: toLines(order.lineItems),
    };
  });
});
