import type { Capability } from "#shared/types/backoffice";

declare module "#app" {
  interface PageMeta {
    /** role capability the page needs; others are sent to "Heute" */
    capability?: Capability;
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAuthState();
  const state: AuthState =
    session.value ?? (await $fetch<AuthState>("/api/auth/session"));
  session.value = state;
  if (!state.loggedIn && to.path !== "/login") return navigateTo("/login");
  if (state.loggedIn && to.path === "/login") return navigateTo("/");
  if (state.loggedIn && to.meta.capability && !state.capabilities.includes(to.meta.capability)) {
    return navigateTo("/");
  }
});
