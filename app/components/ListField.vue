<script setup lang="ts">
/** A list as comma-separated text, with suggestions. Simple and fully keyboard friendly. */
const props = defineProps<{ id: string; label: string; hint?: string; suggestions?: string[] }>();
const model = defineModel<string[]>({ required: true });
const text = ref(model.value.join(", "));
watch(model, (value) => {
  if (value.join(", ") !== text.value.replace(/\s*,\s*/g, ", ").trim()) text.value = value.join(", ");
});
function commit() {
  model.value = [...new Set(text.value.split(",").map((s) => s.trim()).filter(Boolean))];
}
</script>

<template>
  <div class="grid gap-2">
    <Label :for="id">{{ label }}</Label>
    <p v-if="hint" :id="`${id}-hint`" class="text-sm text-muted-foreground">{{ hint }}</p>
    <Input
      :id="id"
      v-model="text"
      :list="suggestions?.length ? `${id}-list` : undefined"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      @change="commit"
      @blur="commit"
    />
    <datalist v-if="props.suggestions?.length" :id="`${id}-list`">
      <option v-for="s in props.suggestions" :key="s" :value="s" />
    </datalist>
  </div>
</template>
