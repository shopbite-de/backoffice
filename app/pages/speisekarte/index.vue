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
  return (menu.value ?? [])
    .map((s) => ({
      ...s,
      dishes: s.dishes.filter(
        (d) =>
          (!q || d.name.toLowerCase().includes(q) || d.number.includes(q)) &&
          (!onlyMissing.value || !d.allergensChecked),
      ),
    }))
    .filter((s) => s.dishes.length);
});
const missing = computed(() =>
  (menu.value ?? []).flatMap((s) => s.dishes).filter((d) => d.onMenu && !d.allergensChecked).length,
);
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
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="suche" v-model="query" type="search" class="pl-9 pointer-coarse:pl-10" placeholder="Name oder Nummer" />
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
      <Card class="py-0">
        <ul class="divide-y">
          <li
            v-for="dish in section.dishes"
            :key="dish.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            :class="{ 'text-muted-foreground': !dish.onMenu }"
          >
            <span class="w-12 shrink-0 text-sm tabular-nums text-muted-foreground">{{ dish.number }}</span>
            <span class="min-w-0 flex-1 font-medium">
              <NuxtLink :to="`/speisekarte/${dish.id}`" class="underline decoration-border underline-offset-4 hover:decoration-foreground">{{ dish.name }}</NuxtLink>
              <span v-if="!dish.onMenu" class="ml-1 text-sm font-normal">· nicht auf der Karte</span>
              <Badge v-if="!dish.allergensChecked" variant="outline" class="ml-2 border-warning-border bg-warning text-warning-foreground">Allergene fehlen</Badge>
            </span>
            <div class="flex items-center gap-2">
              <Label :for="`preis-${dish.id}`" class="sr-only">Preis {{ dish.name }} in Euro</Label>
              <Input
                :id="`preis-${dish.id}`"
                :model-value="dish.price?.toFixed(2).replace('.', ',')"
                inputmode="decimal"
                class="w-24 text-right tabular-nums"
                @change="savePrice(dish, $event)"
              />
              <span aria-hidden="true">€</span>
            </div>
            <Switch
              :model-value="dish.onMenu"
              :aria-label="`${dish.name} auf der Karte`"
              @update:model-value="update(dish, { onMenu: $event })"
            />
          </li>
        </ul>
      </Card>
    </section>
  </div>
</template>
