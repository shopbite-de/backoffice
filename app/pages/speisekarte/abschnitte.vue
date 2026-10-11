<script setup lang="ts">
import { ArrowDown, ArrowLeft, ArrowUp } from "@lucide/vue";
import type { MenuSectionDetail } from "#shared/types/backoffice";

definePageMeta({ capability: "menu" });
useHead({ title: "Abschnitte" });
const api = useBackofficeApi();
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const { data: sections } = await useAsyncData("sections", () => api<MenuSectionDetail[]>("/api/sections"));

// editable copies, keyed by id
const drafts = ref<Record<string, { name: string; title: string; description: string; path: string }>>({});
watchEffect(() => {
  drafts.value = Object.fromEntries(
    (sections.value ?? []).map((s) => [
      s.id,
      { name: s.name, title: s.seo.title, description: s.seo.description, path: s.seo.path },
    ]),
  );
});

async function patch(section: MenuSectionDetail, body: Record<string, unknown>, message: string) {
  error.value = null;
  saved.value = null;
  try {
    sections.value = await api<MenuSectionDetail[]>(`/api/sections/${section.id}`, { method: "PATCH", body });
    saved.value = message;
  } catch (e) {
    error.value = `${section.name}: ${errorMessage(e)}`;
  }
}

function save(section: MenuSectionDetail) {
  const d = drafts.value[section.id]!;
  patch(
    section,
    { name: d.name, seo: { title: d.title, description: d.description, path: d.path } },
    `${d.name} gespeichert.`,
  );
}

const newName = ref("");
async function create() {
  error.value = null;
  try {
    sections.value = await api<MenuSectionDetail[]>("/api/sections", { method: "POST", body: { name: newName.value } });
    saved.value = `${newName.value} angelegt.`;
    newName.value = "";
  } catch (e) {
    error.value = errorMessage(e);
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
      <p class="text-muted-foreground">Reihenfolge und Namen, wie Gäste sie im Shop sehen.</p>
    </div>
    <ErrorAlert :message="error" />
    <Alert v-if="saved" role="status"
      ><AlertDescription>{{ saved }}</AlertDescription></Alert
    >

    <ol class="space-y-3">
      <li v-for="(section, i) in sections" :key="section.id">
        <Card>
          <CardContent class="space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  :disabled="i === 0"
                  @click="patch(section, { move: 'up' }, `${section.name} nach oben verschoben.`)"
                >
                  <ArrowUp aria-hidden="true" /><span class="sr-only">{{ section.name }} nach oben</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  :disabled="i === (sections?.length ?? 0) - 1"
                  @click="patch(section, { move: 'down' }, `${section.name} nach unten verschoben.`)"
                >
                  <ArrowDown aria-hidden="true" /><span class="sr-only">{{ section.name }} nach unten</span>
                </Button>
              </div>
              <p class="min-w-0 flex-1 font-semibold">
                {{ section.name }}
                <span class="font-normal text-muted-foreground">· {{ section.dishCount }} Gerichte</span>
                <Badge v-if="!section.visible" variant="secondary" class="ml-1">ausgeblendet</Badge>
              </p>
              <Switch
                :model-value="section.visible"
                :aria-label="`${section.name} im Shop zeigen`"
                @update:model-value="
                  patch(section, { visible: $event }, `${section.name} ${$event ? 'eingeblendet' : 'ausgeblendet'}.`)
                "
              />
            </div>
            <details>
              <summary class="min-h-8 pointer-coarse:min-h-11 cursor-pointer py-2 text-muted-foreground">
                Name und SEO bearbeiten
              </summary>
              <form v-if="drafts[section.id]" class="mt-2 grid gap-4" @submit.prevent="save(section)">
                <div class="grid gap-2">
                  <Label :for="`n-${section.id}`">Name</Label>
                  <Input :id="`n-${section.id}`" v-model="drafts[section.id]!.name" required />
                </div>
                <div class="grid gap-2">
                  <Label :for="`p-${section.id}`">Adresse im Shop</Label>
                  <p :id="`p-${section.id}-hint`" class="text-sm text-muted-foreground">
                    Wie Speisekarte/Pizza/. Die alte Adresse leitet automatisch weiter.
                  </p>
                  <Input
                    :id="`p-${section.id}`"
                    v-model="drafts[section.id]!.path"
                    :aria-describedby="`p-${section.id}-hint`"
                  />
                </div>
                <div class="grid gap-2">
                  <Label :for="`t-${section.id}`">Titel in Suchmaschinen</Label>
                  <Input :id="`t-${section.id}`" v-model="drafts[section.id]!.title" maxlength="255" />
                </div>
                <div class="grid gap-2">
                  <Label :for="`d-${section.id}`">Beschreibung in Suchmaschinen</Label>
                  <Textarea
                    :id="`d-${section.id}`"
                    v-model="drafts[section.id]!.description"
                    maxlength="255"
                    rows="2"
                  />
                </div>
                <div>
                  <Button type="submit"
                    >Speichern<span class="sr-only"> {{ section.name }}</span></Button
                  >
                </div>
              </form>
            </details>
          </CardContent>
        </Card>
      </li>
    </ol>

    <Card>
      <CardContent>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="create">
          <div class="grid min-w-48 flex-1 gap-2">
            <Label for="neu">Neuer Abschnitt</Label>
            <Input id="neu" v-model="newName" required placeholder="z. B. Mittagstisch" />
          </div>
          <Button type="submit">Anlegen</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
