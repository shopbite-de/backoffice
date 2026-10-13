<script setup lang="ts">
import { Bike, Printer, ShoppingBag } from "@lucide/vue";
import type { OrderStatus, OrderSummary, ShopSettings } from "#shared/types/backoffice";

definePageMeta({ capability: "orders" });
useHead({ title: "Heute" });
const api = useBackofficeApi();
// feedback where it was tapped: "settings" for the ordering card, the order id for each order
const saves = useSaveState();

const { data: settings, refresh: refreshSettings } = await useAsyncData("settings", () =>
  api<ShopSettings>("/api/settings"),
);
const { data: orders, refresh: refreshOrders } = await useAsyncData("orders", () =>
  api<OrderSummary[]>("/api/orders/today"),
);

// new orders arrive without a reload; the kitchen tablet stays on this page
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(refreshOrders, 20_000)));
onBeforeUnmount(() => clearInterval(timer));

const savingSettings = ref(false);
async function saveSettings(change: Partial<ShopSettings>, message: string) {
  savingSettings.value = true;
  await saves.run("settings", () => api("/api/settings", { method: "PATCH", body: change }), message);
  await refreshSettings();
  savingSettings.value = false;
}

// kitchen tablet: keep the screen on while "Heute" is open (per device)
const { supported: canKeepAwake, enabled: keepAwake } = useScreenAwake();

const orderingOpen = computed(() => settings.value?.orderingOpen ?? true);
// the stored value stays selectable even if it is not one of the usual steps
const deliveryOptions = computed(() =>
  [...new Set([20, 30, 45, 60, 75, 90, 120, settings.value?.deliveryMinutes ?? 45])].sort((a, b) => a - b),
);

// "Jetzt drucken": the order printer polls every 10 s, so look again a few times after a request
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 10_000)));
onBeforeUnmount(() => clearInterval(clock));
const printing = ref(new Set<string>());

async function printNow(order: OrderSummary) {
  printing.value.add(order.id);
  // the print state next to the button ("Druck angefordert") is the confirmation, only errors show
  if (await saves.run(order.id, () => api(`/api/orders/${order.id}/print`, { method: "POST" }))) {
    saves.set(order.id, null);
    await refreshOrders();
    for (const delay of [6_000, 13_000, 25_000]) setTimeout(refreshOrders, delay);
  }
  printing.value.delete(order.id);
}

type PrintState = { label: string; warn: boolean } | null;
function printState(order: OrderSummary): PrintState {
  const requested = order.printRequestedAt ? Date.parse(order.printRequestedAt) : null;
  const printed = order.printedAt ? Date.parse(order.printedAt) : null;
  if (requested && (!printed || printed < requested)) {
    return now.value - requested > 60_000
      ? { label: "Drucker antwortet nicht", warn: true }
      : { label: "Druck angefordert", warn: false };
  }
  return printed ? { label: `Gedruckt um ${time(order.printedAt!)}`, warn: false } : null;
}

async function setStatus(order: OrderSummary, status: "fertig" | "storniert") {
  await saves.run(
    order.id,
    () => api(`/api/orders/${order.id}/status`, { method: "POST", body: { status } }),
    status === "fertig" ? "Als fertig gemeldet" : "Bestellung storniert",
  );
  await refreshOrders();
}

// cancelling cannot be undone and the guest is waiting: always ask first
const cancelling = ref<OrderSummary | null>(null);
const askCancel = ref(false);
function askToCancel(order: OrderSummary) {
  cancelling.value = order;
  askCancel.value = true;
}
async function confirmCancel() {
  if (cancelling.value) await setStatus(cancelling.value, "storniert");
}

const GROUPS: { status: OrderStatus; title: string; hint: string }[] = [
  { status: "neu", title: "Neu", hint: "Noch nicht gedruckt" },
  { status: "in_arbeit", title: "In Arbeit", hint: "Bon ist in der Küche" },
  { status: "fertig", title: "Fertig", hint: "" },
  { status: "storniert", title: "Storniert", hint: "" },
];
const grouped = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    orders: (orders.value ?? []).filter((o) => o.status === g.status),
  })).filter((g) => g.orders.length || g.status === "neu"),
);
const session = useAuthState();
const multiChannel = computed(() => session.value?.loggedIn && session.value.channels.length > 1);
const revenue = computed(() =>
  (orders.value ?? []).filter((o) => o.status !== "storniert").reduce((sum, o) => sum + o.total, 0),
);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-2xl font-semibold">Heute</h1>
      <p class="text-muted-foreground">
        {{ orders?.length === 1 ? "1 Bestellung" : `${orders?.length ?? 0} Bestellungen` }} · {{ euro(revenue) }}
      </p>
    </div>
    <div v-if="canKeepAwake" class="flex items-center gap-2">
      <Switch id="wach" v-model="keepAwake" />
      <Label for="wach" class="font-normal">Bildschirm anlassen, solange „Heute“ offen ist</Label>
    </div>

    <PasskeyHint />

    <section aria-labelledby="annahme">
      <Card :class="orderingOpen ? '' : 'bg-warning ring-warning-border'">
        <CardContent class="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div class="min-w-0 flex-1 basis-64">
            <h2 id="annahme" class="font-semibold">Online-Bestellungen annehmen</h2>
            <p class="text-sm" :class="orderingOpen ? 'text-muted-foreground' : 'text-warning-foreground'">
              {{
                orderingOpen
                  ? "Gäste können im Shop bestellen."
                  : "Pausiert: Der Shop zeigt die Karte, nimmt aber keine Bestellungen an."
              }}
            </p>
          </div>
          <Switch
            :model-value="orderingOpen"
            aria-labelledby="annahme"
            :disabled="savingSettings"
            @update:model-value="
              saveSettings({ orderingOpen: $event }, $event ? 'Bestellannahme ist offen.' : 'Bestellannahme pausiert.')
            "
          />
          <div class="flex items-center gap-2">
            <Label for="lieferzeit" class="whitespace-nowrap">Lieferzeit</Label>
            <NativeSelect
              id="lieferzeit"
              :model-value="settings?.deliveryMinutes ?? 45"
              :disabled="savingSettings"
              @update:model-value="saveSettings({ deliveryMinutes: Number($event) }, `Lieferzeit ${$event} Minuten.`)"
            >
              <option v-for="m in deliveryOptions" :key="m" :value="m">{{ m }} Min.</option>
            </NativeSelect>
          </div>
          <div v-if="saves.state('settings')" class="basis-full">
            <SaveStatus :state="saves.state('settings')" />
          </div>
        </CardContent>
      </Card>
    </section>

    <section v-for="group in grouped" :key="group.status" :aria-labelledby="`g-${group.status}`" class="space-y-3">
      <h2 :id="`g-${group.status}`" class="font-semibold">
        {{ group.title }} <span class="font-normal text-muted-foreground">({{ group.orders.length }})</span>
        <span v-if="group.hint" class="ml-1 text-sm font-normal text-muted-foreground">· {{ group.hint }}</span>
      </h2>
      <Card v-if="!group.orders.length">
        <CardContent class="text-muted-foreground">Keine neuen Bestellungen.</CardContent>
      </Card>
      <ul class="space-y-3">
        <li v-for="order in group.orders" :key="order.id">
          <Card>
            <CardContent class="space-y-3">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-semibold">
                  {{ time(order.createdAt) }} · #{{ order.number }} · {{ order.customer }}
                  <Badge v-if="multiChannel" variant="secondary" class="ml-1">{{ order.channel }}</Badge>
                </p>
                <p class="font-semibold tabular-nums">{{ euro(order.total) }}</p>
              </div>
              <p class="flex items-center gap-2 text-sm text-muted-foreground">
                <component :is="order.mode === 'abholung' ? ShoppingBag : Bike" class="size-4" aria-hidden="true" />
                {{ order.mode === "abholung" ? "Abholung" : `Lieferung: ${order.address ?? "keine Adresse"}` }}
              </p>
              <ul class="space-y-1">
                <li v-for="(line, i) in order.lines" :key="i">
                  {{ line.quantity }}× {{ line.label }}
                  <span v-if="line.extras.length" class="text-sm text-muted-foreground"
                    >(+ {{ line.extras.join(", ") }})</span
                  >
                </li>
              </ul>
              <p v-if="order.comment" class="rounded-lg bg-muted px-3 py-2 text-sm">{{ order.comment }}</p>
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <Button v-if="order.status === 'in_arbeit'" @click="setStatus(order, 'fertig')">
                  Fertig<span class="sr-only"> {{ order.number }}</span>
                </Button>
                <Button
                  v-if="order.status !== 'storniert'"
                  variant="outline"
                  :disabled="printing.has(order.id)"
                  @click="printNow(order)"
                >
                  <Printer aria-hidden="true" />Jetzt drucken<span class="sr-only"> {{ order.number }}</span>
                </Button>
                <span
                  v-if="printState(order)"
                  class="text-sm"
                  :class="printState(order)!.warn ? 'font-medium text-destructive' : 'text-muted-foreground'"
                  >{{ printState(order)!.label }}</span
                >
                <!-- kept apart from "Jetzt drucken" so a slip does not cancel -->
                <Button
                  v-if="order.status === 'neu' || order.status === 'in_arbeit'"
                  variant="destructive"
                  class="ml-auto"
                  @click="askToCancel(order)"
                >
                  Stornieren<span class="sr-only"> {{ order.number }}</span>
                </Button>
              </div>
              <SaveStatus :state="saves.state(order.id)" />
            </CardContent>
          </Card>
        </li>
      </ul>
    </section>

    <AlertDialog v-model:open="askCancel">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bestellung {{ cancelling?.number }} stornieren?</AlertDialogTitle>
          <AlertDialogDescription>
            {{ cancelling?.customer }} · {{ cancelling && euro(cancelling.total) }}. Das lässt sich nicht rückgängig
            machen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Nicht stornieren</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmCancel">Ja, stornieren</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
