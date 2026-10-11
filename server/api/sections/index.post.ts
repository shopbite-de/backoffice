import { z } from "zod";

const Body = z.object({ name: z.string().trim().min(1, "Bitte einen Namen eingeben").max(255) });

/** A new section goes to the end of the menu. */
export default defineEventHandler(async (event) => {
  const { name } = await readValidBody(event, Body);
  const { channel, rows } = await loadSections(event);
  await adminApi(event, "/category", {
    method: "POST",
    body: {
      id: crypto.randomUUID().replaceAll("-", ""),
      parentId: channel.menuCategoryId,
      afterCategoryId: rows.at(-1)?.id ?? null,
      name,
      type: "page",
      active: true,
      visible: true,
      displayNestedProducts: true,
      productAssignmentType: "product",
    },
  });
  return (await loadSections(event)).sections;
});
