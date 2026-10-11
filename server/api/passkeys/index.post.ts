import { z } from "zod";

const Body = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen für das Gerät eingeben").max(100),
  // RegistrationResponseJSON from the browser, checked by the plugin
  credential: z.object({ id: z.string().min(1), type: z.literal("public-key") }).passthrough(),
});

export default defineEventHandler(async (event) => {
  const { name, credential } = await readValidBody(event, Body);
  return adminApi<{ id: string }>(event, "/_action/shopbite/passkey/register", {
    method: "POST",
    body: { name, credential },
  });
});
