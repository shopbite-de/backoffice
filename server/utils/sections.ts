import type { H3Event } from "h3";
import type { MenuSectionDetail } from "#shared/types/backoffice";

interface CategoryRow {
  id: string;
  afterCategoryId: string | null;
  active: boolean;
  productAssignmentType: string;
  translated: { name: string; metaTitle: string | null; metaDescription: string | null };
  productCount?: number;
}

interface SeoUrlRow {
  id: string;
  foreignKey: string;
  seoPathInfo: string;
  isModified: boolean;
}

const ROUTE = "frontend.navigation.page";

/** Shopware keeps siblings as a linked list (afterCategoryId). */
export function sortSiblings<T extends { id: string; afterCategoryId: string | null }>(rows: T[]): T[] {
  const byAfter = new Map(rows.map((c) => [c.afterCategoryId, c]));
  const sorted: T[] = [];
  let next = byAfter.get(null);
  while (next && sorted.length < rows.length) {
    sorted.push(next);
    next = byAfter.get(next.id);
  }
  return [...sorted, ...rows.filter((c) => !sorted.includes(c))];
}

export async function loadSections(event: H3Event) {
  const channel = await currentSalesChannel(event);
  const { data } = await adminSearch<CategoryRow>(event, "category", {
    filter: [{ type: "equals", field: "parentId", value: channel.menuCategoryId }],
    includes: { category: ["id", "afterCategoryId", "active", "productAssignmentType", "translated"] },
    limit: 200,
  });
  const ids = data.map((c) => c.id);
  const [seo, counts] = await Promise.all([
    ids.length
      ? adminSearch<SeoUrlRow>(event, "seo-url", {
          filter: [
            { type: "equals", field: "routeName", value: ROUTE },
            { type: "equals", field: "isCanonical", value: true },
            { type: "equals", field: "salesChannelId", value: channel.id },
            { type: "equals", field: "languageId", value: channel.languageId },
            { type: "equalsAny", field: "foreignKey", value: ids },
          ],
          includes: { seo_url: ["id", "foreignKey", "seoPathInfo", "isModified"] },
        })
      : { data: [] },
    adminSearch<never>(event, "product", {
      limit: 1,
      filter: [
        { type: "equals", field: "parentId", value: null },
        { type: "equalsAny", field: "categoryIds", value: ids },
      ],
      aggregations: [{ name: "perCategory", type: "terms", field: "categories.id" }],
    }) as Promise<{ aggregations?: { perCategory?: { buckets: { key: string; count: number }[] } } }>,
  ]);
  const count = new Map((counts.aggregations?.perCategory?.buckets ?? []).map((b) => [b.key, b.count]));
  const sections: MenuSectionDetail[] = sortSiblings(data).map((c) => {
    const url = seo.data.find((s) => s.foreignKey === c.id);
    return {
      id: c.id,
      name: c.translated.name,
      visible: c.active,
      dishCount: count.get(c.id) ?? 0,
      seo: {
        title: c.translated.metaTitle ?? "",
        description: c.translated.metaDescription ?? "",
        path: url?.seoPathInfo ?? "",
        pathIsCustom: url?.isModified ?? false,
      },
    };
  });
  return { channel, rows: sortSiblings(data), sections, seoUrls: seo.data };
}
