<script setup lang="ts">
import { Monitor, Moon, Sun } from "@lucide/vue";

const { mode, next, label } = useColorMode();
const icon = computed(() => ({ system: Monitor, light: Sun, dark: Moon })[mode.value]);
</script>

<template>
  <Button variant="ghost" size="icon" :title="`Darstellung: ${label}`" @click="next">
    <component :is="icon" aria-hidden="true" />
    <span class="sr-only">Darstellung: {{ label }}, wechseln</span>
  </Button>
</template>
