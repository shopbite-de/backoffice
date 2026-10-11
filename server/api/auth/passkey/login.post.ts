import { z } from "zod";

// the browser's AuthenticationResponseJSON, checked in detail by the plugin
const Body = z.object({
  credential: z
    .object({ id: z.string().min(1), rawId: z.string().min(1), type: z.literal("public-key") })
    .passthrough(),
});

export default defineEventHandler(async (event) => {
  const { credential } = await readValidBody(event, Body);
  try {
    await loginWithPasskey(event, credential);
  } catch {
    throw createError({
      statusCode: 401,
      statusMessage: "Dieser Fingerabdruck ist hier nicht bekannt. Bitte mit Passwort anmelden.",
    });
  }
  await assertCanWork(event);
  return { ok: true };
});
