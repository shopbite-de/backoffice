<script setup lang="ts">
import type { NuxtError } from "#app";

/** Every unexpected error in German, with a way back (no stack, no technical message). */
const props = defineProps<{ error: NuxtError }>();
const notFound = computed(() => props.error.statusCode === 404);
useHead({ title: notFound.value ? "Nicht gefunden" : "Fehler" });
</script>

<template>
  <div class="mx-auto mt-[15vh] max-w-sm space-y-4 px-4 text-center">
    <img
      src="/brand/shopbite-logo.svg"
      alt="ShopBite"
      width="324"
      height="103"
      class="mx-auto h-8 w-auto dark:hidden"
    />
    <img
      src="/brand/shopbite-logo-white.svg"
      alt="ShopBite"
      width="324"
      height="103"
      class="mx-auto hidden h-8 w-auto dark:block"
    />
    <h1 class="text-2xl font-semibold">{{ notFound ? "Diese Seite gibt es nicht" : "Da ist etwas schiefgelaufen" }}</h1>
    <p class="text-muted-foreground">
      {{
        notFound
          ? "Vielleicht ein alter Link."
          : "Bitte noch einmal versuchen. Bleibt der Fehler, bitte bei ShopBite melden."
      }}
    </p>
    <Button @click="clearError({ redirect: '/' })">Zu „Heute“</Button>
  </div>
</template>
