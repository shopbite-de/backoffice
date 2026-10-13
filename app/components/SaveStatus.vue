<script setup lang="ts">
import { Check, CircleAlert, LoaderCircle } from "@lucide/vue";
import type { SaveState } from "~/composables/useSaveState";

/** "Speichert…", "Gespeichert" or the error, right next to what was changed (see useSaveState). */
defineProps<{ state: SaveState | null }>();
</script>

<template>
  <!-- the status region stays in the DOM so screen readers announce every change -->
  <span role="status" class="contents">
    <span
      v-if="state && state.kind !== 'error'"
      class="inline-flex items-center gap-1.5 text-sm font-medium pointer-coarse:text-base"
      :class="state.kind === 'saved' ? 'text-success' : 'text-muted-foreground'"
    >
      <LoaderCircle v-if="state.kind === 'saving'" class="size-4 animate-spin" aria-hidden="true" />
      <Check v-else class="size-4" aria-hidden="true" />{{ state.message }}
    </span>
  </span>
  <span
    v-if="state?.kind === 'error'"
    role="alert"
    class="inline-flex items-start gap-1.5 text-sm font-medium text-destructive pointer-coarse:text-base"
  >
    <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ state.message }}
  </span>
</template>
