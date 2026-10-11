import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  await adminApi(event, `/_action/shopbite/passkey/${id}`, { method: "DELETE" });
  return { ok: true };
});
