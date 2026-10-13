<script setup lang="ts">
import type { MenuDish } from "#shared/types/backoffice";
import type { SaveState } from "~/composables/useSaveState";

/**
 * One dish in the menu list: link to the editor, price, on the menu.
 * Phones get two lines (number, name and switch above, price below), wider screens one.
 * The save state of this dish shows below it, where the change was made.
 */
defineProps<{ dish: MenuDish; status: SaveState | null }>();
const emit = defineEmits<{ price: [event: Event]; onMenu: [value: boolean] }>();
</script>

<template>
  <li
    class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:gap-y-1"
    :class="{ 'text-muted-foreground': !dish.onMenu }"
  >
    <span class="text-sm tabular-nums text-muted-foreground sm:row-span-2">{{ dish.number }}</span>
    <NuxtLink
      :to="`/speisekarte/${dish.id}`"
      class="min-w-0 font-medium break-words underline decoration-border underline-offset-4 hover:decoration-foreground"
      >{{ dish.name }}</NuxtLink
    >
    <Switch
      class="justify-self-end sm:col-start-4 sm:row-span-2 sm:row-start-1"
      :model-value="dish.onMenu"
      :aria-label="`${dish.name} auf der Karte`"
      @update:model-value="emit('onMenu', $event)"
    />
    <div class="col-start-2 flex min-w-0 flex-wrap items-center gap-2">
      <span v-if="!dish.onMenu" class="text-sm">Nicht auf der Karte</span>
      <Badge
        v-if="!dish.allergensChecked"
        variant="outline"
        class="border-warning-border bg-warning text-warning-foreground"
        >Allergene fehlen</Badge
      >
    </div>
    <div class="col-start-3 row-start-2 flex items-center justify-end gap-2 sm:row-span-2 sm:row-start-1">
      <Label :for="`preis-${dish.id}`" class="sr-only">Preis {{ dish.name }} in Euro</Label>
      <Input
        :id="`preis-${dish.id}`"
        :model-value="dish.price?.toFixed(2).replace('.', ',')"
        inputmode="decimal"
        class="w-24 text-right tabular-nums"
        @change="emit('price', $event)"
      />
      <span aria-hidden="true">€</span>
    </div>
    <div v-if="status" class="col-span-full col-start-2 sm:col-start-2">
      <SaveStatus :state="status" />
    </div>
  </li>
</template>
