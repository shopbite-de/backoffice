import type { Capability, StaffRole } from "#shared/types/backoffice";
import { FetchError } from "ofetch";

/** $fetch against the backoffice server; a lost session goes to the login. */
export function useBackofficeApi() {
  const session = useAuthState();
  const stale = useStorefrontStale();
  // untyped on purpose: Nitro's typed routes overflow the type checker here
  const request = $fetch as unknown as (url: string, options?: object) => Promise<unknown>;
  return async <T>(url: string, options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}) => {
    try {
      return (await request(url, {
        ...options,
        // a save that could not empty a storefront's cache (server/utils/storefrontCache.ts)
        onResponse: ({ response }: { response: Response }) => {
          if (options.method && options.method !== "GET") stale.value = response.headers.has("x-storefront-stale");
        },
      })) as T;
    } catch (error) {
      if (error instanceof FetchError && error.statusCode === 401) {
        session.value = { loggedIn: false };
        await navigateTo("/login");
      }
      throw error;
    }
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    return error.data?.statusMessage ?? error.statusMessage ?? "Das hat nicht geklappt";
  }
  return "Das hat nicht geklappt";
}

export type AuthState =
  | { loggedIn: false }
  | {
      loggedIn: true;
      username: string;
      name: string;
      role: StaffRole;
      capabilities: Capability[];
      restaurant: string;
      channels: { id: string; name: string }[];
      channelId: string;
    };

export function useAuthState() {
  return useState<AuthState | null>("backoffice-session", () => null);
}

/** true after a save whose change the shop may show only later (cache not emptied). */
export function useStorefrontStale() {
  return useState("storefront-stale", () => false);
}
