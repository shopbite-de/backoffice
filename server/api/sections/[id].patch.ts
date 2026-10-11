import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);
const Body = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  visible: z.boolean().optional(),
  move: z.enum(["up", "down"]).optional(),
  seo: z
    .object({
      title: z.string().trim().max(255),
      description: z.string().trim().max(255),
      // "Speisekarte/Pizza/": letters, digits, - and /, ends with /
      path: z
        .string()
        .trim()
        .regex(/^([\p{L}\p{N}-]+\/)+$/u, "SEO-Pfad wie Speisekarte/Pizza/ (endet mit /)")
        .or(z.literal("")),
    })
    .optional(),
});

/**
 * One sync request: name, visibility, order and the SEO URL of the section.
 * A custom path is marked isModified, so Shopware keeps it on a rename;
 * the storefront redirects the old path (301).
 */
export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  const body = await readValidBody(event, Body);
  const { channel, rows, seoUrls } = await loadSections(event);
  if (!rows.some((r) => r.id === id)) throw createError({ statusCode: 404, statusMessage: "Abschnitt nicht gefunden" });

  const category: Record<string, unknown> = { id };
  if (body.name !== undefined) category.name = body.name;
  if (body.visible !== undefined) category.active = body.visible;
  if (body.seo) {
    category.metaTitle = body.seo.title || null;
    category.metaDescription = body.seo.description || null;
  }

  const payload: Record<string, unknown>[] = [category];
  if (body.move) {
    const order = rows.map((r) => r.id);
    const from = order.indexOf(id);
    const to = body.move === "up" ? from - 1 : from + 1;
    if (to >= 0 && to < order.length) {
      [order[from], order[to]] = [order[to]!, order[from]!];
      // rewrite the linked list for every sibling whose predecessor changed
      order.forEach((sectionId, i) => {
        const after = i === 0 ? null : order[i - 1]!;
        if (rows.find((r) => r.id === sectionId)?.afterCategoryId !== after) {
          const row = payload.find((p) => p.id === sectionId) ?? { id: sectionId };
          row.afterCategoryId = after;
          if (!payload.includes(row)) payload.push(row);
        }
      });
    }
  }

  const ops: Record<string, unknown>[] = [{ key: "sections", action: "upsert", entity: "category", payload }];
  const current = seoUrls.find((s) => s.foreignKey === id);
  if (body.seo?.path && body.seo.path !== current?.seoPathInfo) {
    // like Shopware's own SEO persister: the old path stays as a non-canonical
    // alias, which the storefront redirects (301) to the new one
    // a path is unique per channel and language: an earlier alias of this
    // section is promoted again, a path of another page is refused
    const { data: taken } = await adminSearch<{ id: string; foreignKey: string }>(event, "seo-url", {
      filter: [
        { type: "equals", field: "salesChannelId", value: channel.id },
        { type: "equals", field: "languageId", value: channel.languageId },
        { type: "equals", field: "seoPathInfo", value: body.seo.path },
      ],
      includes: { seo_url: ["id", "foreignKey"] },
    });
    if (taken.some((t) => t.foreignKey !== id)) {
      throw createError({ statusCode: 409, statusMessage: "Dieser SEO-Pfad gehört schon zu einer anderen Seite" });
    }
    if (current) {
      ops.push({
        key: "seo-old",
        action: "upsert",
        entity: "seo_url",
        payload: [{ id: current.id, isCanonical: null }],
      });
    }
    ops.push({
      key: "seo",
      action: "upsert",
      entity: "seo_url",
      payload: [
        {
          id: taken[0]?.id ?? crypto.randomUUID().replaceAll("-", ""),
          salesChannelId: channel.id,
          languageId: channel.languageId,
          foreignKey: id,
          routeName: "frontend.navigation.page",
          pathInfo: `/navigation/${id}`,
          seoPathInfo: body.seo.path,
          isCanonical: true,
          isModified: true,
        },
      ],
    });
  }
  await adminApi(event, "/_action/sync", { method: "POST", body: ops });
  return (await loadSections(event)).sections;
});
