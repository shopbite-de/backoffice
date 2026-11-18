import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The menu category per branch comes from the plugin settings, cached for a minute. A person bound
 * to some branches only sees those branches' settings, so the cache must never hand the next person
 * a branch the first one could not see.
 */
const CHANNELS = {
  nord: { menuCategoryId: "menu-nord" },
  sued: { menuCategoryId: "menu-sued" },
};
let user: { channelIds: string[] | null } = { channelIds: null };
let now = 1_000_000;
const settingsCalls: (string[] | null)[] = [];

vi.stubGlobal("useRuntimeConfig", () => ({ salesChannels: "" }));
vi.stubGlobal("createError", (input: unknown) => input);
vi.stubGlobal("useShopwareSession", async () => ({ data: user }));
vi.stubGlobal("adminSearch", async () => ({
  data: Object.keys(CHANNELS)
    .filter((id) => !user.channelIds || user.channelIds.includes(id))
    .map((id) => ({
      id,
      translated: { name: id },
      navigationCategoryId: `nav-${id}`,
      currencyId: "c",
      languageId: "l",
    })),
}));
// the plugin answers only with the branches of the calling person
vi.stubGlobal("adminApi", async () => {
  settingsCalls.push(user.channelIds);
  const visible = Object.entries(CHANNELS).filter(([id]) => !user.channelIds || user.channelIds.includes(id));
  return { channels: Object.fromEntries(visible) };
});
vi.spyOn(Date, "now").mockImplementation(() => now);

const { restaurantChannels } = await import("../server/utils/salesChannel");
const menus = async () =>
  Object.fromEntries((await restaurantChannels({} as never)).map((c) => [c.id, c.menuCategoryId]));

beforeEach(() => {
  // past every cache entry of the previous test
  now += 10 * 60_000;
  settingsCalls.length = 0;
});

describe("menu category cache", () => {
  it("gives a person of another branch that branch's menu, not the navigation category", async () => {
    user = { channelIds: ["nord"] };
    expect(await menus()).toEqual({ nord: "menu-nord" });
    user = { channelIds: ["sued"] };
    expect(await menus()).toEqual({ sued: "menu-sued" });
  });

  it("reuses cached branches for a minute", async () => {
    user = { channelIds: null };
    await menus();
    user = { channelIds: ["sued"] };
    expect(await menus()).toEqual({ sued: "menu-sued" });
    expect(settingsCalls).toHaveLength(1);
    now += 60_000;
    await menus();
    expect(settingsCalls).toHaveLength(2);
  });

  it("falls back to the navigation category when the plugin has none", async () => {
    user = { channelIds: null };
    const saved = CHANNELS.sued.menuCategoryId;
    (CHANNELS.sued as { menuCategoryId?: string }).menuCategoryId = undefined;
    expect(await menus()).toEqual({ nord: "menu-nord", sued: "nav-sued" });
    CHANNELS.sued.menuCategoryId = saved;
  });
});
