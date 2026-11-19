import { describe, expect, it } from "vitest";
import { ORDER_INCLUDES, splitComment, toOrderSummary, type ShopwareOrder } from "../server/utils/orders";

const base: ShopwareOrder = {
  id: "o1",
  salesChannelId: "c1",
  orderNumber: "10001",
  orderDateTime: "2026-10-13T17:05:00.000+00:00",
  amountTotal: 21,
  billingAddressId: "b1",
  customerComment: "Wunschzeit: 19:30\nBitte klingeln",
  customFields: null,
  stateMachineState: { technicalName: "open" },
  orderCustomer: { firstName: "Max", lastName: "Muster" },
  lineItems: [],
  addresses: [{ id: "b1", street: "Musterweg 1", zipcode: "12345", city: "Musterstadt", phoneNumber: "0123 456" }],
  deliveries: [
    {
      shippingMethod: { customFields: { shopbite_fulfillment: "delivery" } },
      shippingOrderAddress: {
        id: "s1",
        street: "Musterweg 1",
        zipcode: "12345",
        city: "Musterstadt",
        phoneNumber: null,
      },
    },
  ],
  transactions: [
    {
      createdAt: "2026-10-13T17:05:00.000+00:00",
      paymentMethod: { distinguishableName: "Barzahlung", name: "Bar" },
      stateMachineState: { technicalName: "open" },
    },
  ],
};
const channels = new Map([["c1", "Hauptfiliale"]]);

describe("splitComment", () => {
  it("takes the wished time out of the comment", () => {
    expect(splitComment("Wunschzeit: 19:30\nBitte klingeln")).toEqual({
      wishedTime: "19:30",
      comment: "Bitte klingeln",
    });
    expect(splitComment("Wunschlieferzeit: so schnell wie möglich")).toEqual({
      wishedTime: "so schnell wie möglich",
      comment: null,
    });
    expect(splitComment("Wunschabholzeit: 18:15\nKomme mit dem Rad")).toEqual({
      wishedTime: "18:15",
      comment: "Komme mit dem Rad",
    });
    expect(splitComment("  ")).toEqual({ wishedTime: null, comment: null });
    expect(splitComment("ohne Zwiebeln")).toEqual({ wishedTime: null, comment: "ohne Zwiebeln" });
  });
});

describe("toOrderSummary", () => {
  it("has phone, payment and wished time for the kitchen", () => {
    const s = toOrderSummary(base, channels);
    expect(s).toMatchObject({
      mode: "lieferung",
      phone: "0123 456",
      wishedTime: "19:30",
      comment: "Bitte klingeln",
      payment: { method: "Barzahlung", paid: false },
      channel: "Hauptfiliale",
    });
  });

  it("prefers the delivery address phone and the newest transaction", () => {
    const order: ShopwareOrder = {
      ...base,
      deliveries: [
        {
          shippingMethod: { customFields: { shopbite_fulfillment: "pickup" } },
          shippingOrderAddress: { ...base.addresses[0]!, phoneNumber: "0170 1" },
        },
      ],
      transactions: [
        {
          createdAt: "2026-10-13T17:05:00.000+00:00",
          paymentMethod: { distinguishableName: "PayPal", name: "PayPal" },
          stateMachineState: { technicalName: "failed" },
        },
        {
          createdAt: "2026-10-13T17:06:00.000+00:00",
          paymentMethod: { distinguishableName: "PayPal", name: "PayPal" },
          stateMachineState: { technicalName: "paid" },
        },
      ],
    };
    const s = toOrderSummary(order, channels);
    expect(s.mode).toBe("abholung");
    expect(s.address).toBeNull();
    expect(s.phone).toBe("0170 1");
    expect(s.payment).toEqual({ method: "PayPal", paid: true });
  });

  it("takes pickup or delivery only from the shipping method's fulfillment field", () => {
    const mode = (shippingMethod: ShopwareOrder["deliveries"][number]["shippingMethod"]) =>
      toOrderSummary({ ...base, deliveries: [{ ...base.deliveries[0]!, shippingMethod }] }, channels);
    const pickup = mode({ customFields: { shopbite_fulfillment: "pickup" } });
    expect(pickup.mode).toBe("abholung");
    expect(pickup.address).toBeNull();
    expect(mode({ customFields: { shopbite_fulfillment: "delivery" } }).mode).toBe("lieferung");
    // a method without the field (or an unknown value) delivers
    expect(mode({ customFields: null }).mode).toBe("lieferung");
    expect(mode({ customFields: { shopbite_fulfillment: "drone" } }).mode).toBe("lieferung");
    expect(mode(null).mode).toBe("lieferung");
  });

  it("reads the fulfillment from the translated custom fields, like Shopware merges them", () => {
    const mode = (shippingMethod: ShopwareOrder["deliveries"][number]["shippingMethod"]) =>
      toOrderSummary({ ...base, deliveries: [{ ...base.deliveries[0]!, shippingMethod }] }, channels).mode;
    // set only in the default language: the raw field of another language is empty, translated has it
    expect(mode({ customFields: null, translated: { customFields: { shopbite_fulfillment: "pickup" } } })).toBe(
      "abholung",
    );
    expect(
      mode({
        customFields: { shopbite_fulfillment: "pickup" },
        translated: { customFields: { shopbite_fulfillment: "delivery" } },
      }),
    ).toBe("lieferung");
  });

  it("loads the shipping method's custom fields", () => {
    expect(ORDER_INCLUDES.shipping_method).toEqual(expect.arrayContaining(["customFields", "translated"]));
  });

  it("has no payment without a transaction", () => {
    expect(toOrderSummary({ ...base, transactions: [] }, channels).payment).toBeNull();
  });
});
