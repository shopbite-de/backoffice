<script setup lang="ts">
import type { MenuDish } from "#shared/types/backoffice";

/** One dish in the menu list: link to the editor, price, on the menu. */
defineProps<{ dish: MenuDish }>();
const emit = defineEmits<{ price: [event: Event]; onMenu: [value: boolean] }>();
</script>

<template>
  <li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" :class="{ 'text-muted-foreground': !dish.onMenu }">
    <span class="w-12 shrink-0 text-sm tabular-nums text-muted-foreground">{{ dish.number }}</span>
    <span class="min-w-0 flex-1 font-medium">
      <NuxtLink
        :to="`/speisekarte/${dish.id}`"
        class="underline decoration-border underline-offset-4 hover:decoration-foreground"
        >{{ dish.name }}</NuxtLink
      >
      <span v-if="!dish.onMenu" class="ml-1 text-sm font-normal">· nicht auf der Karte</span>
      <Badge
        v-if="!dish.allergensChecked"
        variant="outline"
        class="ml-2 border-warning-border bg-warning text-warning-foreground"
        >Allergene fehlen</Badge
      >
    </span>
    <div class="flex items-center gap-2">
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
    <Switch
      :model-value="dish.onMenu"
      :aria-label="`${dish.name} auf der Karte`"
      @update:model-value="emit('onMenu', $event)"
    />
  </li>
</template>
