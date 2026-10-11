import { z } from "zod";

const Body = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben").max(255),
  // a sub-section of this section; omitted = a new section of the menu
  parentId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
});

/** A new section (or sub-section) goes to the end of its siblings. */
export default defineEventHandler(async (event) => {
  const { name, parentId } = await readValidBody(event, Body);
  const { channel, rows } = await loadSections(event);
  if (parentId && !rows.some((r) => r.id === parentId && r.parentId === channel.menuCategoryId)) {
    throw createError({ statusCode: 400, statusMessage: "Unterabschnitte gibt es nur in Abschnitten der Karte" });
  }
  const parent = parentId ?? channel.menuCategoryId;
  await adminApi(event, "/category", {
    method: "POST",
    body: {
      id: crypto.randomUUID().replaceAll("-", ""),
      parentId: parent,
      afterCategoryId: siblingsOf(rows, parent).at(-1)?.id ?? null,
      name,
      type: "page",
      active: true,
      visible: true,
      displayNestedProducts: true,
      productAssignmentType: "product",
    },
  });
  await purgeStorefronts(event, { categories: [parent] });
  return (await loadSections(event)).sections;
});
