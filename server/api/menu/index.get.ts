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
  const sectionOf = new Map<string, string>();
  for (const section of sections) sectionOf.set(section.id, section.id);
  // deeper levels: walk up until a section is found
  const byId = new Map(categories.data.map((c) => [c.id, c]));
  for (const category of categories.data) {
    let cursor: Category | undefined = category;
    while (cursor && !sectionOf.has(cursor.id)) {
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    if (cursor) sectionOf.set(category.id, sectionOf.get(cursor.id)!);
  }

  const products = await adminSearch<Product>(event, "product", {
    limit: 500,
    filter: [
      { type: "equals", field: "parentId", value: null },
      { type: "equalsAny", field: "categories.id", value: [...sectionOf.keys()] },
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
  }));
  const menuById = new Map(menu.map((s) => [s.id, s]));
  for (const product of products.data) {
    const sectionId = (product.categoryIds ?? []).map((id) => sectionOf.get(id)).find(Boolean);
    const section = sectionId ? menuById.get(sectionId) : undefined;
    if (!section) continue;
    const price = product.price?.find((p) => p.currencyId === channel.currencyId) ?? product.price?.[0];
    section.dishes.push({
      id: product.id,
      number: product.productNumber,
      name: product.translated.name,
      onMenu: product.active,
      price: price?.gross ?? null,
      allergensChecked: product.customFields?.shopbite_allergens_checked === true,
    });
  }
  return menu;
});
