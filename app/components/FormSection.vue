<script setup lang="ts">
/** One block of a form: card with a heading, an optional hint and the fields. */
defineProps<{ title: string; hint?: string }>();
const id = useId();
</script>

<template>
  <section :aria-labelledby="id"><Card>
    <CardHeader>
      <CardTitle><h2 :id="id" class="text-lg font-semibold">{{ title }}</h2></CardTitle>
      <CardDescription v-if="hint">{{ hint }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-5">
      <slot />
    </CardContent>
  </Card></section>
</template>
