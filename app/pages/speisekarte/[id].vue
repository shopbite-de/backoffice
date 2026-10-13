<script setup lang="ts">
import { ArrowLeft, Plus, X } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import type { FoodLabel } from "#shared/utils/labels";
import type { DishDetail, DishFormOptions, DishInput } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
const route = useRoute();
const api = useBackofficeApi();
const id = route.params.id as string;
const saves = useSaveState();
const saving = ref(false);

const [{ data: dish }, { data: options }] = await Promise.all([
  useAsyncData(`dish-${id}`, () => api<DishDetail>(`/api/dishes/${id}`)),
  useAsyncData("dish-options", () => api<DishFormOptions>("/api/dishes/options")),
]);
useHead({ title: () => dish.value?.name ?? "Gericht" });

// the form works on a copy; prices and measures are typed as German text
const form = ref<DishInput | null>(null);
const priceText = ref("");
const measures = ref({ width: "", height: "", length: "", weight: "" });
const surcharges = ref<string[][]>([]);

const toText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
// money always with cents, like in the menu list (10,50)
const toMoney = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));
const toNumber = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

// what was loaded, to tell unsaved changes apart (built from plain copies, so it tracks only the dish)
const loaded = ref("");
const editState = (f: unknown, price: string, m: unknown, sur: unknown) => JSON.stringify([f, price, m, sur]);

watchEffect(() => {
  if (!dish.value) return;
  const { id: _id, number: _number, taxRate: _tax, ...input } = structuredClone(toRaw(dish.value));
  const price = toMoney(input.price);
  const m = {
    width: toText(input.dimensions.width),
    height: toText(input.dimensions.height),
    length: toText(input.dimensions.length),
    weight: toText(input.dimensions.weight),
  };
  const sur = input.variants.map((g) => g.options.map((o) => toMoney(o.surcharge)));
  loaded.value = editState(input, price, m, sur);
  form.value = input;
  priceText.value = price;
  measures.value = m;
  surcharges.value = sur;
});
const dirty = computed(
  () => !!form.value && editState(form.value, priceText.value, measures.value, surcharges.value) !== loaded.value,
);

// unsaved changes are never lost silently: ask before leaving the page or closing the tab
const leaveTo = ref<string | null>(null);
const askLeave = ref(false);
let leaving = false;
onBeforeRouteLeave((to) => {
  if (!dirty.value || leaving) return true;
  leaveTo.value = to.fullPath;
  askLeave.value = true;
  return false;
});
useEventListener(window, "beforeunload", (event) => {
  if (dirty.value) event.preventDefault();
});
async function leave(saveFirst: boolean) {
  const to = leaveTo.value;
  if (!to || (saveFirst && !(await save()))) return;
  leaving = true;
  await navigateTo(to);
}

function addVariantGroup() {
  form.value!.variants.push({ group: "Größe", options: [{ name: "", surcharge: 0 }] });
  surcharges.value.push(["0,00"]);
}
function addVariantOption(g: number) {
  form.value!.variants[g]!.options.push({ name: "", surcharge: 0 });
  surcharges.value[g]!.push("0,00");
}
function removeVariantOption(g: number, o: number) {
  form.value!.variants[g]!.options.splice(o, 1);
  surcharges.value[g]!.splice(o, 1);
  if (!form.value!.variants[g]!.options.length) {
    form.value!.variants.splice(g, 1);
    surcharges.value.splice(g, 1);
  }
}

function toggle(list: string[], value: string, on: boolean) {
  const i = list.indexOf(value);
  if (on && i < 0) list.push(value);
  if (!on && i >= 0) list.splice(i, 1);
}

/** true when saved; the result shows in the save bar */
async function save(): Promise<boolean> {
  if (!form.value) return false;
  const price = toNumber(priceText.value);
  if (!price || price <= 0) {
    saves.set("dish", { kind: "error", message: "Bitte einen Preis wie 8,50 eingeben." });
    return false;
  }
  const body: DishInput = {
    ...form.value,
    price,
    dimensions: {
      width: toNumber(measures.value.width),
      height: toNumber(measures.value.height),
      length: toNumber(measures.value.length),
      weight: toNumber(measures.value.weight),
    },
    variants: form.value.variants
      .map((g, gi) => ({
        group: g.group.trim(),
        options: g.options
          .map((o, oi) => ({ name: o.name.trim(), surcharge: toNumber(surcharges.value[gi]![oi]!) ?? 0 }))
          .filter((o) => o.name),
      }))
      .filter((g) => g.group && g.options.length),
    properties: form.value.properties.filter((p) => p.group.trim() && p.options.length),
    extras: form.value.extras.filter((e) => e.name.trim()),
  };
  saving.value = true;
  const ok = await saves.run("dish", async () => {
    dish.value = await api<DishDetail>(`/api/dishes/${id}`, { method: "PUT", body });
  });
  saving.value = false;
  return ok;
}

const variantCount = computed(
  () => form.value?.variants.reduce((n, g) => n * Math.max(1, g.options.filter((o) => o.name.trim()).length), 1) ?? 1,
);
// allergens grouped like on a menu: single ones, then cereals and nuts by name
const allergenGroups = computed(() => {
  const groups: { title: string | null; items: FoodLabel[] }[] = [{ title: null, items: [] }];
  for (const label of ALLERGENS) {
    const title = label.kind ?? null;
    let group = groups.find((g) => g.title === title);
    if (!group) groups.push((group = { title, items: [] }));
    group.items.push(label);
  }
  return groups;
});
const diets = [
  { value: "keine", label: "Keine Angabe" },
  { value: "vegetarisch", label: "Vegetarisch" },
  { value: "vegan", label: "Vegan" },
];
const diet = computed({
  get: () => form.value?.diet ?? "keine",
  set: (v: string) => (form.value!.diet = v === "keine" ? null : (v as "vegan" | "vegetarisch")),
});
</script>

<template>
  <form v-if="form && dish && options" class="space-y-6 pb-28" novalidate @submit.prevent="save">
    <div>
      <Button variant="link" class="h-auto px-0 text-muted-foreground" as-child>
        <NuxtLink to="/speisekarte"><ArrowLeft aria-hidden="true" />Zur Speisekarte</NuxtLink>
      </Button>
      <h1 class="mt-1 text-2xl font-semibold">{{ dish.name }}</h1>
      <p class="text-muted-foreground">Nr. {{ dish.number }} · {{ dish.taxRate }} % MwSt.</p>
    </div>

    <FormSection title="Grunddaten">
      <div class="grid gap-2">
        <Label for="name">Name</Label>
        <Input id="name" v-model="form.name" required />
      </div>
      <div class="grid gap-2">
        <Label for="beschreibung">Beschreibung</Label>
        <Textarea id="beschreibung" v-model="form.description" rows="3" />
      </div>
      <div class="flex items-center justify-between gap-4">
        <Label for="aufkarte">Auf der Karte</Label>
        <Switch id="aufkarte" v-model="form.onMenu" />
      </div>
      <fieldset>
        <legend class="mb-2 text-sm font-medium">Abschnitte</legend>
        <div class="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="s in options.sections" :key="s.id">
            <div class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
              <Checkbox
                :id="`abschnitt-${s.id}`"
                :model-value="form.sectionIds.includes(s.id)"
                @update:model-value="toggle(form.sectionIds, s.id, $event === true)"
              />
              <Label :for="`abschnitt-${s.id}`" class="font-normal">{{ s.name }}</Label>
            </div>
            <div
              v-for="child in s.children"
              :key="child.id"
              class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2 pl-6"
            >
              <Checkbox
                :id="`abschnitt-${child.id}`"
                :model-value="form.sectionIds.includes(child.id)"
                @update:model-value="toggle(form.sectionIds, child.id, $event === true)"
              />
              <Label :for="`abschnitt-${child.id}`" class="font-normal"
                ><span class="sr-only">{{ s.name }}, </span>{{ child.name }}</Label
              >
            </div>
          </div>
        </div>
      </fieldset>
    </FormSection>

    <FormSection
      title="Allergene und Zusatzstoffe"
      hint="Pflichtangaben für Online-Bestellungen. Der Shop zeigt sie beim Gericht mit Kürzel."
    >
      <fieldset class="space-y-3">
        <legend class="mb-1 text-sm font-medium">Allergene</legend>
        <div v-for="group in allergenGroups" :key="group.title ?? 'einzeln'">
          <p v-if="group.title" class="mb-1 text-sm text-muted-foreground">{{ group.title }}</p>
          <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="a in group.items" :key="a.key" class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
              <Checkbox
                :id="`allergen-${a.key}`"
                :model-value="form.allergens.includes(a.key)"
                @update:model-value="toggle(form.allergens, a.key, $event === true)"
              />
              <Label :for="`allergen-${a.key}`" class="font-normal">
                <span class="w-5 text-muted-foreground tabular-nums" aria-hidden="true">{{ a.code }}</span
                >{{ a.name }}
              </Label>
            </div>
          </div>
        </div>
      </fieldset>
      <Separator />
      <fieldset>
        <legend class="mb-1 text-sm font-medium">Zusatzstoffe</legend>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <div v-for="a in ADDITIVES" :key="a.key" class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
            <Checkbox
              :id="`zusatz-${a.key}`"
              :model-value="form.additives.includes(a.key)"
              @update:model-value="toggle(form.additives, a.key, $event === true)"
            />
            <Label :for="`zusatz-${a.key}`" class="font-normal">
              <span class="w-6 text-muted-foreground tabular-nums" aria-hidden="true">{{ a.code }}</span
              >{{ a.name }}
            </Label>
          </div>
        </div>
      </fieldset>
      <Separator />
      <div class="flex items-start gap-3 rounded-lg bg-muted p-3">
        <Checkbox id="geprueft" v-model="form.allergensChecked" class="mt-0.5" />
        <div class="grid gap-1">
          <Label for="geprueft">Angaben geprüft</Label>
          <p class="text-sm text-muted-foreground">
            Die Auswahl oben ist vollständig, auch wenn nichts angehakt ist. Ohne Häkchen gilt das Gericht als
            „Allergene fehlen“.
          </p>
        </div>
      </div>
    </FormSection>

    <FormSection
      title="Preis und Varianten"
      hint="Varianten sind z. B. Größen. Jede Kombination wird ein eigenes bestellbares Gericht, der Preis ist Grundpreis plus Aufpreise."
    >
      <div class="grid max-w-40 gap-2">
        <Label for="preis">Preis in Euro</Label>
        <Input id="preis" v-model="priceText" inputmode="decimal" required />
      </div>
      <div v-for="(group, g) in form.variants" :key="g" class="space-y-3 rounded-lg border p-4">
        <div class="grid max-w-60 gap-2">
          <Label :for="`gruppe-${g}`">Variante</Label>
          <Input :id="`gruppe-${g}`" v-model="group.group" placeholder="z. B. Größe" />
        </div>
        <div v-for="(option, o) in group.options" :key="o" class="flex flex-wrap items-end gap-2">
          <div class="grid min-w-40 flex-1 gap-2">
            <Label :for="`opt-${g}-${o}`" class="font-normal">Auswahl</Label>
            <Input :id="`opt-${g}-${o}`" v-model="option.name" placeholder="z. B. Groß 40 cm" />
          </div>
          <div class="grid w-32 gap-2">
            <Label :for="`auf-${g}-${o}`" class="font-normal">Aufpreis €</Label>
            <Input :id="`auf-${g}-${o}`" v-model="surcharges[g]![o]" inputmode="decimal" />
          </div>
          <Button variant="ghost" size="icon" @click="removeVariantOption(g, o)">
            <X aria-hidden="true" /><span class="sr-only">{{ option.name || "Auswahl" }} entfernen</span>
          </Button>
        </div>
        <Button variant="outline" @click="addVariantOption(g)"><Plus aria-hidden="true" />Auswahl</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button v-if="form.variants.length < 3" variant="outline" @click="addVariantGroup"
          ><Plus aria-hidden="true" />Variante</Button
        >
        <p v-if="form.variants.length" class="text-sm text-muted-foreground">{{ variantCount }} Kombinationen</p>
      </div>
    </FormSection>

    <FormSection title="Zutaten und Kennzeichnung">
      <ListField
        id="zutaten"
        v-model="form.ingredients"
        label="Zutaten"
        hint="Mit Komma trennen. Gäste können Zutaten abwählen."
        :suggestions="options.ingredients"
      />
      <fieldset>
        <legend class="mb-2 text-sm font-medium">Ernährung</legend>
        <RadioGroup v-model="diet" class="flex flex-wrap gap-x-6">
          <div v-for="d in diets" :key="d.value" class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
            <RadioGroupItem :id="`diet-${d.value}`" :value="d.value" />
            <Label :for="`diet-${d.value}`" class="font-normal">{{ d.label }}</Label>
          </div>
        </RadioGroup>
      </fieldset>
      <div v-for="(prop, p) in form.properties" :key="p" class="flex flex-wrap items-end gap-2">
        <div class="grid w-48 gap-2">
          <Label :for="`eig-${p}`" class="font-normal">Eigenschaft</Label>
          <Input :id="`eig-${p}`" v-model="prop.group" list="gruppen" placeholder="z. B. Küche" />
        </div>
        <div class="min-w-48 flex-1">
          <ListField
            :id="`eigw-${p}`"
            v-model="prop.options"
            label="Werte"
            :suggestions="options.propertyGroups.find((g) => g.name === prop.group)?.options"
          />
        </div>
        <Button variant="ghost" size="icon" @click="form.properties.splice(p, 1)">
          <X aria-hidden="true" /><span class="sr-only">{{ prop.group || "Eigenschaft" }} entfernen</span>
        </Button>
      </div>
      <datalist id="gruppen">
        <option v-for="g in options.propertyGroups" :key="g.name" :value="g.name" />
        <option value="Küche" />
      </datalist>
      <Button variant="outline" @click="form.properties.push({ group: '', options: [] })"
        ><Plus aria-hidden="true" />Eigenschaft</Button
      >
    </FormSection>

    <FormSection title="Extras" hint="Listen, aus denen Gäste beim Bestellen wählen, z. B. Extras oder Beilagen.">
      <fieldset v-if="options.extraGroups.length" class="space-y-2">
        <legend class="mb-2 text-sm font-medium">Extras-Gruppen</legend>
        <p class="text-sm text-muted-foreground">
          Einmal gepflegt, an vielen Gerichten genutzt. Was in einer Gruppe steht, ändern Sie unter
          <NuxtLink to="/speisekarte/extras" class="underline underline-offset-4">Extras-Gruppen</NuxtLink>.
        </p>
        <div v-for="group in options.extraGroups" :key="group.id" class="flex gap-2 py-1">
          <Checkbox
            :id="`gruppe-${group.id}`"
            :model-value="form.extraGroupIds.includes(group.id)"
            :aria-describedby="`gruppe-${group.id}-inhalt`"
            class="mt-0.5"
            @update:model-value="toggle(form.extraGroupIds, group.id, $event === true)"
          />
          <div class="grid gap-1">
            <Label :for="`gruppe-${group.id}`">{{ group.name }}</Label>
            <p :id="`gruppe-${group.id}-inhalt`" class="text-sm text-muted-foreground">
              {{ group.products.length }} Extras<template v-if="group.products.length"
                >: {{ group.products.map((p) => p.name).join(", ") }}</template
              >
            </p>
          </div>
        </div>
      </fieldset>
      <div v-for="(extra, e) in form.extras" :key="extra.id ?? `neu-${e}`" class="space-y-3 rounded-lg border p-4">
        <div class="flex flex-wrap items-end gap-2">
          <div class="grid min-w-48 flex-1 gap-2">
            <Label :for="`extra-${e}`">Name der Liste</Label>
            <Input :id="`extra-${e}`" v-model="extra.name" />
          </div>
          <Button variant="outline" @click="form.extras.splice(e, 1)">
            Liste entfernen<span class="sr-only"> {{ extra.name }}</span>
          </Button>
        </div>
        <fieldset>
          <legend class="sr-only">Extras in {{ extra.name }}</legend>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <div
              v-for="c in options.extraCandidates"
              :key="c.id"
              class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2"
            >
              <Checkbox
                :id="`extra-${e}-${c.id}`"
                :model-value="extra.productIds.includes(c.id)"
                @update:model-value="toggle(extra.productIds, c.id, $event === true)"
              />
              <Label :for="`extra-${e}-${c.id}`" class="font-normal">{{ c.name }}</Label>
            </div>
          </div>
        </fieldset>
      </div>
      <Button variant="outline" @click="form.extras.push({ id: null, name: 'Extras', productIds: [] })"
        ><Plus aria-hidden="true" />Liste nur für dieses Gericht</Button
      >
    </FormSection>

    <FormSection title="Bestellung und Bon">
      <div class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
        <Checkbox id="upsell" v-model="form.upsell" />
        <Label for="upsell" class="font-normal">Vor dem Bestellen als Ergänzung vorschlagen</Label>
      </div>
      <fieldset>
        <legend class="mb-2 text-sm font-medium">Auf dem Bon</legend>
        <RadioGroup v-model="form.printType" class="flex flex-wrap gap-x-6">
          <div class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
            <RadioGroupItem id="print-number" value="number" />
            <Label for="print-number" class="font-normal">Nummer</Label>
          </div>
          <div class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2">
            <RadioGroupItem id="print-label" value="label" />
            <Label for="print-label" class="font-normal">Name</Label>
          </div>
        </RadioGroup>
      </fieldset>
      <div class="grid max-w-60 gap-2">
        <Label for="faktor">Zubereitungsfaktor</Label>
        <p id="faktor-hint" class="text-sm text-muted-foreground">
          Wie viel länger als üblich dieses Gericht braucht (1 = normal).
        </p>
        <Input
          id="faktor"
          v-model.number="form.deliveryTimeFactor"
          type="number"
          min="1"
          max="10"
          aria-describedby="faktor-hint"
          class="w-24"
        />
      </div>
    </FormSection>

    <FormSection title="Maße und Gewicht">
      <div class="grid gap-4 sm:grid-cols-4">
        <div
          v-for="m in [
            { k: 'width', l: 'Breite (mm)' },
            { k: 'height', l: 'Höhe (mm)' },
            { k: 'length', l: 'Länge (mm)' },
            { k: 'weight', l: 'Gewicht (kg)' },
          ] as const"
          :key="m.k"
          class="grid gap-2"
        >
          <Label :for="`mass-${m.k}`">{{ m.l }}</Label>
          <Input :id="`mass-${m.k}`" v-model="measures[m.k]" inputmode="decimal" />
        </div>
      </div>
    </FormSection>

    <FormSection title="Suche und SEO">
      <ListField
        id="tags"
        v-model="form.tags"
        label="Schlagwörter"
        hint="Interne Gruppierung, z. B. Klassiker, Neu."
        :suggestions="options.tags"
      />
      <ListField
        id="suchwoerter"
        v-model="form.searchKeywords"
        label="Suchwörter"
        hint="Damit Gäste das Gericht auch unter anderen Namen finden, z. B. Margarita."
      />
      <div class="grid gap-2">
        <Label for="metatitle">Titel in Suchmaschinen</Label>
        <Input id="metatitle" v-model="form.seo.title" maxlength="255" aria-describedby="metatitle-count" />
        <p id="metatitle-count" class="text-sm text-muted-foreground">
          {{ form.seo.title.length }} von etwa 60 Zeichen
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="metadesc">Beschreibung in Suchmaschinen</Label>
        <Textarea
          id="metadesc"
          v-model="form.seo.description"
          maxlength="255"
          rows="2"
          aria-describedby="metadesc-count"
        />
        <p id="metadesc-count" class="text-sm text-muted-foreground">
          {{ form.seo.description.length }} von etwa 155 Zeichen
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="keywords">Meta-Keywords</Label>
        <Input id="keywords" v-model="form.seo.keywords" maxlength="255" />
      </div>
    </FormSection>

    <div
      class="fixed inset-x-0 bottom-0 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-64"
    >
      <div class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 md:px-4">
        <Button type="submit" size="lg" class="w-full sm:w-auto" :disabled="saving">Speichern</Button>
        <p v-if="dirty && saves.state('dish')?.kind !== 'saving'" class="text-sm font-medium pointer-coarse:text-base">
          Ungespeicherte Änderungen
        </p>
        <SaveStatus :state="saves.state('dish')" />
      </div>
    </div>

    <AlertDialog v-model:open="askLeave">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Änderungen speichern?</AlertDialogTitle>
          <AlertDialogDescription>
            An {{ dish.name }} wurde etwas geändert und noch nicht gespeichert.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
          <AlertDialogAction variant="outline" @click="leave(false)">Nicht speichern</AlertDialogAction>
          <AlertDialogAction @click="leave(true)">Speichern</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </form>
</template>
