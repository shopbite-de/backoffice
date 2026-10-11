import type { H3Event } from "h3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ExtraGroup, ExtraProduct } from "#shared/types/backoffice";

/**
 * Extras groups are Shopware product streams that dishes use as a "productStream" cross-selling
 * (La Fattoria: "Pizza Extras" at every pizza). The backoffice edits streams whose only condition
 * is "Produkt ist eins von" (equalsAny on the product id, as the Shopware Administration writes
 * it); other conditions stay read-only. Streams of dynamic categories are not extras.
 */

export interface StreamFilterRow {
  id: string;
  parentId: string | null;
  type: string;
  field: string | null;
  value: string | null;
}

interface StreamRow {
  id: string;
  name: string | null;
  translated: { name: string | null };
  apiFilter: Record<string, unknown>[] | null;
  filters: StreamFilterRow[];
}

/** Request body of create and save. */
export const ExtraGroupBody = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben").max(255),
  productIds: z
    .array(z.string().regex(/^[0-9a-f]{32}$/))
    .max(200)
    .transform((ids) => [...new Set(ids)]),
});
export type ExtraGroupInput = z.infer<typeof ExtraGroupBody>;

const PRODUCT_ID_FIELDS = ["id", "product.id"];
const newId = () => randomUUID().replaceAll("-", "");
const splitIds = (value: string | null) => (value ?? "").split("|").filter((id) => /^[0-9a-f]{32}$/.test(id));

/**
 * The single "Produkt ist eins von" condition of a stream, or null when it has other conditions:
 * exactly one leaf, equalsAny on the product id, every group (multi) with at most one child.
 */
export function productListFilter(filters: StreamFilterRow[]): { filterId: string; productIds: string[] } | null {
  const leaves = filters.filter((f) => f.type !== "multi");
  const leaf = leaves[0];
  if (leaves.length !== 1 || !leaf || leaf.type !== "equalsAny" || !PRODUCT_ID_FIELDS.includes(leaf.field ?? "")) {
    return null;
  }
  const children = (id: string) => filters.filter((f) => f.parentId === id).length;
  if (filters.some((f) => f.type === "multi" && children(f.id) > 1)) return null;
  return { filterId: leaf.id, productIds: splitIds(leaf.value) };
}

/** The filter tree the Shopware Administration writes for "Produkt ist eins von". */
export function productListFilterTree(productIds: string[]) {
  return [
    {
      id: newId(),
      type: "multi",
      operator: "OR",
      position: 0,
      queries: [
        {
          id: newId(),
          type: "multi",
          operator: "AND",
          position: 0,
          queries: [{ id: newId(), type: "equalsAny", field: "id", value: productIds.join("|"), position: 0 }],
        },
      ],
    },
  ];
}

/** Main products a stream selects right now. */
export async function streamProducts(
  event: H3Event,
  apiFilter: Record<string, unknown>[] | null | undefined,
  sort: { field: string; order: "ASC" | "DESC" } = { field: "name", order: "ASC" },
  limit = 100,
): Promise<ExtraProduct[]> {
  if (!apiFilter?.length) return [];
  const { data } = await adminSearch<{ id: string; productNumber: string; translated: { name: string } }>(
    event,
    "product",
    {
      filter: [...apiFilter, { type: "equals", field: "parentId", value: null }],
      sort: [{ ...sort, naturalSorting: true }],
      limit,
      includes: { product: ["id", "productNumber", "translated"] },
    },
  );
  // some imported names start with a space
  return data.map((p) => ({ id: p.id, number: p.productNumber, name: p.translated.name.trim() }));
}

async function loadStreams(event: H3Event, ids?: string[]) {
  const [{ data: streams }, { data: categories }, crossSellings] = await Promise.all([
    adminSearch<StreamRow>(event, "product-stream", {
      ...(ids ? { ids } : {}),
      limit: 200,
      associations: { filters: {} },
      includes: {
        product_stream: ["id", "name", "translated", "apiFilter", "filters"],
        product_stream_filter: ["id", "parentId", "type", "field", "value"],
      },
    }),
    adminSearch<{ productStreamId: string }>(event, "category", {
      filter: [{ type: "not", queries: [{ type: "equals", field: "productStreamId", value: null }] }],
      includes: { category: ["productStreamId"] },
      limit: 500,
    }),
    adminSearch<never>(event, "product-cross-selling", {
      filter: [{ type: "equals", field: "type", value: "productStream" }],
      limit: 1,
      aggregations: [{ name: "streams", type: "terms", field: "productStreamId", limit: 200 }],
    }),
  ]);
  const ofCategories = new Set(categories.map((c) => c.productStreamId));
  const buckets =
    (crossSellings as { aggregations?: { streams?: { buckets: { key: string; count: number }[] } } }).aggregations
      ?.streams?.buckets ?? [];
  const dishCount = new Map(buckets.map((b) => [b.key, b.count]));
  return streams
    .filter((s) => !ofCategories.has(s.id))
    .map((s) => ({ row: s, filter: productListFilter(s.filters), dishCount: dishCount.get(s.id) ?? 0 }));
}

/** All extras groups, by name. */
export async function loadExtraGroups(event: H3Event): Promise<ExtraGroup[]> {
  const streams = await loadStreams(event);
  const groups = await Promise.all(
    streams.map(async ({ row, filter, dishCount }) => ({
      id: row.id,
      name: (row.translated.name ?? row.name ?? "").trim(),
      editable: filter !== null,
      productIds: filter?.productIds ?? [],
      // Shopware sorts the names of some imports oddly, the list reads better alphabetically
      products: (await streamProducts(event, row.apiFilter)).sort((a, b) => a.name.localeCompare(b.name, "de")),
      dishCount,
    })),
  );
  return groups.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function createExtraGroup(event: H3Event, input: ExtraGroupInput) {
  const id = newId();
  await adminApi(event, "/_action/sync", {
    method: "POST",
    body: [
      {
        key: "group",
        action: "upsert",
        entity: "product_stream",
        payload: [{ id, name: input.name, filters: productListFilterTree(input.productIds) }],
      },
    ],
  });
  return id;
}

/** Writes name and products only when they change; the stream then selects the new products at every dish. */
export async function saveExtraGroup(event: H3Event, id: string, input: ExtraGroupInput) {
  const stream = (await loadStreams(event, [id]))[0];
  if (!stream) throw createError({ statusCode: 404, statusMessage: "Extras-Gruppe nicht gefunden" });
  if (!stream.filter) {
    throw createError({
      statusCode: 409,
      statusMessage: "Diese Gruppe hat eigene Regeln, bitte in der Shopware Administration ändern",
    });
  }
  const { filterId, productIds } = stream.filter;
  const name = (stream.row.translated.name ?? stream.row.name ?? "").trim();
  const ops = [];
  if (name !== input.name) {
    ops.push({ key: "name", action: "upsert", entity: "product_stream", payload: [{ id, name: input.name }] });
  }
  if (productIds.join("|") !== input.productIds.join("|")) {
    ops.push({
      key: "products",
      action: "upsert",
      entity: "product_stream_filter",
      payload: [{ id: filterId, productStreamId: id, value: input.productIds.join("|") }],
    });
  }
  if (ops.length) await adminApi(event, "/_action/sync", { method: "POST", body: ops });
}

/** Only an unused group can go; a group in use would leave dishes without extras. */
export async function deleteExtraGroup(event: H3Event, id: string) {
  const stream = (await loadStreams(event, [id]))[0];
  if (!stream) throw createError({ statusCode: 404, statusMessage: "Extras-Gruppe nicht gefunden" });
  if (stream.dishCount) {
    throw createError({
      statusCode: 409,
      statusMessage: `Die Gruppe ist noch an ${stream.dishCount === 1 ? "1 Gericht" : `${stream.dishCount} Gerichten`}`,
    });
  }
  await adminApi(event, `/product-stream/${id}`, { method: "DELETE" });
}
