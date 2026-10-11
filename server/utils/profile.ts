import type { H3Event } from "h3";
import type { Capability, StaffRole } from "#shared/types/backoffice";

/**
 * Shopware privilege that unlocks each area. The backoffice only uses this
 * to show the right pages; Shopware enforces the privileges itself.
 */
const CAPABILITY_PRIVILEGE: Record<Capability, string> = {
  orders: "order:read",
  settings: "system_config:update",
  menu: "product:update",
  hours: "shopbite_business_hour:create",
};

/** User custom field with the sales channels (branches) a person works for. */
export const BRANCH_FIELD = "shopbite_sales_channel_ids";

export interface StaffProfile {
  name: string;
  role: StaffRole;
  capabilities: Capability[];
  /** null = every branch of the restaurant */
  channelIds: string[] | null;
}

export interface MeResponse {
  data: {
    firstName: string | null;
    lastName: string | null;
    admin: boolean;
    customFields: Record<string, unknown> | null;
    aclRoles: { privileges: string[] }[];
  };
}

export async function fetchProfile(baseUrl: string, token: string): Promise<StaffProfile> {
  const { data: me } = await $fetch<MeResponse>(`${baseUrl}/api/_info/me`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  return profileFromMe(me);
}

/** Role, capabilities and branches of a Shopware user (`/api/_info/me`). */
export function profileFromMe(me: MeResponse["data"]): StaffProfile {
  const privileges = new Set(me.aclRoles.flatMap((role) => role.privileges));
  const capabilities = (Object.keys(CAPABILITY_PRIVILEGE) as Capability[]).filter(
    (cap) => me.admin || privileges.has(CAPABILITY_PRIVILEGE[cap]),
  );
  const role: StaffRole = capabilities.includes("menu") ? "management" : "personal";
  const assigned = me.customFields?.[BRANCH_FIELD];
  const channelIds =
    Array.isArray(assigned) && assigned.length
      ? assigned.filter((id): id is string => typeof id === "string")
      : // without an assignment only management works across all branches
        role === "management"
        ? null
        : [];
  return {
    name: [me.firstName, me.lastName].filter(Boolean).join(" "),
    role,
    capabilities,
    channelIds,
  };
}

/** Throws 403 unless the logged-in person's role covers the area. */
export async function requireCapability(event: H3Event, capability: Capability) {
  const session = await useShopwareSession(event);
  if (!session.data.capabilities?.includes(capability)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Dafür fehlt dieser Anmeldung die Berechtigung",
    });
  }
}
