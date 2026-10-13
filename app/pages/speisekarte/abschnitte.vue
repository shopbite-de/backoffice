<script setup lang="ts">
import { ArrowLeft, Plus } from "@lucide/vue";
import type { MenuSectionDetail } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
useHead({ title: "Abschnitte" });
const api = useBackofficeApi();
// feedback at the section that changed, "neu" at the create forms
const saves = useSaveState();
const { data: sections } = await useAsyncData("sections", () => api<MenuSectionDetail[]>("/api/sections"));
const parents = computed(() => (sections.value ?? []).map((s) => ({ id: s.id, name: s.name })));

function patch(section: MenuSectionDetail, body: Record<string, unknown>, message: string) {
  return saves.run(
    section.id,
    async () => {
      sections.value = await api<MenuSectionDetail[]>(`/api/sections/${section.id}`, { method: "PATCH", body });
    },
    message,
  );
}

function create(name: string, parentId?: string) {
  return saves.run(
    "neu",
    async () => {
      sections.value = await api<MenuSectionDetail[]>("/api/sections", { method: "POST", body: { name, parentId } });
    },
    `${name} angelegt`,
  );
}

const newName = ref("");
const newSub = ref<Record<string, string>>({});
// the field for a new sub-section opens on demand, so the list stays calm
const addingTo = ref<string | null>(null);
async function openAdd(id: string) {
  addingTo.value = id;
  await nextTick();
  document.getElementById(`neu-${id}`)?.focus();
}
async function createSection() {
  if (await create(newName.value)) newName.value = "";
}
async function createSub(parent: MenuSectionDetail) {
  const name = newSub.value[parent.id]?.trim();
  if (name && (await create(name, parent.id))) {
    newSub.value[parent.id] = "";
    addingTo.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <Button variant="link" class="h-auto px-0 text-muted-foreground" as-child>
        <NuxtLink to="/speisekarte"><ArrowLeft aria-hidden="true" />Zur Speisekarte</NuxtLink>
      </Button>
      <h1 class="mt-1 text-2xl font-semibold">Abschnitte</h1>
      <p class="text-muted-foreground">
        Reihenfolge und Namen, wie Gäste sie im Shop sehen. Ein Abschnitt kann Unterabschnitte haben, z. B. Nudeln ›
        Spaghetti.
      </p>
    </div>
    <ol class="space-y-3">
      <li v-for="(section, i) in sections" :key="section.id">
        <Card>
          <CardContent class="space-y-3">
            <SectionItem
              :section="section"
              :first="i === 0"
              :last="i === (sections?.length ?? 0) - 1"
              :parents="parents"
              :status="saves.state(section.id)"
              @patch="(body, message) => patch(section, body, message)"
            />
            <ol
              v-if="section.children.length"
              class="space-y-3 border-l-2 pl-4"
              :aria-label="`Unterabschnitte von ${section.name}`"
            >
              <li v-for="(child, j) in section.children" :key="child.id">
                <SectionItem
                  :section="child"
                  :first="j === 0"
                  :last="j === section.children.length - 1"
                  :parents="parents"
                  :status="saves.state(child.id)"
                  @patch="(body, message) => patch(child, body, message)"
                />
              </li>
            </ol>
            <form
              v-if="addingTo === section.id"
              class="flex flex-wrap items-end gap-2 pl-4"
              @submit.prevent="createSub(section)"
              @keydown.esc="addingTo = null"
            >
              <div class="grid min-w-48 flex-1 gap-2">
                <Label :for="`neu-${section.id}`" class="font-normal text-muted-foreground"
                  >Unterabschnitt in {{ section.name }}</Label
                >
                <Input :id="`neu-${section.id}`" v-model="newSub[section.id]" required placeholder="z. B. Spaghetti" />
              </div>
              <Button type="submit">Anlegen</Button>
              <Button type="button" variant="ghost" @click="addingTo = null">Abbrechen</Button>
              <SaveStatus class="basis-full" :state="saves.state('neu')" />
            </form>
            <Button v-else variant="ghost" size="sm" class="ml-2 text-muted-foreground" @click="openAdd(section.id)">
              <Plus aria-hidden="true" />Unterabschnitt<span class="sr-only"> in {{ section.name }}</span>
            </Button>
          </CardContent>
        </Card>
      </li>
    </ol>

    <Card>
      <CardContent>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="createSection">
          <div class="grid min-w-48 flex-1 gap-2">
            <Label for="neu">Neuer Abschnitt</Label>
            <Input id="neu" v-model="newName" required placeholder="z. B. Mittagstisch" />
          </div>
          <Button type="submit">Anlegen</Button>
          <SaveStatus class="basis-full" :state="saves.state('neu')" />
        </form>
      </CardContent>
    </Card>
  </div>
</template>
