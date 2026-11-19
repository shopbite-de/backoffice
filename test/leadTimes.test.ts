import { beforeEach, describe, expect, it, vi } from "vitest";
import { isChosen, leadTimeLabel, leadTimeOptions, SHARED_METHOD_HINT } from "../shared/utils/leadTimes";

/*
 * Lead time per shipping method (delivery time, pickup time): the plugin's settings route returns
 * one entry per shipping method of the branch and takes `leadTimes` by shipping method id.
 */
const channel = { id: "c".repeat(32) };
const delivery = "d".repeat(32);
const pickup = "e".repeat(32);
let body: unknown = {};
let shopware: Record<string, unknown> = {};
let refuse: { statusCode: number; statusMessage: string } | null = null;
const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
const purges: unknown[] = [];

vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
vi.stubGlobal("readValidBody", async (_event: unknown, schema: { parse: (v: unknown) => unknown }) =>
  schema.parse(body),
);
vi.stubGlobal("toShopSettings", (await import("../server/utils/settings")).toShopSettings);
vi.stubGlobal("currentSalesChannel", async () => channel);
vi.stubGlobal("createError", (input: { statusCode: number; statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input),
);
vi.stubGlobal("adminApi", async (_event: unknown, path: string, options?: { method?: string; body?: unknown }) => {
  calls.push({ path, options });
  // adminApi throws toH3Error's generic text, the plugin's detail stays in the server log
  if (refuse) throw Object.assign(new Error(refuse.statusMessage), refuse);
  return shopware;
});
vi.stubGlobal("purgeStorefronts", async (_event: unknown, target: unknown) => {
  purges.push(target);
});

type Handler = (event: never) => Promise<unknown>;
const get = (await import("../server/api/settings/index.get")).default as Handler;
const patch = (await import("../server/api/settings/index.patch")).default as Handler;
const event = {} as never;

const methods = [
  {
    id: delivery,
    name: "Lieferung",
    fulfillment: "delivery",
    leadTimeMinutes: 45,
    leadTimeMinutesSet: true,
    editable: true,
  },
  {
    id: pickup,
    name: "Abholung",
    fulfillment: "pickup",
    leadTimeMinutes: 20,
    leadTimeMinutesSet: false,
    editable: false,
  },
];

beforeEach(() => {
  calls.length = 0;
  purges.length = 0;
  body = {};
  refuse = null;
  shopware = { orderingOpen: true, shippingMethods: methods };
});

describe("GET /api/settings", () => {
  it("returns the lead time of every shipping method of the branch", async () => {
    expect(await get(event)).toEqual({ orderingOpen: true, shippingMethods: methods });
    expect(calls[0]!.path).toBe(`/_action/shopbite/settings/${channel.id}`);
  });

  it("passes only the fields it knows", async () => {
    shopware = {
      orderingOpen: false,
      shippingMethods: [{ ...methods[0], technicalName: "x", extra: 1 }],
      other: "secret",
    };
    expect(await get(event)).toEqual({ orderingOpen: false, shippingMethods: [methods[0]] });
  });
});

describe("PATCH /api/settings", () => {
  it("writes lead times per shipping method and empties the storefront layout data", async () => {
    body = { leadTimes: { [pickup]: 15 } };
    const result = await patch(event);
    expect(calls).toEqual([
      {
        path: `/_action/shopbite/settings/${channel.id}`,
        options: { method: "PATCH", body: { leadTimes: { [pickup]: 15 } } },
      },
    ]);
    expect(purges).toEqual([{ layout: true }]);
    expect(result).toEqual({ orderingOpen: true, shippingMethods: methods });
  });

  it.each([
    ["zero minutes", { [pickup]: 0 }],
    ["more than a day", { [pickup]: 1441 }],
    ["fractions", { [pickup]: 12.5 }],
    ["no shipping method id", { pickup: 15 }],
    ["nothing", {}],
  ])("rejects %s", async (_name, leadTimes) => {
    body = { leadTimes };
    await expect(patch(event)).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(purges).toEqual([]);
  });

  it("accepts a whole day", async () => {
    body = { leadTimes: { [delivery]: 1440 } };
    await patch(event);
    expect(calls.map((c) => c.options?.body)).toEqual([{ leadTimes: { [delivery]: 1440 } }]);
  });

  it("explains a refused lead time: the shipping method is shared with other branches", async () => {
    body = { leadTimes: { [pickup]: 15 } };
    refuse = { statusCode: 403, statusMessage: "Dafür fehlt dieser Anmeldung die Berechtigung" };
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 403, statusMessage: SHARED_METHOD_HINT });
    expect(purges).toEqual([]);
  });

  it("keeps other refusals as they are", async () => {
    body = { orderingOpen: false };
    refuse = { statusCode: 403, statusMessage: "Dafür fehlt dieser Anmeldung die Berechtigung" };
    await expect(patch(event)).rejects.toMatchObject({
      statusMessage: "Dafür fehlt dieser Anmeldung die Berechtigung",
    });
    body = { leadTimes: { [pickup]: 15 } };
    refuse = { statusCode: 500, statusMessage: "Shopware ist gerade nicht erreichbar" };
    await expect(patch(event)).rejects.toMatchObject({ statusMessage: "Shopware ist gerade nicht erreichbar" });
  });

  it("no longer takes the single delivery time", async () => {
    body = { deliveryMinutes: 30 };
    await expect(patch(event)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe("leadTimeOptions", () => {
  it("offers the usual steps per kind and keeps an unusual stored value selectable", () => {
    expect(leadTimeOptions("delivery", 45)).toEqual([20, 30, 45, 60, 90]);
    expect(leadTimeOptions("pickup", 20)).toEqual([10, 15, 20, 30, 45]);
    expect(leadTimeOptions("pickup", 25)).toEqual([10, 15, 20, 25, 30, 45]);
    expect(leadTimeOptions("delivery", 180)).toEqual([20, 30, 45, 60, 90, 180]);
  });
});

describe("isChosen", () => {
  it("marks only a value the restaurant has set, never the default", () => {
    const set = { leadTimeMinutes: 45, leadTimeMinutesSet: true };
    const unset = { leadTimeMinutes: 30, leadTimeMinutesSet: false };
    expect(isChosen(set, 45)).toBe(true);
    expect(isChosen(set, 30)).toBe(false);
    expect(isChosen(unset, 30)).toBe(false);
  });
});

describe("leadTimeLabel", () => {
  it("names the time the guest sees", () => {
    expect(leadTimeLabel("delivery")).toBe("Lieferzeit");
    expect(leadTimeLabel("pickup")).toBe("Abholzeit");
  });
});
