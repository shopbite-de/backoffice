import type { H3Event } from "h3";
import type { Capability, StaffRole } from "#shared/types/backoffice";

/**
 * The Shopware Admin API tokens live in a sealed, httpOnly cookie. The
 * browser only talks to this server (backend for frontend), so a token can
 * never leak into client code.
 */
export interface BackofficeSession {
  username?: string;
  name?: string;
  role?: StaffRole;
  capabilities?: Capability[];
  /** null = all branches, otherwise only these sales channels */
  channelIds?: string[] | null;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  channelId?: string;
}

export function useShopwareSession(event: H3Event) {
  const { session } = useRuntimeConfig(event);
  if (session.password.length < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: "NUXT_SESSION_PASSWORD must have at least 32 characters",
    });
  }
  return useSession<BackofficeSession>(event, {
    name: "sb-backoffice",
    password: session.password,
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, sameSite: "lax", secure: !import.meta.dev && session.secure !== false },
  });
}
