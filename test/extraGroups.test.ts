import { describe, expect, it } from "vitest";
import { productListFilter, productListFilterTree, type StreamFilterRow } from "../server/utils/extraGroups";

/* Which product streams the backoffice may edit as an extras group. */
const row = (
  id: string,
  parentId: string | null,
  type: string,
  field: string | null = null,
  value: string | null = null,
) => ({ id, parentId, type, field, value }) satisfies StreamFilterRow;
const A = "01970d094ee179f0a2d96fbe1d9c1496";
const B = "0197134d17ee728b87c742209ea377ec";

describe("productListFilter", () => {
  it("reads 'Produkt ist eins von' as the Shopware Administration writes it", () => {
    const filters = [
      row("r", null, "multi"),
      row("and", "r", "multi"),
      row("leaf", "and", "equalsAny", "id", `${A}|${B}`),
    ];
    expect(productListFilter(filters)).toEqual({ filterId: "leaf", productIds: [A, B] });
  });

  it("is null for other conditions", () => {
    const category = [
      row("r", null, "multi"),
      row("and", "r", "multi"),
      row("leaf", "and", "equalsAny", "categoriesRo.id", A),
    ];
    expect(productListFilter(category)).toBeNull();
    const twoConditions = [
      row("r", null, "multi"),
      row("and", "r", "multi"),
      row("l1", "and", "equalsAny", "id", A),
      row("l2", "and", "range", "price"),
    ];
    expect(productListFilter(twoConditions)).toBeNull();
    const orBranch = [
      row("r", null, "multi"),
      row("a1", "r", "multi"),
      row("a2", "r", "multi"),
      row("leaf", "a1", "equalsAny", "id", A),
    ];
    expect(productListFilter(orBranch)).toBeNull();
    expect(productListFilter([])).toBeNull();
  });

  it("writes a tree it can read again", () => {
    const flatten = (
      nodes: ReturnType<typeof productListFilterTree>,
      parentId: string | null = null,
    ): StreamFilterRow[] =>
      nodes.flatMap((n) => {
        const node = n as { id: string; type: string; field?: string; value?: string; queries?: never[] };
        return [
          row(node.id, parentId, node.type, node.field ?? null, node.value ?? null),
          ...flatten(node.queries ?? [], node.id),
        ];
      });
    expect(productListFilter(flatten(productListFilterTree([B, A])))?.productIds).toEqual([B, A]);
  });
});
