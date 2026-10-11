import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

export default defineEventHandler(async (event) => {
  await deleteExtraGroup(event, Id.parse(getRouterParam(event, "id")));
  return loadExtraGroups(event);
});
