<script setup lang="ts">
import { Bike, ShoppingBag } from "@lucide/vue";
import type { OrderStatus, OrderSummary, ShopSettings } from "#shared/types/backoffice";

definePageMeta({ capability: "orders" });
useHead({ title: "Heute" });
const api = useBackofficeApi();
const error = ref<string | null>(null);
const saved = ref<string | null>(null);

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
  error.value = null;
  saved.value = null;
  savingSettings.value = true;
  try {
    await api("/api/settings", { method: "PATCH", body: change });
    saved.value = message;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    await refreshSettings();
    savingSettings.value = false;
  }
}

const orderingOpen = computed(() => settings.value?.orderingOpen ?? true);
// the stored value stays selectable even if it is not one of the usual steps
const deliveryOptions = computed(() =>
  [...new Set([20, 30, 45, 60, 75, 90, 120, settings.value?.deliveryMinutes ?? 45])].sort((a, b) => a - b),
);

async function setStatus(order: OrderSummary, status: "fertig" | "storniert") {
  error.value = null;
  try {
    await api(`/api/orders/${order.id}/status`, { method: "POST", body: { status } });
    saved.value = `Bestellung ${order.number} ${status === "fertig" ? "ist fertig" : "storniert"}.`;
  } catch (e) {
    error.value = errorMessage(e);
  }
  await refreshOrders();
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
      <p class="text-muted-foreground">{{ orders?.length === 1 ? "1 Bestellung" : `${orders?.length ?? 0} Bestellungen` }} · {{ euro(revenue) }}</p>
    </div>

    <ErrorAlert :message="error" />
    <p role="status" class="sr-only">{{ saved }}</p>

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
            @update:model-value="saveSettings({ orderingOpen: $event }, $event ? 'Bestellannahme ist offen.' : 'Bestellannahme pausiert.')"
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
                  <span v-if="line.extras.length" class="text-sm text-muted-foreground">(+ {{ line.extras.join(", ") }})</span>
                </li>
              </ul>
              <p v-if="order.comment" class="rounded-lg bg-muted px-3 py-2 text-sm">{{ order.comment }}</p>
              <div v-if="order.status === 'neu' || order.status === 'in_arbeit'" class="flex flex-wrap gap-2 pt-1">
                <Button v-if="order.status === 'in_arbeit'" @click="setStatus(order, 'fertig')">
                  Fertig<span class="sr-only"> {{ order.number }}</span>
                </Button>
                <Button variant="destructive" @click="setStatus(order, 'storniert')">
                  Stornieren<span class="sr-only"> {{ order.number }}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      </ul>
    </section>
  </div>
</template>
