import { z } from "zod";

const Body = z.object({
  username: z.string().trim().min(1, "Bitte Benutzernamen eingeben"),
  password: z.string().min(1, "Bitte Passwort eingeben"),
});

export default defineEventHandler(async (event) => {
  const { username, password } = await readValidBody(event, Body);
  try {
    await loginWithPassword(event, username, password);
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Benutzername oder Passwort stimmt nicht" });
  }
  await assertCanWork(event);
  return { ok: true };
});
