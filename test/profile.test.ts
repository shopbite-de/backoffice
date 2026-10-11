import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("createError", (input: unknown) => input);
vi.stubGlobal("useShopwareSession", vi.fn());

const { profileFromMe } = await import("../server/utils/profile");
const management = (await import("../docs/notes/management-privileges.json")).default as string[];
const personal = (await import("../docs/notes/personal-privileges.json")).default as string[];

const me = (privileges: string[], customFields: Record<string, unknown> | null = null, admin = false) => ({
  firstName: "Anna",
  lastName: "Rossi",
  admin,
  customFields,
  aclRoles: [{ privileges }],
});

describe("profileFromMe", () => {
  it("gives management every area and all branches without an assignment", () => {
    expect(profileFromMe(me(management))).toEqual({
      name: "Anna Rossi",
      role: "management",
      capabilities: ["orders", "settings", "menu", "hours"],
      channelIds: null,
    });
  });

  it("gives staff orders and settings of their own branch", () => {
    const profile = profileFromMe(me(personal, { shopbite_sales_channel_ids: ["b1"] }));
    expect(profile.role).toBe("personal");
    expect(profile.capabilities).toEqual(["orders", "settings"]);
    expect(profile.channelIds).toEqual(["b1"]);
  });

  it("leaves staff without a branch with no channel (login is refused)", () => {
    expect(profileFromMe(me(personal)).channelIds).toEqual([]);
    expect(profileFromMe(me(personal, { shopbite_sales_channel_ids: "b1" })).channelIds).toEqual([]);
  });

  it("binds management to branches when assigned", () => {
    expect(profileFromMe(me(management, { shopbite_sales_channel_ids: ["b1", 7] })).channelIds).toEqual(["b1"]);
  });

  it("treats a Shopware admin as management", () => {
    expect(profileFromMe(me([], null, true)).capabilities).toHaveLength(4);
  });

  it("keeps the role privilege lists sorted and free of duplicates", () => {
    for (const list of [management, personal]) {
      expect([...new Set(list)].sort()).toEqual(list);
    }
    expect(personal).not.toContain("product:update");
  });
});
