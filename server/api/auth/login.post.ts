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
  const session = await useShopwareSession(event);
  const { capabilities, channelIds } = session.data;
  const problem = !capabilities?.length
    ? "Dieser Zugang hat keine Rolle für das Backoffice."
    : channelIds?.length === 0
      ? "Dieser Zugang ist noch keiner Filiale zugeordnet."
      : null;
  if (problem) {
    await session.clear();
    throw createError({ statusCode: 403, statusMessage: `${problem} Bitte beim Management melden.` });
  }
  return { ok: true };
});
