<script setup lang="ts">
import { ArrowLeft, ChevronDown } from "@lucide/vue";
import type { ExtraGroup, ExtraGroupList, ExtraProduct } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
useHead({ title: "Extras-Gruppen" });
const api = useBackofficeApi();
// feedback at the group that changed, "neu" at the create form
const saves = useSaveState();
const busy = ref<string | null>(null);
// groups are closed by default: the name and what is in them is enough to find the right one
const open = ref(new Set<string>());
const toggleOpen = (id: string) => (open.value.has(id) ? open.value.delete(id) : open.value.add(id));
const { data } = await useAsyncData("extra-groups", () => api<ExtraGroupList>("/api/extra-groups"));

// every group is edited on its own copy and saved on its own
const drafts = ref<Record<string, { name: string; productIds: string[] }>>({});
watchEffect(() => {
  drafts.value = Object.fromEntries(
    (data.value?.groups ?? []).map((g) => [g.id, { name: g.name, productIds: [...g.productIds] }]),
  );
});
const changed = (group: ExtraGroup) => {
  const draft = drafts.value[group.id];
  return !!draft && (draft.name.trim() !== group.name || draft.productIds.join("|") !== group.productIds.join("|"));
};
// products of the group that are no extras any more (e.g. got a section) stay visible to remove them
const choices = (group: ExtraGroup): ExtraProduct[] => {
  const candidates = data.value?.candidates ?? [];
  const others = group.products.filter(
    (p) => group.productIds.includes(p.id) && !candidates.some((c) => c.id === p.id),
  );
  return [...candidates, ...others];
};

function toggle(list: string[], value: string, on: boolean) {
  const i = list.indexOf(value);
  if (on && i < 0) list.push(value);
  if (!on && i >= 0) list.splice(i, 1);
}

async function run(key: string, action: () => Promise<string>) {
  busy.value = key;
  let done = "Gespeichert";
  await saves.run(key, async () => (done = await action()), done);
  busy.value = null;
}

const save = (group: ExtraGroup) =>
  run(group.id, async () => {
    const groups = await api<ExtraGroup[]>(`/api/extra-groups/${group.id}`, {
      method: "PUT",
      body: drafts.value[group.id],
    });
    data.value = { ...data.value!, groups };
    return `Gespeichert, gilt sofort an ${dishes(group.dishCount)}`;
  });

const remove = (group: ExtraGroup) =>
  run(group.id, async () => {
    const groups = await api<ExtraGroup[]>(`/api/extra-groups/${group.id}`, { method: "DELETE" });
    data.value = { ...data.value!, groups };
    return `${group.name} gelöscht`;
  });

const newName = ref("");
const create = () =>
  run("neu", async () => {
    const name = newName.value.trim();
    const { id, groups } = await api<{ id: string; groups: ExtraGroup[] }>("/api/extra-groups", {
      method: "POST",
      body: { name, productIds: [] },
    });
    data.value = { ...data.value!, groups };
    newName.value = "";
    open.value.add(id);
    await nextTick();
    document.getElementById(`name-${id}`)?.focus();
    return `${name} angelegt. Haken Sie jetzt die Extras an und speichern Sie.`;
  });

const dishes = (n: number) => (n === 1 ? "1 Gericht" : `${n} Gerichten`);
</script>

<template>
  <div class="space-y-6">
    <div>
      <Button variant="link" class="h-auto px-0 text-muted-foreground" as-child>
        <NuxtLink to="/speisekarte"><ArrowLeft aria-hidden="true" />Zur Speisekarte</NuxtLink>
      </Button>
      <h1 class="mt-1 text-2xl font-semibold">Extras-Gruppen</h1>
      <p class="text-muted-foreground">
        Eine Gruppe wie „Pizza Extras“ wird einmal gepflegt und gilt an allen Gerichten, die sie nutzen. Welche Gerichte
        das sind, legen Sie im Gericht unter Extras fest.
      </p>
    </div>
    <p v-if="!data?.groups.length" class="text-muted-foreground">Noch keine Extras-Gruppen.</p>

    <Card v-for="group in data?.groups" :key="group.id">
      <CardContent class="space-y-4">
        <button
          type="button"
          class="flex min-h-8 w-full items-center gap-3 rounded-md text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
          :aria-expanded="open.has(group.id)"
          @click="toggleOpen(group.id)"
        >
          <ChevronDown
            class="size-5 shrink-0 text-muted-foreground transition-transform"
            :class="{ '-rotate-90': !open.has(group.id) }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="font-medium">{{ drafts[group.id]?.name ?? group.name }}</span>
            <Badge variant="secondary" class="ml-2">an {{ dishes(group.dishCount) }}</Badge>
            <span v-if="!open.has(group.id)" class="mt-1 block truncate text-sm text-muted-foreground">
              {{ group.products.length ? group.products.map((p) => p.name).join(", ") : "Noch keine Extras" }}
            </span>
          </span>
        </button>
        <SaveStatus v-if="!open.has(group.id)" :state="saves.state(group.id)" />
        <template v-if="open.has(group.id) && group.editable && drafts[group.id]">
          <form class="space-y-4" @submit.prevent="save(group)">
            <div class="flex flex-wrap items-end gap-2">
              <div class="grid min-w-48 flex-1 gap-2">
                <Label :for="`name-${group.id}`">Name der Gruppe</Label>
                <Input :id="`name-${group.id}`" v-model="drafts[group.id]!.name" required />
              </div>
            </div>
            <fieldset>
              <legend class="mb-2 text-sm font-medium">
                Extras ({{ drafts[group.id]!.productIds.length }} angehakt)
              </legend>
              <div class="grid grid-cols-2 gap-x-4 lg:grid-cols-3">
                <div
                  v-for="c in choices(group)"
                  :key="c.id"
                  class="flex min-h-8 pointer-coarse:min-h-11 items-center gap-2"
                >
                  <Checkbox
                    :id="`g-${group.id}-${c.id}`"
                    :model-value="drafts[group.id]!.productIds.includes(c.id)"
                    @update:model-value="toggle(drafts[group.id]!.productIds, c.id, $event === true)"
                  />
                  <Label :for="`g-${group.id}-${c.id}`" class="flex-1 self-stretch font-normal">{{ c.name }}</Label>
                </div>
              </div>
            </fieldset>
            <div class="flex flex-wrap items-center gap-2">
              <Button type="submit" :disabled="!changed(group) || busy === group.id">Speichern</Button>
              <Button
                v-if="!group.dishCount"
                type="button"
                variant="outline"
                :disabled="busy === group.id"
                @click="remove(group)"
              >
                Gruppe löschen
              </Button>
              <span v-if="changed(group)" class="text-sm text-muted-foreground">Nicht gespeichert</span>
              <SaveStatus :state="saves.state(group.id)" />
            </div>
          </form>
        </template>
        <template v-else-if="open.has(group.id)">
          <p class="text-sm text-muted-foreground">
            Diese Gruppe wählt ihre Extras nach eigenen Regeln aus. Ändern geht nur in der Shopware Administration
            (Kataloge › Dynamische Produktgruppen).
          </p>
          <p v-if="group.products.length" class="text-sm">{{ group.products.map((p) => p.name).join(", ") }}</p>
        </template>
      </CardContent>
    </Card>

    <Card>
      <CardContent>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="create">
          <div class="grid min-w-48 flex-1 gap-2">
            <Label for="neu">Neue Gruppe</Label>
            <Input id="neu" v-model="newName" required placeholder="z. B. Nudel Extras" />
          </div>
          <Button type="submit" :disabled="busy === 'neu'">Anlegen</Button>
          <SaveStatus class="basis-full" :state="saves.state('neu')" />
        </form>
      </CardContent>
    </Card>
  </div>
</template>
