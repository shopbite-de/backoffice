import type { H3Event } from "h3";
import { FetchError } from "ofetch";

/** How long a confirmed password counts for adding a device (Shopware's token lives 10 minutes). */
export const VERIFIED_FOR_MS = 5 * 60 * 1000;

/**
 * Step 1 of adding a passkey: the plugin wants a token with the scope "user-verified", so the
 * person confirms the password (behind the login limiter). That token asks for the WebAuthn
 * options and waits in the sealed session for step 2; its refresh token is thrown away.
 */
export async function startPasskeyRegistration(event: H3Event, password: string) {
  const session = await useShopwareSession(event);
  const username = session.data.username;
  if (!username) throw createError({ statusCode: 401, statusMessage: "Nicht angemeldet" });

  const keys = loginKeys(event, username);
  assertLoginAllowed(event, keys);
  let token: Awaited<ReturnType<typeof requestVerifiedToken>>;
  try {
    token = await requestVerifiedToken(username, password);
  } catch (error) {
    // invalid_grant; not 401, the browser would take that for a lost session
    if (error instanceof FetchError && (error.statusCode === 400 || error.statusCode === 401)) {
      loginFailed(keys);
      throw createError({ statusCode: 400, statusMessage: "Falsches Passwort" });
    }
    throw createError({ statusCode: 502, statusMessage: "Shopware ist gerade nicht erreichbar" });
  }
  loginSucceeded(keys);

  await session.update({
    verifiedToken: token.access_token,
    verifiedUntil: Date.now() + Math.min(VERIFIED_FOR_MS, (token.expires_in - 30) * 1000),
  });
  try {
    return await adminApiWithToken<Record<string, unknown>>(
      token.access_token,
      "/_action/shopbite/passkey/register-options",
      { method: "POST" },
    );
  } catch (error) {
    await session.update({ verifiedToken: undefined, verifiedUntil: undefined });
    throw error;
  }
}

/** Step 2: registers the device with the verified token from step 1, which is used only once. */
export async function finishPasskeyRegistration(event: H3Event, body: { name: string; credential: unknown }) {
  const session = await useShopwareSession(event);
  const { verifiedToken, verifiedUntil } = session.data;
  await session.update({ verifiedToken: undefined, verifiedUntil: undefined });
  if (!verifiedToken || !verifiedUntil || verifiedUntil <= Date.now()) throw passwordRequired();
  return adminApiWithToken<{ id: string }>(verifiedToken, "/_action/shopbite/passkey/register", {
    method: "POST",
    body,
  });
}
