import type { MenuSection } from "#shared/types/backoffice";

interface Category {
  id: string;
  parentId: string | null;
  afterCategoryId: string | null;
  translated: { name: string };
}

interface Product {
  id: string;
  productNumber: string;
  active: boolean;
  categoryIds: string[] | null;
  price: { currencyId: string; gross: number }[] | null;
  customFields: Record<string, unknown> | null;
  translated: { name: string };
}

/** Shopware keeps siblings as a linked list (afterCategoryId). */
function sortSiblings(categories: Category[]): Category[] {
  const byAfter = new Map(categories.map((c) => [c.afterCategoryId, c]));
  const sorted: Category[] = [];
  let next = byAfter.get(null);
  while (next && sorted.length < categories.length) {
    sorted.push(next);
    next = byAfter.get(next.id);
  }
  return [...sorted, ...categories.filter((c) => !sorted.includes(c))];
}

/**
 * The menu as the restaurant sees it: the sections under the menu category
 * (like the storefront), each with its dishes. Sub-sections are
 * folded into their section; extras (products without a category) are
 * not part of the menu.
 */
export default defineEventHandler(async (event): Promise<MenuSection[]> => {
  const channel = await currentSalesChannel(event);
  const rootId = channel.menuCategoryId;

  const categories = await adminSearch<Category>(event, "category", {
    limit: 500,
    filter: [{ type: "contains", field: "path", value: `|${rootId}|` }],
    includes: { category: ["id", "parentId", "afterCategoryId", "translated"] },
  });

  const sections = sortSiblings(categories.data.filter((c) => c.parentId === rootId));
  // every category maps to its section and, below it, its sub-section; deeper levels fold into the sub-section
  const placeOf = new Map<string, { section: string; sub: string | null }>();
  const byId = new Map(categories.data.map((c) => [c.id, c]));
  for (const category of categories.data) {
    const chain: Category[] = [];
    let cursor: Category | undefined = category;
    while (cursor && cursor.id !== rootId) {
      chain.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    if (chain[0] && chain[0].parentId === rootId) {
      placeOf.set(category.id, { section: chain[0].id, sub: chain[1]?.id ?? null });
    }
  }

  const products = await adminSearch<Product>(event, "product", {
    limit: 500,
    filter: [
      { type: "equals", field: "parentId", value: null },
      { type: "equalsAny", field: "categories.id", value: [...placeOf.keys()] },
    ],
    sort: [{ field: "productNumber", order: "ASC", naturalSorting: true }],
    includes: {
      product: ["id", "productNumber", "active", "categoryIds", "price", "customFields", "translated"],
    },
  });

  const menu: MenuSection[] = sections.map((s) => ({
    id: s.id,
    name: s.translated.name,
    dishes: [],
    subsections: sortSiblings(categories.data.filter((c) => c.parentId === s.id)).map((sub) => ({
      id: sub.id,
      name: sub.translated.name,
      dishes: [],
    })),
  }));
  const menuById = new Map(menu.map((s) => [s.id, s]));
  for (const product of products.data) {
    const place = (product.categoryIds ?? []).map((id) => placeOf.get(id)).find(Boolean);
    const section = place ? menuById.get(place.section) : undefined;
    if (!section || !place) continue;
    const price = product.price?.find((p) => p.currencyId === channel.currencyId) ?? product.price?.[0];
    const dish = {
      id: product.id,
      number: product.productNumber,
      name: product.translated.name,
      onMenu: product.active,
      price: price?.gross ?? null,
      allergensChecked: product.customFields?.shopbite_allergens_checked === true,
    };
    const target = place.sub ? section.subsections.find((sub) => sub.id === place.sub) : undefined;
    (target ?? section).dishes.push(dish);
  }
  return menu;
});
