<script setup lang="ts">
import { Check, ChevronDown } from "@lucide/vue";
import type { FoodLabel } from "#shared/utils/labels";

/**
 * Allergens or additives as big tiles to tap, the name in plain words and the menu code small
 * next to it. Labels of one `kind` (cereals, nuts) share a tile that opens to its members, so
 * the list stays short and "A" does not appear six times in a row.
 */
const props = defineProps<{ labels: FoodLabel[]; modelValue: string[]; idPrefix: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

// one shape for both tile kinds, Vue templates narrow on `label` but not on a union
interface Tile {
  key: string;
  code: string;
  /** a single allergen or additive */
  label: FoodLabel | null;
  /** or a kind (cereals, nuts) with its members */
  kind: string;
  items: FoodLabel[];
}
const tiles = computed<Tile[]>(() => {
  const out: Tile[] = [];
  for (const label of props.labels) {
    if (!label.kind) {
      out.push({ key: label.key, code: label.code, label, kind: "", items: [] });
      continue;
    }
    const group = out.find((t) => t.kind === label.kind);
    if (group) group.items.push(label);
    else out.push({ key: label.kind, code: label.code, label: null, kind: label.kind, items: [label] });
  }
  return out;
});

const has = (key: string) => props.modelValue.includes(key);
function toggle(key: string) {
  emit("update:modelValue", has(key) ? props.modelValue.filter((k) => k !== key) : [...props.modelValue, key]);
}

// a kind tile shows what is chosen inside and opens on tap
const open = ref(new Set<string>());
const chosen = (items: FoodLabel[]) => items.filter((i) => has(i.key)).map((i) => i.name);
function toggleKind(kind: string) {
  if (open.value.has(kind)) open.value.delete(kind);
  else open.value.add(kind);
}
onMounted(() => {
  for (const t of tiles.value) if (t.kind && chosen(t.items).length) open.value.add(t.kind);
});

const tileClass =
  "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-14";
const onClass = "border-primary bg-accent text-accent-foreground";
const offClass = "border-border bg-card hover:bg-muted";
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <template v-for="tile in tiles" :key="tile.key">
      <button
        v-if="tile.label"
        :id="`${idPrefix}-${tile.label.key}`"
        type="button"
        role="checkbox"
        :aria-checked="has(tile.label.key)"
        :class="[tileClass, has(tile.label.key) ? onClass : offClass]"
        @click="toggle(tile.label.key)"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-md border"
          :class="has(tile.label.key) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
          aria-hidden="true"
        >
          <Check v-if="has(tile.label.key)" class="size-4" />
        </span>
        <span class="flex-1">{{ tile.label.name }}</span>
        <span class="text-sm text-muted-foreground tabular-nums" aria-hidden="true">{{ tile.label.code }}</span>
      </button>
      <div v-else class="grid gap-2 sm:col-span-2">
        <button
          type="button"
          :aria-expanded="open.has(tile.kind)"
          :class="[tileClass, chosen(tile.items).length ? onClass : offClass]"
          @click="toggleKind(tile.kind)"
        >
          <ChevronDown
            class="size-5 shrink-0 transition-transform"
            :class="{ '-rotate-90': !open.has(tile.kind) }"
            aria-hidden="true"
          />
          <span class="flex-1">
            {{ tile.kind }}
            <span v-if="chosen(tile.items).length" class="block text-sm">{{ chosen(tile.items).join(", ") }}</span>
            <span v-else class="block text-sm text-muted-foreground">Keine ausgewählt</span>
          </span>
          <span class="text-sm text-muted-foreground tabular-nums" aria-hidden="true">{{ tile.code }}</span>
        </button>
        <div v-if="open.has(tile.kind)" class="grid gap-2 pl-4 sm:grid-cols-2">
          <button
            v-for="label in tile.items"
            :id="`${idPrefix}-${label.key}`"
            :key="label.key"
            type="button"
            role="checkbox"
            :aria-checked="has(label.key)"
            :class="[tileClass, has(label.key) ? onClass : offClass]"
            @click="toggle(label.key)"
          >
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-md border"
              :class="has(label.key) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
              aria-hidden="true"
            >
              <Check v-if="has(label.key)" class="size-4" />
            </span>
            <span class="flex-1">{{ label.name }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
