import { describe, expect, it } from "vitest";
import { splitComment, toOrderSummary, type ShopwareOrder } from "../server/utils/orders";

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
      shippingMethod: { technicalName: null, name: "Lieferung" },
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
          shippingMethod: { technicalName: null, name: "Abholung" },
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

  it("has no payment without a transaction", () => {
    expect(toOrderSummary({ ...base, transactions: [] }, channels).payment).toBeNull();
  });
});
