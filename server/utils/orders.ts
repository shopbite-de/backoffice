import type { OrderLine, OrderStatus, OrderSummary } from "#shared/types/backoffice";

export interface LineItem {
  id: string;
  parentId: string | null;
  label: string;
  quantity: number;
  position: number;
}

export interface OrderAddress {
  id: string;
  street: string;
  zipcode: string;
  city: string;
  phoneNumber: string | null;
}

/** The order as the Admin API returns it with the associations of `ORDER_ASSOCIATIONS`. */
export interface ShopwareOrder {
  id: string;
  salesChannelId: string;
  orderNumber: string;
  orderDateTime: string;
  amountTotal: number;
  billingAddressId: string;
  customerComment: string | null;
  customFields: Record<string, unknown> | null;
  stateMachineState: { technicalName: string };
  orderCustomer: { firstName: string; lastName: string } | null;
  lineItems: LineItem[];
  addresses: OrderAddress[];
  deliveries: {
    shippingMethod: { technicalName: string | null; name: string | null } | null;
    shippingOrderAddress: OrderAddress | null;
  }[];
  transactions: {
    createdAt: string;
    paymentMethod: { distinguishableName: string | null; name: string | null } | null;
    stateMachineState: { technicalName: string };
  }[];
}

export const ORDER_ASSOCIATIONS = {
  stateMachineState: {},
  orderCustomer: {},
  lineItems: {},
  addresses: {},
  deliveries: { associations: { shippingMethod: {}, shippingOrderAddress: {} } },
  transactions: { associations: { paymentMethod: {}, stateMachineState: {} } },
};

export const ORDER_INCLUDES = {
  order: [
    "id",
    "salesChannelId",
    "orderNumber",
    "orderDateTime",
    "amountTotal",
    "billingAddressId",
    "customerComment",
    "customFields",
    "stateMachineState",
    "orderCustomer",
    "lineItems",
    "addresses",
    "deliveries",
    "transactions",
  ],
  state_machine_state: ["technicalName"],
  order_customer: ["firstName", "lastName"],
  order_line_item: ["id", "parentId", "label", "quantity", "position"],
  order_delivery: ["shippingMethod", "shippingOrderAddress"],
  order_transaction: ["createdAt", "paymentMethod", "stateMachineState"],
  payment_method: ["distinguishableName", "name"],
  shipping_method: ["technicalName", "name"],
  order_address: ["id", "street", "zipcode", "city", "phoneNumber"],
};

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

// transaction states that mean the money is in (Shopware order_transaction state machine)
const PAID_STATES = new Set(["paid", "paid_partially", "authorized"]);

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

/** The storefront checkout writes the chosen time into the comment ("Wunschzeit: 19:30", older orders "Wunschlieferzeit: …"). */
export function splitComment(comment: string | null): { wishedTime: string | null; comment: string | null } {
  const text = comment?.trim() ?? "";
  const match = text.match(/^Wunsch(?:liefer)?zeit:\s*([^\n]+)\n?/i);
  if (!match) return { wishedTime: null, comment: text || null };
  const rest = text.slice(match[0].length).trim();
  return { wishedTime: match[1]!.trim(), comment: rest || null };
}

export function toOrderSummary(order: ShopwareOrder, channelName: Map<string, string>): OrderSummary {
  const delivery = order.deliveries[0];
  const method = `${delivery?.shippingMethod?.technicalName ?? ""} ${delivery?.shippingMethod?.name ?? ""}`;
  const isPickup = /abhol|pickup|selbst/i.test(method);
  const address = delivery?.shippingOrderAddress;
  const billing = order.addresses.find((a) => a.id === order.billingAddressId);
  // the newest transaction counts (a failed online payment may be followed by a new one)
  const transaction = [...order.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const paymentName = transaction?.paymentMethod?.distinguishableName ?? transaction?.paymentMethod?.name ?? null;
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
    phone: address?.phoneNumber || billing?.phoneNumber || null,
    ...splitComment(order.customerComment),
    payment: paymentName
      ? { method: paymentName, paid: PAID_STATES.has(transaction!.stateMachineState.technicalName) }
      : null,
    printRequestedAt: textField(order.customFields, "shopbite_print_requested_at"),
    printedAt: textField(order.customFields, "shopbite_printed_at"),
    lines: toLines(order.lineItems),
  };
}
