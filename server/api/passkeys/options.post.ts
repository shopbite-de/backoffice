import { z } from "zod";

const Body = z.object({
  password: z.string().min(1, "Bitte Passwort eingeben").max(1024),
});

/** Confirms the password and returns the WebAuthn options for a new device. */
export default defineEventHandler(async (event) => {
  const { password } = await readValidBody(event, Body);
  return startPasskeyRegistration(event, password);
});
