<script setup lang="ts">
import { Clock, ClipboardList, LogOut, UtensilsCrossed } from "@lucide/vue";
import type { Capability } from "#shared/types/backoffice";

const route = useRoute();
const session = useAuthState();
const auth = computed(() => (session.value?.loggedIn ? session.value : null));

const LINKS: { to: string; label: string; icon: typeof Clock; capability: Capability }[] = [
  { to: "/", label: "Heute", icon: ClipboardList, capability: "orders" },
  { to: "/speisekarte", label: "Speisekarte", icon: UtensilsCrossed, capability: "menu" },
  { to: "/oeffnungszeiten", label: "Öffnungszeiten", icon: Clock, capability: "hours" },
];
// the role decides which areas a person sees (Shopware enforces it on top)
const links = computed(() => LINKS.filter((l) => auth.value?.capabilities.includes(l.capability)));
// a section stays marked on its sub pages (dish editor, sections)
const isActive = (to: string) => (to === "/" ? route.path === "/" : route.path.startsWith(to));
const roleLabel = computed(() => (auth.value?.role === "management" ? "Management" : "Personal"));

async function logout() {
  await $fetch("/api/auth/logout", { method: "POST" });
  session.value = { loggedIn: false };
  await navigateTo("/login");
}

// menu, hours and settings belong to one branch; reload the page data after a switch
async function switchChannel(id: unknown) {
  await $fetch("/api/channels/active", { method: "PUT", body: { id } });
  session.value = await $fetch<AuthState>("/api/auth/session");
  await refreshNuxtData();
}
</script>

<template>
  <!-- two columns only with the sidebar; the login page is centred -->
  <div class="min-h-dvh" :class="{ 'md:grid md:grid-cols-[16rem_1fr]': auth }">
    <a
      href="#inhalt"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >Zum Inhalt</a
    >
    <header v-if="auth" class="border-b bg-card md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
      <div class="flex h-full flex-col">
        <div class="space-y-3 px-4 py-3 md:px-5 md:py-6">
          <img src="/brand/shopbite-logo.svg" alt="ShopBite" width="324" height="103" class="hidden h-7 w-auto md:mb-5 md:block" />
          <div class="flex items-center justify-between gap-2 md:block">
            <div>
              <p class="text-lg font-semibold">{{ auth.restaurant }}</p>
              <p class="text-sm text-muted-foreground">{{ auth.name }} · {{ roleLabel }}</p>
            </div>
            <Button variant="ghost" size="icon" class="md:hidden" @click="logout">
              <LogOut aria-hidden="true" /><span class="sr-only">Abmelden</span>
            </Button>
          </div>
          <div v-if="auth.channels.length > 1" class="grid gap-1.5">
            <Label for="filiale" class="text-muted-foreground">Filiale</Label>
            <NativeSelect id="filiale" class="w-full" :model-value="auth.channelId" @update:model-value="switchChannel">
              <option v-for="c in auth.channels" :key="c.id" :value="c.id">{{ c.name }}</option>
            </NativeSelect>
          </div>
          <p v-else-if="auth.channels[0]" class="text-sm text-muted-foreground">{{ auth.channels[0].name }}</p>
        </div>
        <nav aria-label="Bereiche" class="md:flex-1">
          <ul class="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="flex min-h-11 items-center gap-3 whitespace-nowrap rounded-lg px-3 font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                :class="{ 'bg-accent text-accent-foreground': isActive(link.to) }"
                :aria-current="isActive(link.to) ? 'page' : undefined"
              >
                <component :is="link.icon" class="size-5" aria-hidden="true" />{{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
        <div class="hidden p-3 md:block">
          <Button variant="ghost" class="w-full justify-start" @click="logout">
            <LogOut aria-hidden="true" />Abmelden<span class="sr-only"> ({{ auth.username }})</span>
          </Button>
        </div>
      </div>
    </header>
    <main id="inhalt" tabindex="-1" class="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <slot />
    </main>
  </div>
</template>
