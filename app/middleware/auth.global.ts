import { FetchError } from "ofetch";
import type { Capability } from "#shared/types/backoffice";

declare module "#app" {
  interface PageMeta {
    /** role capability the page needs; others are sent to "Heute" */
    capability?: Capability;
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/offline") return;
  const session = useAuthState();
  let state = session.value;
  if (!state) {
    try {
      state = await $fetch<AuthState>("/api/auth/session");
    } catch (error) {
      // no network (installed app opened offline): a friendly page instead of an error
      if (error instanceof FetchError && !error.response) {
        return navigateTo({ path: "/offline", query: { weiter: to.fullPath } });
      }
      throw error;
    }
  }
  session.value = state;
  if (!state.loggedIn && to.path !== "/login") return navigateTo("/login");
  if (state.loggedIn && to.path === "/login") return navigateTo("/");
  if (state.loggedIn && to.meta.capability && !state.capabilities.includes(to.meta.capability)) {
    return navigateTo("/");
  }
});
