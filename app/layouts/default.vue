<script setup lang="ts">
import { CircleUser, Clock, ClipboardList, LogOut, Menu, TriangleAlert, UtensilsCrossed } from "@lucide/vue";
import type { Capability } from "#shared/types/backoffice";

const route = useRoute();
const session = useAuthState();
const stale = useStorefrontStale();
const auth = computed(() => (session.value?.loggedIn ? session.value : null));

// `short` is the label in the bottom bar of phones, where four words must fit in 360 px
const LINKS: { to: string; label: string; short: string; icon: typeof Clock; capability?: Capability }[] = [
  { to: "/", label: "Heute", short: "Heute", icon: ClipboardList, capability: "orders" },
  { to: "/speisekarte", label: "Speisekarte", short: "Karte", icon: UtensilsCrossed, capability: "menu" },
  { to: "/oeffnungszeiten", label: "Öffnungszeiten", short: "Zeiten", icon: Clock, capability: "hours" },
  // everyone: own passkeys
  { to: "/zugang", label: "Mein Zugang", short: "Zugang", icon: CircleUser },
];
// the role decides which areas a person sees (Shopware enforces it on top)
const links = computed(() => LINKS.filter((l) => !l.capability || auth.value?.capabilities.includes(l.capability)));
// a section stays marked on its sub pages (dish editor, sections)
const isActive = (to: string) => (to === "/" ? route.path === "/" : route.path.startsWith(to));
// two columns only with the sidebar (see template root); the login page is centred
const roleLabel = computed(() => (auth.value?.role === "management" ? "Management" : "Personal"));

// phones: account, branch and appearance sit in a drawer behind "Menü"
const drawer = ref(false);
watch(
  () => route.path,
  () => (drawer.value = false),
);

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
  <div class="min-h-dvh" :class="{ 'md:grid md:grid-cols-[16rem_1fr]': auth }">
    <a
      href="#inhalt"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >Zum Inhalt</a
    >

    <!-- phones: a slim bar with the restaurant and "Menü"; the areas sit in the bottom bar -->
    <header v-if="auth" class="flex items-center justify-between gap-3 border-b bg-card px-4 py-2 md:hidden">
      <p class="truncate text-lg font-semibold">{{ auth.restaurant }}</p>
      <Sheet v-model:open="drawer">
        <SheetTrigger as-child>
          <Button variant="outline"><Menu aria-hidden="true" />Menü</Button>
        </SheetTrigger>
        <SheetContent side="right" class="w-80 max-w-[85vw]">
          <SheetHeader class="pb-2">
            <SheetTitle class="text-lg">{{ auth.name }}</SheetTitle>
            <SheetDescription>{{ roleLabel }} · {{ auth.username }}</SheetDescription>
          </SheetHeader>
          <div class="space-y-6 px-6">
            <div v-if="auth.channels.length > 1" class="grid gap-2">
              <Label for="filiale">Filiale</Label>
              <NativeSelect
                id="filiale"
                class="w-full"
                :model-value="auth.channelId"
                @update:model-value="switchChannel"
              >
                <option v-for="c in auth.channels" :key="c.id" :value="c.id">{{ c.name }}</option>
              </NativeSelect>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Darstellung</span>
              <ColorModeButton />
            </div>
            <InstallAppButton class="w-full" />
            <Button variant="outline" class="w-full" @click="logout"><LogOut aria-hidden="true" />Abmelden</Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>

    <!-- from md: the sidebar with everything -->
    <header v-if="auth" class="sticky top-0 hidden h-dvh border-r bg-card md:block">
      <div class="flex h-full flex-col">
        <div class="space-y-3 px-5 py-6">
          <img
            src="/brand/shopbite-logo.svg"
            alt="ShopBite"
            width="324"
            height="103"
            class="mb-5 h-6 w-auto dark:hidden"
          />
          <img
            src="/brand/shopbite-logo-white.svg"
            alt="ShopBite"
            width="324"
            height="103"
            class="mb-5 hidden h-6 w-auto dark:block"
          />
          <div>
            <p class="text-lg font-semibold">{{ auth.restaurant }}</p>
            <p class="text-sm text-muted-foreground">{{ auth.name }} · {{ roleLabel }}</p>
          </div>
          <div v-if="auth.channels.length > 1" class="grid gap-1.5">
            <Label for="filiale-sidebar" class="text-muted-foreground">Filiale</Label>
            <NativeSelect
              id="filiale-sidebar"
              class="w-full"
              :model-value="auth.channelId"
              @update:model-value="switchChannel"
            >
              <option v-for="c in auth.channels" :key="c.id" :value="c.id">{{ c.name }}</option>
            </NativeSelect>
          </div>
        </div>
        <nav aria-label="Bereiche" class="flex-1">
          <ul class="flex flex-col px-3">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="flex min-h-8 items-center gap-3 rounded-lg px-3 text-base font-medium whitespace-nowrap transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
                :class="{ 'bg-accent text-accent-foreground': isActive(link.to) }"
                :aria-current="isActive(link.to) ? 'page' : undefined"
              >
                <component :is="link.icon" class="size-5" aria-hidden="true" />{{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
        <div class="px-3"><InstallAppButton class="w-full" /></div>
        <div class="flex items-center gap-1 p-3">
          <ColorModeButton />
          <Button variant="ghost" class="flex-1 justify-start" @click="logout">
            <LogOut aria-hidden="true" />Abmelden<span class="sr-only"> ({{ auth.username }})</span>
          </Button>
        </div>
      </div>
    </header>

    <main
      id="inhalt"
      tabindex="-1"
      class="mx-auto w-full max-w-4xl px-4 pt-6 pb-[calc(var(--nav-bottom)+1.5rem)] md:px-8 md:py-8"
    >
      <OfflineNotice class="mb-4 rounded-lg" />
      <Alert v-if="stale" role="status" class="mb-4 border-warning-border bg-warning text-warning-foreground">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Gespeichert, im Shop eventuell erst später sichtbar</AlertTitle>
        <AlertDescription class="text-warning-foreground">
          Der Shop war gerade nicht erreichbar. Die Änderung ist sicher gespeichert, Gäste sehen sie spätestens morgen.
          Beim nächsten Speichern wird es erneut versucht.
        </AlertDescription>
      </Alert>
      <slot />
    </main>

    <!-- phones: the areas within reach of the thumb -->
    <nav
      v-if="auth"
      aria-label="Bereiche"
      class="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul class="grid auto-cols-fr grid-flow-col">
        <li v-for="link in links" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-medium text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
            :class="{ 'text-primary': isActive(link.to) }"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          >
            <component :is="link.icon" class="size-6" aria-hidden="true" />{{ link.short
            }}<span class="sr-only">{{ link.short === link.label ? "" : ` (${link.label})` }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
