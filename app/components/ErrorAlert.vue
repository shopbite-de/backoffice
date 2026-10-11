<script setup lang="ts">
import { CircleAlert } from "@lucide/vue";

/** Error next to the action that caused it; read out at once (role="alert"). */
defineProps<{ message: string | null }>();
</script>

<template>
  <Alert v-if="message" variant="destructive" role="alert">
    <CircleAlert aria-hidden="true" />
    <AlertDescription>{{ message }}</AlertDescription>
  </Alert>
</template>
