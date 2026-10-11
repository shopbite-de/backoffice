import type { H3Event } from "h3";
import { FetchError } from "ofetch";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Same OAuth client the Shopware Administration uses for its users. */
const CLIENT_ID = "administration";

/** This restaurant's own Shopware; one backoffice runs per installation. */
const baseUrl = () => useRuntimeConfig().shopwareUrl.replace(/\/$/, "");

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  return $fetch<TokenResponse>(`${baseUrl()}/api/oauth/token`, {
    method: "POST",
    body: { client_id: CLIENT_ID, scope: "write", ...body },
  });
}

async function storeTokens(event: H3Event, token: TokenResponse, extra: Partial<BackofficeSession> = {}) {
  // role and branches are read again on every refresh (every 10 minutes),
  // so a changed role in Shopware takes effect without a new login
  const profile = await fetchProfile(baseUrl(), token.access_token);
  const session = await useShopwareSession(event);
  await session.update({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    // renew 30 s before Shopware's 10 minutes run out
    expiresAt: Date.now() + (token.expires_in - 30) * 1000,
    ...profile,
    ...extra,
  });
}

/**
 * Logs in with a passkey: the signed WebAuthn assertion goes to the ShopBite plugin's
 * grant (grant_type=shopbite_passkey), which answers like a password login.
 */
export async function loginWithPasskey(event: H3Event, credential: unknown) {
  const token = await requestToken({ grant_type: "shopbite_passkey", credential: JSON.stringify(credential) });
  const session = await useShopwareSession(event);
  await session.clear();
  await storeTokens(event, token);
}

/** Logs in with the person's Shopware user; the password is never stored. */
export async function loginWithPassword(event: H3Event, username: string, password: string) {
  const token = await requestToken({
    grant_type: "password",
    username,
    password,
  });
  const session = await useShopwareSession(event);
  await session.clear();
  await storeTokens(event, token, { username });
}

async function accessToken(event: H3Event, forceRefresh = false) {
  const session = await useShopwareSession(event);
  const { accessToken, refreshToken, expiresAt } = session.data;
  if (!refreshToken) {
    throw createError({ statusCode: 401, statusMessage: "Nicht angemeldet" });
  }
  if (!forceRefresh && accessToken && expiresAt && expiresAt > Date.now()) {
    return accessToken;
  }
  try {
    const token = await requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    await storeTokens(event, token);
    return token.access_token;
  } catch {
    await session.clear();
    throw createError({ statusCode: 401, statusMessage: "Sitzung abgelaufen" });
  }
}

/**
 * Calls the Shopware Admin API as the logged-in user. Shopware checks the
 * user's ACL role on every request, so the backoffice never needs more
 * rights than the person using it.
 */
export async function adminApi<T>(
  event: H3Event,
  path: string,
  options: Parameters<typeof $fetch>[1] = {},
): Promise<T> {
  const call = async (token: string) =>
    $fetch<T>(`${baseUrl()}/api${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string> | undefined),
      },
    } as Parameters<typeof $fetch>[1]) as Promise<T>;

  try {
    return await call(await accessToken(event));
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 401) {
      return call(await accessToken(event, true));
    }
    throw toH3Error(error);
  }
}

function toH3Error(error: unknown) {
  if (error instanceof FetchError) {
    const detail = (error.data as { errors?: { detail?: string }[] } | undefined)?.errors?.[0]?.detail;
    // the missing privilege is only for the server log, not for the restaurant
    if (error.statusCode === 403) console.warn("[shopware 403]", detail);
    return createError({
      statusCode: error.statusCode ?? 502,
      statusMessage:
        error.statusCode === 403
          ? "Dafür fehlt dieser Anmeldung die Berechtigung"
          : (detail ?? "Shopware hat die Anfrage abgelehnt"),
    });
  }
  return error;
}

export interface SearchResult<T> {
  data: T[];
  total?: number;
}

/** POST /api/search/<entity> with a criteria body. */
export function adminSearch<T>(event: H3Event, entity: string, criteria: Record<string, unknown>) {
  return adminApi<SearchResult<T>>(event, `/search/${entity}`, {
    method: "POST",
    body: criteria,
  });
}
