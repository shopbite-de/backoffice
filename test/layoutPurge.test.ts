import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Ordering switch, lead times, business hours and holidays are part of the storefront's
 * cached layout data: every successful write empties it, a failed write leaves the cache alone.
 */
const channel = { id: "c".repeat(32) };
const holiday = { id: "a".repeat(32), start: "2026-12-24", end: "2026-12-26" };
let body: unknown = {};
let failWrite = false;
const purges: unknown[] = [];

vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
vi.stubGlobal("readValidBody", async (_event: unknown, schema: { parse: (v: unknown) => unknown }) =>
  schema.parse(body),
);
vi.stubGlobal("getRouterParam", () => holiday.id);
vi.stubGlobal("createError", (input: { statusMessage?: string }) => new Error(input.statusMessage));
vi.stubGlobal("toShopSettings", (await import("../server/utils/settings")).toShopSettings);
vi.stubGlobal("currentSalesChannel", async () => channel);
vi.stubGlobal("loadBusinessHours", async () => ({ channel, hours: [] }));
vi.stubGlobal("loadHolidays", async () => ({ channel, holidays: [holiday] }));
vi.stubGlobal("toStored", (day: string) => `${day}T12:00:00.000Z`);
vi.stubGlobal("adminApi", async () => {
  if (failWrite) throw new Error("Shopware 500");
  return { orderingOpen: false, shippingMethods: [] };
});
vi.stubGlobal("purgeStorefronts", async (_event: unknown, target: unknown) => {
  purges.push(target);
});

type Handler = (event: never) => Promise<unknown>;
const load = async (path: string) => (await import(path)).default as Handler;
const writes: [string, Handler, unknown][] = [
  ["settings", await load("../server/api/settings/index.patch"), { orderingOpen: false }],
  [
    "hours",
    await load("../server/api/hours/index.put"),
    { intervals: [{ dayOfWeek: 1, openingTime: "11:00", closingTime: "22:00" }] },
  ],
  ["new holiday", await load("../server/api/holidays/index.post"), { start: "2026-12-24", end: "2026-12-26" }],
  ["deleted holiday", await load("../server/api/holidays/[id].delete"), undefined],
];
const event = {} as never;

beforeEach(() => {
  purges.length = 0;
  failWrite = false;
});

describe.each(writes)("%s", (_name, handler, requestBody) => {
  it("empties the storefronts' layout data after saving", async () => {
    body = requestBody;
    await handler(event);
    expect(purges).toEqual([{ layout: true }]);
  });

  it("leaves the storefronts alone when Shopware rejects the write", async () => {
    body = requestBody;
    failWrite = true;
    await expect(handler(event)).rejects.toThrow("Shopware 500");
    expect(purges).toEqual([]);
  });
});
