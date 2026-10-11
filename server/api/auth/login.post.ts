import { z } from "zod";

const Body = z.object({
  username: z.string().trim().min(1, "Bitte Benutzernamen eingeben").max(255),
  password: z.string().min(1, "Bitte Passwort eingeben").max(1024),
});

export default defineEventHandler(async (event) => {
  const { username, password } = await readValidBody(event, Body);
  const keys = loginKeys(event, username);
  assertLoginAllowed(event, keys);
  try {
    await loginWithPassword(event, username, password);
  } catch {
    loginFailed(keys);
    throw createError({ statusCode: 401, statusMessage: "Benutzername oder Passwort stimmt nicht" });
  }
  loginSucceeded(keys);
  await assertCanWork(event);
  return { ok: true };
});
