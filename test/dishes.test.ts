import { beforeEach, describe, expect, it, vi } from "vitest";
import * as labels from "../shared/utils/labels";
import fixture from "./fixtures/lafattoria.json";

/*
 * The dish translation against real data of Pizzeria La Fattoria
 * (test/fixtures/lafattoria.json, read from a local copy of its public menu).
 * Nitro auto-imports are stubbed: adminSearch answers from the fixture,
 * adminApi records the sync operations.
 */
const PIZZA_EXTRAS = "019a0000000070008000000000000e01";
type Operation = { key: string; action: string; entity: string; payload: Record<string, unknown>[] };
let synced: Operation[] = [];

vi.stubGlobal("createError", (input: { statusMessage?: string }) => new Error(input.statusMessage));
vi.stubGlobal("currentSalesChannel", async () => fixture.channel);
vi.stubGlobal(
  "adminSearch",
  async (_event: unknown, entity: string, criteria: { ids?: string[]; filter?: { value: unknown }[] }) => {
    if (entity === "product") {
      const product = Object.values(fixture.products).find((p) => criteria.ids?.includes(p.id));
      return { data: product ? [structuredClone(product)] : [] };
    }
    if (entity === "category") return { data: fixture.categories };
    if (entity === "property-group") return { data: fixture.propertyGroups };
    if (entity === "tag") return { data: [] };
    if (entity === "product-stream") {
      return {
        data: (criteria.ids ?? [])
          .filter((id) => id === PIZZA_EXTRAS)
          .map((id) => ({ id, translated: { name: "Pizza Extras" } })),
      };
    }
    throw new Error(`unexpected search ${entity}`);
  },
);
vi.stubGlobal("adminApi", async (_event: unknown, path: string, options: { body: Operation[] }) => {
  expect(path).toBe("/_action/sync");
  synced = options.body;
});
for (const [name, value] of Object.entries(labels)) vi.stubGlobal(name, value);

const { loadDish, saveDish } = await import("../server/utils/dishes");
const event = {} as never;
const schnitzel = fixture.products["103"].id;
const margherita = fixture.products["21"].id;

async function inputOf(id: string) {
  const { id: _id, number: _number, taxRate: _taxRate, ...input } = await loadDish(event, id);
  return input;
}

beforeEach(() => {
  synced = [];
});

describe("loadDish with real data", () => {
  it("reads variants, allergens and the checked flag", async () => {
    const dish = await loadDish(event, schnitzel);
    expect(dish.variants).toHaveLength(1);
    expect(dish.variants[0]!.group).toBe("Beilagen");
    expect(dish.variants[0]!.options).toHaveLength(7);
    expect(dish.allergens).toEqual(["weizen", "eier", "milch"]);
    expect(dish.allergensChecked).toBe(true);
  });

  it("reads the extras list", async () => {
    const dish = await loadDish(event, margherita);
    expect(dish.extras).toHaveLength(1);
    expect(dish.extras[0]!.productIds.length).toBeGreaterThan(10);
    expect(dish.diet).toBe("vegetarisch");
  });
});

describe("saveDish round trip", () => {
  it.each([
    ["Schnitzel (variants, allergens)", schnitzel],
    ["Margherita (extras)", margherita],
  ])("writes nothing new for an untouched dish: %s", async (_name, id) => {
    await saveDish(event, id, await inputOf(id));

    expect(synced.filter((op) => op.action === "delete")).toEqual([]);
    const dish = synced.find((op) => op.key === "dish")!.payload[0]!;
    // only ids and mapping rows (upserts of what exists), no values that could change data
    expect(Object.keys(dish).sort()).toEqual(
      expect.arrayContaining(["categories", "crossSellings", "id", "properties", "tags"]),
    );
    for (const key of ["price", "name", "description", "customFields", "active", "customSearchKeywords", "width"]) {
      expect(dish).not.toHaveProperty(key);
    }
    for (const variant of synced.find((op) => op.key === "variants")?.payload ?? []) {
      expect(variant).not.toHaveProperty("price");
    }
    expect(synced.find((op) => op.key === "groups")).toBeUndefined();
  });

  it("writes a changed price with the net price of four decimals", async () => {
    const input = await inputOf(schnitzel);
    await saveDish(event, schnitzel, { ...input, price: 13.9 });
    const dish = synced.find((op) => op.key === "dish")!.payload[0]!;
    expect(dish.price).toEqual([{ currencyId: fixture.channel.currencyId, gross: 13.9, net: 12.9907, linked: true }]);
  });

  it("keeps variants whose configurator settings are missing", async () => {
    const product = fixture.products["103"] as { configuratorSettings: unknown[] };
    const settings = product.configuratorSettings;
    product.configuratorSettings = [];
    try {
      const input = await inputOf(schnitzel);
      expect(input.variants[0]!.options).toHaveLength(7);
      await saveDish(event, schnitzel, input);
      expect(synced.find((op) => op.key === "drop-variants")).toBeUndefined();
      const dish = synced.find((op) => op.key === "dish")!.payload[0] as { configuratorSettings: unknown[] };
      expect(dish.configuratorSettings).toHaveLength(7);
    } finally {
      product.configuratorSettings = settings;
    }
  });

  it("removes a deselected allergen and adds a new one with code and position", async () => {
    const input = await inputOf(schnitzel);
    await saveDish(event, schnitzel, { ...input, allergens: ["weizen", "milch", "sesam"] });
    const dropped = synced.find((op) => op.key === "drop-properties")!.payload;
    expect(dropped).toHaveLength(1);
    const groups = synced.find((op) => op.key === "groups");
    // the plugin created every option, so nothing new is needed
    expect(groups).toBeUndefined();
    const dish = synced.find((op) => op.key === "dish")!.payload[0] as { properties: { id: string }[] };
    expect(dish.properties).toHaveLength(3);
  });
});

describe("extras groups", () => {
  const product = fixture.products["21"] as { crossSellings: Record<string, unknown>[] };
  const link = {
    id: "019a0000000070008000000000000e02",
    name: "Extras",
    type: "productStream",
    productStreamId: PIZZA_EXTRAS,
    position: 1,
    assignedProducts: [],
    translated: { name: "Extras" },
  };

  it("reads the linked group and leaves it alone on an untouched save", async () => {
    product.crossSellings.push(link);
    try {
      const input = await inputOf(margherita);
      expect(input.extraGroupIds).toEqual([PIZZA_EXTRAS]);
      await saveDish(event, margherita, input);
      expect(synced.find((op) => op.key === "drop-extra-groups")).toBeUndefined();
      expect(synced.find((op) => op.key === "extra-groups")).toBeUndefined();
      // the fixed list is written, the group link is not touched
      const dish = synced.find((op) => op.key === "dish")!.payload[0] as { crossSellings: { id: string }[] };
      expect(dish.crossSellings.map((c) => c.id)).not.toContain(link.id);
    } finally {
      product.crossSellings.pop();
    }
  });

  it("removes a deselected group", async () => {
    product.crossSellings.push(link);
    try {
      await saveDish(event, margherita, { ...(await inputOf(margherita)), extraGroupIds: [] });
      expect(synced.find((op) => op.key === "drop-extra-groups")!.payload).toEqual([{ id: link.id }]);
    } finally {
      product.crossSellings.pop();
    }
  });

  it("links a new group after the other lists", async () => {
    const input = await inputOf(margherita);
    await saveDish(event, margherita, { ...input, extraGroupIds: [PIZZA_EXTRAS] });
    const [created] = synced.find((op) => op.key === "extra-groups")!.payload;
    expect(created).toMatchObject({
      productId: margherita,
      name: "Pizza Extras",
      type: "productStream",
      productStreamId: PIZZA_EXTRAS,
      position: input.extras.length,
    });
  });

  it("refuses an unknown group", async () => {
    const input = await inputOf(margherita);
    await expect(saveDish(event, margherita, { ...input, extraGroupIds: ["0".repeat(32)] })).rejects.toThrow(
      "Unbekannte Extras-Gruppe",
    );
  });
});
