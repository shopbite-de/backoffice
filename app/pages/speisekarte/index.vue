<script setup lang="ts">
import { ChevronDown, Search, TriangleAlert } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import type { MenuDish, MenuSection } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
useHead({ title: "Speisekarte" });
const api = useBackofficeApi();
const { data: menu, refresh } = await useAsyncData("menu", () => api<MenuSection[]>("/api/menu"));
// feedback per dish, below its row (the list is long, a message at the top would be out of sight)
const saves = useSaveState();

async function update(dish: MenuDish, change: { onMenu?: boolean; price?: number }) {
  const done =
    change.onMenu === undefined
      ? `Preis ${euro(change.price!)} gespeichert`
      : change.onMenu
        ? "Steht wieder auf der Karte"
        : "Von der Karte genommen";
  await saves.run(dish.id, () => api(`/api/products/${dish.id}`, { method: "PATCH", body: change }), done);
  await refresh();
}

function savePrice(dish: MenuDish, event: Event) {
  const input = event.target as HTMLInputElement;
  const price = Number(input.value.trim().replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) {
    saves.set(dish.id, { kind: "error", message: "Bitte einen Preis wie 9,50 eingeben." });
    return;
  }
  if (price !== dish.price) update(dish, { price });
}

const query = ref("");
const onlyMissing = ref(false);
const filtering = computed(() => !!query.value.trim() || onlyMissing.value);
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const keep = (d: MenuDish) =>
    (!q || d.name.toLowerCase().includes(q) || d.number.includes(q)) && (!onlyMissing.value || !d.allergensChecked);
  return (menu.value ?? [])
    .map((s) => ({
      ...s,
      dishes: s.dishes.filter(keep),
      subsections: s.subsections
        .map((sub) => ({ ...sub, dishes: sub.dishes.filter(keep) }))
        .filter((sub) => sub.dishes.length),
    }))
    .filter((s) => s.dishes.length || s.subsections.length);
});
const allDishes = computed(() =>
  (menu.value ?? []).flatMap((s) => [...s.dishes, ...s.subsections.flatMap((sub) => sub.dishes)]),
);
const missing = computed(() => allDishes.value.filter((d) => d.onMenu && !d.allergensChecked).length);
const dishCount = (s: MenuSection) => s.dishes.length + s.subsections.reduce((n, sub) => n + sub.dishes.length, 0);

// sections fold away so a long menu (La Fattoria: 29 sections, 140 dishes) stays scannable; a search opens all
const collapsed = ref(new Set<string>());
const isOpen = (id: string) => filtering.value || !collapsed.value.has(id);
function toggle(id: string) {
  if (filtering.value) return;
  if (collapsed.value.has(id)) collapsed.value.delete(id);
  else collapsed.value.add(id);
}

// the jump bar: sticks to the top, scrolls to a section and marks the one in view
const bar = ref<HTMLElement | null>(null);
const current = ref<string | null>(null);
const sectionEl = (id: string) => document.getElementById(`s-${id}`)?.closest("section");
function jumpTo(id: string) {
  collapsed.value.delete(id);
  current.value = id;
  const el = sectionEl(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - (bar.value?.offsetHeight ?? 0) - 8;
  window.scrollTo({ top, behavior: "smooth" });
}
function trackCurrent() {
  const line = (bar.value?.getBoundingClientRect().bottom ?? 0) + 16;
  let found: string | null = null;
  for (const s of filtered.value) {
    const el = sectionEl(s.id);
    if (el && el.getBoundingClientRect().top <= line) found = s.id;
  }
  current.value = found ?? filtered.value[0]?.id ?? null;
}
useEventListener(window, "scroll", trackCurrent, { passive: true });
onMounted(trackCurrent);
// keep the marked chip visible in the bar; scrolled by hand, scrollIntoView would also move the page
watch(current, (id) => {
  const chip = id ? bar.value?.querySelector<HTMLElement>(`[data-section="${id}"]`) : null;
  const strip = chip?.parentElement?.parentElement;
  if (!chip || !strip) return;
  strip.scrollTo({ left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
});
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <h1 class="text-2xl font-semibold">Speisekarte</h1>
      <div class="grid grid-cols-2 gap-2 sm:flex">
        <Button variant="outline" as-child>
          <NuxtLink to="/speisekarte/abschnitte">Abschnitte bearbeiten</NuxtLink>
        </Button>
        <Button variant="outline" as-child>
          <NuxtLink to="/speisekarte/extras">Extras-Gruppen</NuxtLink>
        </Button>
      </div>
    </div>

    <Alert v-if="missing" class="border-warning-border bg-warning text-warning-foreground">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Allergene und Zusatzstoffe fehlen bei {{ missing }} Gerichten</AlertTitle>
      <AlertDescription class="text-warning-foreground">
        Online-Bestellungen brauchen diese Angaben. Öffnen Sie das Gericht und haken Sie „Angaben geprüft“ ab.
      </AlertDescription>
    </Alert>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="relative min-w-60 flex-1">
        <Label for="suche" class="sr-only">Gericht suchen</Label>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="suche"
          v-model="query"
          type="search"
          class="pl-9 pointer-coarse:pl-10"
          placeholder="Gericht suchen: Name oder Nummer"
        />
      </div>
      <Button
        v-if="missing"
        :variant="onlyMissing ? 'default' : 'outline'"
        :aria-pressed="onlyMissing"
        @click="onlyMissing = !onlyMissing"
      >
        <TriangleAlert aria-hidden="true" />Allergene fehlen ({{ missing }})
      </Button>
    </div>

    <!-- jump bar: one chip per section, sticks to the top while scrolling -->
    <nav
      v-if="filtered.length > 1"
      ref="bar"
      aria-label="Abschnitte der Speisekarte"
      class="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8"
    >
      <ul class="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        <li v-for="s in filtered" :key="s.id" class="shrink-0">
          <Button
            :data-section="s.id"
            size="sm"
            :variant="current === s.id ? 'default' : 'secondary'"
            :aria-current="current === s.id ? 'location' : undefined"
            @click="jumpTo(s.id)"
            >{{ s.name }}</Button
          >
        </li>
      </ul>
    </nav>

    <p v-if="!filtered.length" class="text-muted-foreground">
      {{ query ? `Kein Gericht passt zu „${query}“.` : "Alle Gerichte haben geprüfte Allergene." }}
    </p>

    <section v-for="section in filtered" :key="section.id" :aria-labelledby="`s-${section.id}`" class="space-y-2">
      <h2 class="flex">
        <button
          :id="`s-${section.id}`"
          type="button"
          class="flex min-h-8 flex-1 items-center gap-2 rounded-md text-left font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
          :aria-expanded="isOpen(section.id)"
          :disabled="filtering"
          @click="toggle(section.id)"
        >
          <ChevronDown
            class="size-5 shrink-0 text-muted-foreground transition-transform"
            :class="{ '-rotate-90': !isOpen(section.id) }"
            aria-hidden="true"
          />
          {{ section.name }}
          <span class="font-normal text-muted-foreground">({{ dishCount(section) }})</span>
        </button>
      </h2>
      <template v-if="isOpen(section.id)">
        <Card v-if="section.dishes.length" class="py-0">
          <ul class="divide-y">
            <MenuDishRow
              v-for="dish in section.dishes"
              :key="dish.id"
              :dish="dish"
              :status="saves.state(dish.id)"
              @price="savePrice(dish, $event)"
              @on-menu="update(dish, { onMenu: $event })"
            />
          </ul>
        </Card>
        <div v-for="sub in section.subsections" :key="sub.id" class="space-y-2 pl-3">
          <h3 class="text-sm font-semibold text-muted-foreground">{{ section.name }} › {{ sub.name }}</h3>
          <Card class="py-0">
            <ul class="divide-y">
              <MenuDishRow
                v-for="dish in sub.dishes"
                :key="dish.id"
                :dish="dish"
                :status="saves.state(dish.id)"
                @price="savePrice(dish, $event)"
                @on-menu="update(dish, { onMenu: $event })"
              />
            </ul>
          </Card>
        </div>
      </template>
    </section>
  </div>
</template>
