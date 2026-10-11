import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  await saveExtraGroup(event, id, await readValidBody(event, ExtraGroupBody));
  return loadExtraGroups(event);
});
