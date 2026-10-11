<script setup lang="ts">
import { WifiOff } from "@lucide/vue";
import { useOnline } from "@vueuse/core";

/** Shown while the device has no connection; the app shell keeps working from the service worker. */
const online = useOnline();
</script>

<template>
  <div
    v-if="!online"
    role="status"
    class="flex items-center gap-2 bg-warning px-4 py-2 text-sm text-warning-foreground"
  >
    <WifiOff class="size-4" aria-hidden="true" />
    Keine Verbindung. Bestellungen und Änderungen gehen erst wieder, wenn das Netz zurück ist.
  </div>
</template>
