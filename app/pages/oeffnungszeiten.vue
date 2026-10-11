<script setup lang="ts">
import { Plus, X } from "@lucide/vue";
import type { OpeningInterval } from "#shared/types/backoffice";

definePageMeta({ capability: "hours" });
useHead({ title: "Öffnungszeiten" });
const api = useBackofficeApi();
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const saving = ref(false);

const { data } = await useAsyncData("hours", () => api<OpeningInterval[]>("/api/hours"));
const week = ref<{ open: string; close: string }[][]>([]);
watchEffect(() => {
  week.value = WEEKDAYS.map((_, i) =>
    (data.value ?? []).filter((h) => h.dayOfWeek === i + 1).map((h) => ({ open: h.openingTime, close: h.closingTime })),
  );
});

function add(day: number) {
  week.value[day]!.push({ open: "11:00", close: "22:00" });
}
function remove(day: number, index: number) {
  week.value[day]!.splice(index, 1);
}

async function save() {
  error.value = null;
  saved.value = null;
  saving.value = true;
  try {
    const intervals = week.value.flatMap((day, i) =>
      day.map((h) => ({ dayOfWeek: i + 1, openingTime: h.open, closingTime: h.close })),
    );
    await api("/api/hours", { method: "PUT", body: { intervals } });
    saved.value = "Öffnungszeiten gespeichert.";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <h1 class="text-2xl font-semibold">Öffnungszeiten</h1>
    <ErrorAlert :message="error" />
    <Alert v-if="saved" role="status"
      ><AlertDescription>{{ saved }}</AlertDescription></Alert
    >
    <Card class="py-0">
      <ul class="divide-y">
        <li v-for="(day, d) in week" :key="d" class="flex flex-wrap items-start gap-4 px-4 py-4">
          <h2 class="w-28 pt-2.5 font-medium">{{ WEEKDAYS[d] }}</h2>
          <div class="flex-1 space-y-2">
            <p v-if="!day.length" class="pt-2.5 text-muted-foreground">Ruhetag</p>
            <div v-for="(h, i) in day" :key="i" class="flex flex-wrap items-center gap-2">
              <Label :for="`auf-${d}-${i}`" class="sr-only">{{ WEEKDAYS[d] }} öffnet</Label>
              <Input :id="`auf-${d}-${i}`" v-model="h.open" type="time" required class="w-32" />
              <span aria-hidden="true">bis</span>
              <Label :for="`zu-${d}-${i}`" class="sr-only">{{ WEEKDAYS[d] }} schließt</Label>
              <Input :id="`zu-${d}-${i}`" v-model="h.close" type="time" required class="w-32" />
              <Button variant="ghost" size="icon" @click="remove(d, i)">
                <X aria-hidden="true" /><span class="sr-only">{{ WEEKDAYS[d] }} {{ h.open }} entfernen</span>
              </Button>
            </div>
          </div>
          <Button variant="outline" @click="add(d)">
            <Plus aria-hidden="true" />Zeit<span class="sr-only"> am {{ WEEKDAYS[d] }}</span>
          </Button>
        </li>
      </ul>
    </Card>
    <Button type="submit" :disabled="saving">Speichern</Button>
  </form>
</template>
