<script setup lang="ts">
import { RefreshCw, WifiOff } from "@lucide/vue";
import { useOnline } from "@vueuse/core";

/** Opened without network (e.g. the installed app on the tablet): try again, or continue as soon as it is back. */
useHead({ title: "Keine Verbindung" });
const route = useRoute();
const online = useOnline();
const target = computed(() =>
  typeof route.query.weiter === "string" && route.query.weiter.startsWith("/") ? route.query.weiter : "/",
);

function retry() {
  // a full load, so the session check runs again
  window.location.assign(target.value);
}
// the browser reports "online" a moment before requests get through again
watch(online, (now) => now && setTimeout(retry, 1500));
</script>

<template>
  <div class="mx-auto mt-[15vh] max-w-sm space-y-4 text-center">
    <WifiOff class="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
    <h1 class="text-2xl font-semibold">Keine Verbindung</h1>
    <p class="text-muted-foreground">
      Das Gerät ist offline. Sobald das Netz zurück ist, geht es hier automatisch weiter.
    </p>
    <Button @click="retry"><RefreshCw aria-hidden="true" />Erneut versuchen</Button>
  </div>
</template>
