<script setup lang="ts">
import { CalendarOff, Copy, Plus, X } from "@lucide/vue";
import type { Holiday, OpeningInterval } from "#shared/types/backoffice";

definePageMeta({ capability: "hours" });
useHead({ title: "Öffnungszeiten" });
const api = useBackofficeApi();
const saves = useSaveState();
const saving = ref(false);

type Times = { open: string; close: string };
const DEFAULT: Times = { open: "11:00", close: "22:00" };

const { data } = await useAsyncData("hours", () => api<OpeningInterval[]>("/api/hours"));
const week = ref<Times[][]>([]);
// what a day had before it became a closed day, so switching it back on brings the times back
const remembered = new Map<number, Times[]>();
watchEffect(() => {
  week.value = WEEKDAYS.map((_, i) =>
    (data.value ?? []).filter((h) => h.dayOfWeek === i + 1).map((h) => ({ open: h.openingTime, close: h.closingTime })),
  );
});

const isOpen = (day: number) => week.value[day]!.length > 0;
function setOpen(day: number, open: boolean) {
  if (open) {
    week.value[day] = (remembered.get(day) ?? [DEFAULT]).map((t) => ({ ...t }));
  } else {
    remembered.set(day, week.value[day]!);
    week.value[day] = [];
  }
}
function add(day: number) {
  const last = week.value[day]!.at(-1);
  week.value[day]!.push(last ? { open: last.close, close: "23:00" } : { ...DEFAULT });
}
function remove(day: number, index: number) {
  week.value[day]!.splice(index, 1);
}
// one day typed, the rest of the week copied; closed days stay closed
function copyToWeek(day: number) {
  const times = week.value[day]!;
  week.value = week.value.map((d, i) => (i === day || !d.length ? d : times.map((t) => ({ ...t }))));
  saves.set("week", { kind: "saved", message: `Zeiten von ${WEEKDAYS[day]} auf alle offenen Tage übernommen` });
}

async function save() {
  saving.value = true;
  const intervals = week.value.flatMap((day, i) =>
    day.map((h) => ({ dayOfWeek: i + 1, openingTime: h.open, closingTime: h.close })),
  );
  await saves.run(
    "week",
    () => api("/api/hours", { method: "PUT", body: { intervals } }),
    "Öffnungszeiten gespeichert",
  );
  saving.value = false;
}

// holidays and company vacations: saved at once, independent of the week
const { data: holidays, refresh: refreshHolidays } = await useAsyncData("holidays", () =>
  api<Holiday[]>("/api/holidays"),
);
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const newStart = ref(today);
const newEnd = ref("");
const fmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtShort = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const day = (s: string) => new Date(`${s}T12:00:00`);
const period = (h: Holiday) =>
  h.start === h.end ? fmt.format(day(h.start)) : `${fmtShort.format(day(h.start))} bis ${fmt.format(day(h.end))}`;
const isPast = (h: Holiday) => h.end < today;

async function addHoliday() {
  const start = newStart.value;
  const end = newEnd.value || start;
  if (end < start) {
    saves.set("holiday", { kind: "error", message: "Das Ende liegt vor dem Anfang." });
    return;
  }
  const ok = await saves.run(
    "holiday",
    () => api("/api/holidays", { method: "POST", body: { start, end } }),
    "Eingetragen, der Shop nimmt an diesen Tagen keine Bestellungen an",
  );
  if (ok) {
    newEnd.value = "";
    await refreshHolidays();
  }
}
async function removeHoliday(h: Holiday) {
  await saves.run("holiday", () => api(`/api/holidays/${h.id}`, { method: "DELETE" }), "Schließtag entfernt");
  await refreshHolidays();
}
</script>

<template>
  <div class="space-y-8">
    <form class="space-y-4" @submit.prevent="save">
      <h1 class="text-2xl font-semibold">Öffnungszeiten</h1>
      <Card class="py-0">
        <ul class="divide-y">
          <li v-for="(times, d) in week" :key="d" class="space-y-3 px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-medium">{{ WEEKDAYS[d] }}</h2>
              <div class="flex items-center gap-2">
                <Label :for="`offen-${d}`" class="font-normal" :class="{ 'text-muted-foreground': !isOpen(d) }">
                  {{ isOpen(d) ? "Geöffnet" : "Ruhetag" }}
                </Label>
                <Switch :id="`offen-${d}`" :model-value="isOpen(d)" @update:model-value="setOpen(d, $event)" />
              </div>
            </div>
            <template v-if="isOpen(d)">
              <div v-for="(h, i) in times" :key="i" class="flex flex-wrap items-center gap-2">
                <Label :for="`auf-${d}-${i}`" class="sr-only">{{ WEEKDAYS[d] }} öffnet</Label>
                <Input :id="`auf-${d}-${i}`" v-model="h.open" type="time" required class="w-28 tabular-nums" />
                <span aria-hidden="true">bis</span>
                <Label :for="`zu-${d}-${i}`" class="sr-only">{{ WEEKDAYS[d] }} schließt</Label>
                <Input :id="`zu-${d}-${i}`" v-model="h.close" type="time" required class="w-28 tabular-nums" />
                <Button v-if="times.length > 1" type="button" variant="ghost" size="icon" @click="remove(d, i)">
                  <X aria-hidden="true" /><span class="sr-only">{{ WEEKDAYS[d] }} {{ h.open }} entfernen</span>
                </Button>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" @click="add(d)">
                  <Plus aria-hidden="true" />Zweite Zeit<span class="sr-only"> am {{ WEEKDAYS[d] }}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" @click="copyToWeek(d)">
                  <Copy aria-hidden="true" />Für alle Tage übernehmen
                </Button>
              </div>
            </template>
          </li>
        </ul>
      </Card>
      <div class="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" class="w-full sm:w-auto" :disabled="saving">Öffnungszeiten speichern</Button>
        <SaveStatus :state="saves.state('week')" />
      </div>
    </form>

    <section aria-labelledby="schliesstage" class="space-y-4">
      <div>
        <h2 id="schliesstage" class="text-xl font-semibold">Feiertage und Urlaub</h2>
        <p class="text-muted-foreground">An diesen Tagen ist der Shop geschlossen, Gäste sehen einen Hinweis.</p>
      </div>
      <Card class="py-0">
        <ul v-if="holidays?.length" class="divide-y">
          <li
            v-for="h in holidays"
            :key="h.id"
            class="flex items-center justify-between gap-3 px-4 py-2"
            :class="{ 'text-muted-foreground': isPast(h) }"
          >
            <span class="flex items-center gap-2"
              ><CalendarOff class="size-4" aria-hidden="true" />{{ period(h) }}</span
            >
            <Button type="button" variant="ghost" size="icon" @click="removeHoliday(h)">
              <X aria-hidden="true" /><span class="sr-only">{{ period(h) }} entfernen</span>
            </Button>
          </li>
        </ul>
        <CardContent v-else class="py-4 text-muted-foreground">Keine Schließtage eingetragen.</CardContent>
      </Card>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addHoliday">
        <div class="grid gap-2">
          <Label for="von">Geschlossen ab</Label>
          <Input id="von" v-model="newStart" type="date" required :min="today" />
        </div>
        <div class="grid gap-2">
          <Label for="bis">Bis (leer: nur dieser Tag)</Label>
          <Input id="bis" v-model="newEnd" type="date" :min="newStart" />
        </div>
        <Button type="submit"><Plus aria-hidden="true" />Eintragen</Button>
        <SaveStatus class="basis-full" :state="saves.state('holiday')" />
      </form>
    </section>
  </div>
</template>
