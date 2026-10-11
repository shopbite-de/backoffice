<script setup lang="ts">
import { Search, TriangleAlert } from "@lucide/vue";
import type { MenuDish, MenuSection } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
useHead({ title: "Speisekarte" });
const api = useBackofficeApi();
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const { data: menu, refresh } = await useAsyncData("menu", () => api<MenuSection[]>("/api/menu"));

async function update(dish: MenuDish, change: { onMenu?: boolean; price?: number }) {
  error.value = null;
  saved.value = null;
  try {
    await api(`/api/products/${dish.id}`, { method: "PATCH", body: change });
    saved.value = `${dish.name} gespeichert.`;
  } catch (e) {
    error.value = `${dish.name}: ${errorMessage(e)}`;
  }
  await refresh();
}

function savePrice(dish: MenuDish, event: Event) {
  const input = event.target as HTMLInputElement;
  const price = Number(input.value.replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) {
    error.value = `${dish.name}: Bitte einen Preis wie 9,50 eingeben.`;
    return;
  }
  if (price !== dish.price) update(dish, { price });
}

const query = ref("");
const onlyMissing = ref(false);
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">Speisekarte</h1>
      <Button variant="outline" as-child>
        <NuxtLink to="/speisekarte/abschnitte">Abschnitte bearbeiten</NuxtLink>
      </Button>
    </div>

    <Alert v-if="missing" class="border-warning-border bg-warning text-warning-foreground">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Allergene und Zusatzstoffe fehlen bei {{ missing }} Gerichten</AlertTitle>
      <AlertDescription class="text-warning-foreground">
        Online-Bestellungen brauchen diese Angaben. Öffnen Sie das Gericht und haken Sie „Angaben geprüft“ ab.
      </AlertDescription>
    </Alert>

    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div class="grid min-w-60 flex-1 gap-2">
        <Label for="suche">Gericht suchen</Label>
        <div class="relative">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="suche"
            v-model="query"
            type="search"
            class="pl-9 pointer-coarse:pl-10"
            placeholder="Name oder Nummer"
          />
        </div>
      </div>
      <div class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
        <Checkbox id="fehlend" v-model="onlyMissing" />
        <Label for="fehlend">Nur ohne geprüfte Allergene</Label>
      </div>
    </div>

    <ErrorAlert :message="error" />
    <p role="status" class="sr-only">{{ saved }}</p>

    <section v-for="section in filtered" :key="section.id" :aria-labelledby="`s-${section.id}`" class="space-y-2">
      <h2 :id="`s-${section.id}`" class="font-semibold">{{ section.name }}</h2>
      <Card v-if="section.dishes.length" class="py-0">
        <ul class="divide-y">
          <MenuDishRow
            v-for="dish in section.dishes"
            :key="dish.id"
            :dish="dish"
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
              @price="savePrice(dish, $event)"
              @on-menu="update(dish, { onMenu: $event })"
            />
          </ul>
        </Card>
      </div>
    </section>
  </div>
</template>
