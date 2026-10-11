<script setup lang="ts">
import { Download } from "@lucide/vue";

/** "App installieren" where the browser offers it (Chrome, Edge, Android); iOS: see "Mein Zugang". */
const { $pwa } = useNuxtApp();
</script>

<template>
  <Button v-if="$pwa?.showInstallPrompt && !$pwa?.isPWAInstalled" variant="outline" size="sm" @click="$pwa.install()">
    <Download aria-hidden="true" />App installieren
  </Button>
</template>
