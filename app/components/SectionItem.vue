<script setup lang="ts">
import { ArrowDown, ArrowUp } from "@lucide/vue";
import type { MenuSectionDetail } from "#shared/types/backoffice";
import type { SaveState } from "~/composables/useSaveState";

/**
 * One section or sub-section on the sections page: order, visibility, name, SEO and
 * where it belongs. Changes go to the page, which saves and reloads the tree.
 */
const props = defineProps<{
  section: MenuSectionDetail;
  first: boolean;
  last: boolean;
  /** sections a sub-section can move to (top level only) */
  parents: { id: string; name: string }[];
  /** feedback of the last change to this section, shown right here */
  status: SaveState | null;
}>();
const emit = defineEmits<{ patch: [body: Record<string, unknown>, message: string] }>();

const draft = ref({ name: "", title: "", description: "", path: "" });
watchEffect(() => {
  draft.value = {
    name: props.section.name,
    title: props.section.seo.title,
    description: props.section.seo.description,
    path: props.section.seo.path,
  };
});
const isSub = computed(() => props.section.parentId !== null);
// a section with sub-sections stays a section (two levels, like the storefront)
const canMove = computed(() => isSub.value || props.section.children.length === 0);

function save() {
  emit(
    "patch",
    {
      name: draft.value.name,
      seo: { title: draft.value.title, description: draft.value.description, path: draft.value.path },
    },
    `${draft.value.name} gespeichert`,
  );
}
function moveTo(value: unknown) {
  const parentId = value === "" ? null : String(value);
  const target = parentId ? props.parents.find((p) => p.id === parentId)?.name : "die Karte";
  emit("patch", { parentId }, `${props.section.name} nach ${target} verschoben`);
}
const id = (part: string) => `${part}-${props.section.id}`;
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          :disabled="first"
          @click="emit('patch', { move: 'up' }, `${section.name} nach oben verschoben`)"
        >
          <ArrowUp aria-hidden="true" /><span class="sr-only">{{ section.name }} nach oben</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          :disabled="last"
          @click="emit('patch', { move: 'down' }, `${section.name} nach unten verschoben`)"
        >
          <ArrowDown aria-hidden="true" /><span class="sr-only">{{ section.name }} nach unten</span>
        </Button>
      </div>
      <p class="min-w-0 flex-1" :class="isSub ? 'font-medium' : 'font-semibold'">
        {{ section.name }}
        <span class="block text-sm font-normal text-muted-foreground sm:inline sm:text-base"
          >{{ section.dishCount }} Gerichte</span
        >
      </p>
      <div class="flex items-center gap-2">
        <Label :for="id('sichtbar')" class="font-normal" :class="{ 'text-muted-foreground': !section.visible }">
          {{ section.visible ? "Im Shop sichtbar" : "Ausgeblendet" }}<span class="sr-only">: {{ section.name }}</span>
        </Label>
        <Switch
          :id="id('sichtbar')"
          :model-value="section.visible"
          @update:model-value="
            emit(
              'patch',
              { visible: $event },
              `${section.name} ist ${$event ? 'wieder im Shop sichtbar' : 'ausgeblendet'}`,
            )
          "
        />
      </div>
    </div>
    <SaveStatus :state="status" />
    <details>
      <summary class="min-h-8 pointer-coarse:min-h-11 cursor-pointer py-2 text-sm text-muted-foreground">
        Bearbeiten<span class="sr-only"> ({{ section.name }}: Name, Ort, Suchmaschinen)</span>
      </summary>
      <form class="mt-2 grid gap-4" @submit.prevent="save">
        <div class="grid gap-2">
          <Label :for="id('n')">Name</Label>
          <Input :id="id('n')" v-model="draft.name" required />
        </div>
        <div v-if="canMove && parents.length" class="grid gap-2">
          <Label :for="id('ort')">Gehört zu</Label>
          <NativeSelect
            :id="id('ort')"
            class="w-full"
            :model-value="section.parentId ?? ''"
            @update:model-value="moveTo"
          >
            <option value="">Karte (eigener Abschnitt)</option>
            <option v-for="p in parents.filter((p) => p.id !== section.id)" :key="p.id" :value="p.id">
              Unterabschnitt von {{ p.name }}
            </option>
          </NativeSelect>
        </div>
        <div class="grid gap-2">
          <Label :for="id('p')">Adresse im Shop</Label>
          <p :id="id('p-hint')" class="text-sm text-muted-foreground">
            Wie Speisekarte/Pizza/. Die alte Adresse leitet automatisch weiter.
          </p>
          <Input :id="id('p')" v-model="draft.path" :aria-describedby="id('p-hint')" />
        </div>
        <div class="grid gap-2">
          <Label :for="id('t')">Titel in Suchmaschinen</Label>
          <Input :id="id('t')" v-model="draft.title" maxlength="255" />
        </div>
        <div class="grid gap-2">
          <Label :for="id('d')">Beschreibung in Suchmaschinen</Label>
          <Textarea :id="id('d')" v-model="draft.description" maxlength="255" rows="2" />
        </div>
        <div>
          <Button type="submit"
            >Speichern<span class="sr-only"> {{ section.name }}</span></Button
          >
        </div>
      </form>
    </details>
  </div>
</template>
