<script setup lang="ts">
import { BellRing, Bike, Clock, MapPin, Phone, Printer, ShoppingBag, Volume2 } from "@lucide/vue";
import type { OrderStatus, OrderSummary, ShopSettings } from "#shared/types/backoffice";

definePageMeta({ capability: "orders" });
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

const orderingOpen = computed(() => settings.value?.orderingOpen ?? true);
const deliveryMinutes = computed(() => settings.value?.deliveryMinutes ?? 45);
// the usual steps as big buttons; an unusual stored value stays selectable
const deliveryOptions = computed(() => [...new Set([20, 30, 45, 60, 90, deliveryMinutes.value])].sort((a, b) => a - b));

const newOrders = computed(() => (orders.value ?? []).filter((o) => o.status === "neu").length);
// chime, vibration and the count on the app icon when a new order comes in
const { soundOn, needsTap } = useNewOrderAlert(newOrders);
useHead({ title: () => (newOrders.value ? `(${newOrders.value}) Heute` : "Heute") });
// kitchen tablet: the screen stays on while "Heute" is open (per device, on by default on tablets)
const { supported: canKeepAwake, enabled: keepAwake } = useScreenAwake();

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
// the two active groups side by side on a wide tablet (kitchen board), the rest below
const active = computed(() => grouped.value.filter((g) => g.status === "neu" || g.status === "in_arbeit"));
const done = computed(() => grouped.value.filter((g) => g.status === "fertig" || g.status === "storniert"));

const session = useAuthState();
const multiChannel = computed(() => session.value?.loggedIn && session.value.channels.length > 1);
const revenue = computed(() =>
  (orders.value ?? []).filter((o) => o.status !== "storniert").reduce((sum, o) => sum + o.total, 0),
);
// the dialer wants digits only (and a leading +)
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
// opens the maps app on phones and tablets
const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-2xl font-semibold">Heute</h1>
      <p class="text-muted-foreground">
        {{ orders?.length === 1 ? "1 Bestellung" : `${orders?.length ?? 0} Bestellungen` }} · {{ euro(revenue) }}
      </p>
    </div>

    <PasskeyHint />

    <section aria-labelledby="annahme">
      <Card :class="orderingOpen ? 'border-success/40' : 'border-warning-border bg-warning text-warning-foreground'">
        <CardContent class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div class="min-w-0 flex-1 basis-56">
              <h2 id="annahme" class="text-xl font-semibold">
                {{ orderingOpen ? "Shop ist offen" : "Shop pausiert" }}
              </h2>
              <p class="pointer-coarse:text-base" :class="orderingOpen ? 'text-muted-foreground' : ''">
                {{
                  orderingOpen
                    ? "Gäste können online bestellen."
                    : "Gäste sehen die Karte, können aber nicht bestellen."
                }}
              </p>
            </div>
            <Button
              size="lg"
              class="w-full sm:w-auto"
              :variant="orderingOpen ? 'outline' : 'default'"
              :disabled="savingSettings"
              @click="
                saveSettings(
                  { orderingOpen: !orderingOpen },
                  orderingOpen ? 'Shop ist pausiert, Gäste können nicht bestellen.' : 'Shop ist wieder offen.',
                )
              "
            >
              {{ orderingOpen ? "Bestellungen pausieren" : "Shop wieder öffnen" }}
            </Button>
          </div>

          <div role="group" aria-labelledby="lieferzeit" class="space-y-2">
            <p id="lieferzeit" class="flex items-center gap-2 font-medium">
              <Clock class="size-4" aria-hidden="true" />Lieferzeit, die Gäste sehen
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="m in deliveryOptions"
                :key="m"
                size="lg"
                :variant="m === deliveryMinutes ? 'default' : 'outline'"
                :aria-pressed="m === deliveryMinutes"
                :disabled="savingSettings"
                class="min-w-20 tabular-nums"
                @click="m !== deliveryMinutes && saveSettings({ deliveryMinutes: m }, `Lieferzeit ${m} Minuten.`)"
              >
                {{ m }} Min.
              </Button>
            </div>
          </div>
          <SaveStatus :state="saves.state('settings')" />
        </CardContent>
      </Card>
    </section>

    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm pointer-coarse:text-base">
      <div class="flex items-center gap-2">
        <Switch id="ton" v-model="soundOn" />
        <Label for="ton" class="font-normal">Ton bei neuer Bestellung</Label>
      </div>
      <p v-if="soundOn && needsTap" role="status" class="flex items-center gap-1.5 text-muted-foreground">
        <Volume2 class="size-4" aria-hidden="true" />Einmal auf die Seite tippen, dann ist der Ton an.
      </p>
      <div v-if="canKeepAwake" class="flex items-center gap-2">
        <Switch id="wach" v-model="keepAwake" />
        <Label for="wach" class="font-normal">Bildschirm bleibt an</Label>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <section
        v-for="group in active"
        :key="group.status"
        :aria-labelledby="`g-${group.status}`"
        class="space-y-3"
        :class="{ 'lg:col-span-2': active.length === 1 }"
      >
        <h2 :id="`g-${group.status}`" class="flex items-center gap-2 text-lg font-semibold">
          <BellRing
            v-if="group.status === 'neu' && group.orders.length"
            class="size-5 text-primary"
            aria-hidden="true"
          />
          {{ group.title }} <span class="font-normal text-muted-foreground">({{ group.orders.length }})</span>
          <span v-if="group.hint" class="text-sm font-normal text-muted-foreground">· {{ group.hint }}</span>
        </h2>
        <Card v-if="!group.orders.length">
          <CardContent class="text-muted-foreground"
            >Keine neuen Bestellungen. Neue erscheinen hier von selbst.</CardContent
          >
        </Card>
        <ul class="space-y-3">
          <li v-for="order in group.orders" :key="order.id">
            <Card :class="{ 'border-primary/50': order.status === 'neu' }">
              <CardContent class="space-y-3">
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
                  <div class="min-w-0">
                    <p class="text-sm text-muted-foreground pointer-coarse:text-base">
                      {{ time(order.createdAt) }} · Nr. {{ order.number }}
                      <Badge v-if="multiChannel" variant="secondary" class="ml-1">{{ order.channel }}</Badge>
                    </p>
                    <p class="text-lg font-semibold">{{ order.customer }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-lg font-semibold tabular-nums">{{ euro(order.total) }}</p>
                    <p
                      v-if="order.payment"
                      class="text-sm pointer-coarse:text-base"
                      :class="order.payment.paid ? 'text-success' : ''"
                    >
                      {{
                        order.payment.paid ? `Bezahlt (${order.payment.method})` : `Kassieren: ${order.payment.method}`
                      }}
                    </p>
                  </div>
                </div>

                <p v-if="order.wishedTime" class="flex items-center gap-2 font-medium">
                  <Clock class="size-4 shrink-0" aria-hidden="true" />{{
                    order.mode === "abholung" ? "Abholung" : "Lieferung"
                  }}
                  um
                  {{ order.wishedTime }}
                </p>
                <p class="flex items-center gap-2 pointer-coarse:text-base">
                  <component
                    :is="order.mode === 'abholung' ? ShoppingBag : Bike"
                    class="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <template v-if="order.mode === 'abholung'">Abholung im Restaurant</template>
                  <a
                    v-else-if="order.address"
                    :href="mapsUrl(order.address)"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex min-h-8 items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-foreground pointer-coarse:min-h-11"
                    >{{ order.address }}<MapPin class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span
                      class="sr-only"
                    >
                      (Karte öffnen)</span
                    ></a
                  >
                  <span v-else>Lieferung, keine Adresse</span>
                </p>
                <p v-if="order.phone" class="flex items-center gap-2 pointer-coarse:text-base">
                  <Phone class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <a
                    :href="telHref(order.phone)"
                    class="inline-flex min-h-8 items-center underline decoration-border underline-offset-4 hover:decoration-foreground pointer-coarse:min-h-11"
                    >{{ order.phone }}<span class="sr-only"> anrufen</span></a
                  >
                </p>

                <ul class="space-y-1 pointer-coarse:text-base">
                  <li v-for="(line, i) in order.lines" :key="i">
                    <span class="font-medium tabular-nums">{{ line.quantity }}×</span> {{ line.label }}
                    <span v-if="line.extras.length" class="text-sm text-muted-foreground"
                      >(+ {{ line.extras.join(", ") }})</span
                    >
                  </li>
                </ul>
                <p v-if="order.comment" class="rounded-lg bg-muted px-3 py-2 pointer-coarse:text-base">
                  <span class="font-medium">Hinweis des Gasts:</span> {{ order.comment }}
                </p>

                <div class="flex flex-wrap items-center gap-2 pt-1">
                  <Button v-if="order.status === 'in_arbeit'" size="lg" @click="setStatus(order, 'fertig')">
                    Fertig<span class="sr-only"> {{ order.number }}</span>
                  </Button>
                  <Button variant="outline" size="lg" :disabled="printing.has(order.id)" @click="printNow(order)">
                    <Printer aria-hidden="true" />Jetzt drucken<span class="sr-only"> {{ order.number }}</span>
                  </Button>
                  <span
                    v-if="printState(order)"
                    class="text-sm pointer-coarse:text-base"
                    :class="printState(order)!.warn ? 'font-medium text-destructive' : 'text-muted-foreground'"
                    >{{ printState(order)!.label }}</span
                  >
                  <!-- kept apart from "Jetzt drucken" so a slip does not cancel -->
                  <Button variant="destructive" class="ml-auto" @click="askToCancel(order)">
                    Stornieren<span class="sr-only"> {{ order.number }}</span>
                  </Button>
                </div>
                <SaveStatus :state="saves.state(order.id)" />
              </CardContent>
            </Card>
          </li>
        </ul>
      </section>
    </div>

    <section v-for="group in done" :key="group.status" :aria-labelledby="`g-${group.status}`" class="space-y-3">
      <h2 :id="`g-${group.status}`" class="text-lg font-semibold">
        {{ group.title }} <span class="font-normal text-muted-foreground">({{ group.orders.length }})</span>
      </h2>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="order in group.orders" :key="order.id">
          <Card class="text-muted-foreground">
            <CardContent class="space-y-1">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-medium text-foreground">{{ order.customer }}</p>
                <p class="tabular-nums">{{ euro(order.total) }}</p>
              </div>
              <p class="text-sm">
                {{ time(order.createdAt) }} · Nr. {{ order.number }} · {{ order.lines.length }} Positionen
              </p>
              <div v-if="order.status !== 'storniert'" class="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" :disabled="printing.has(order.id)" @click="printNow(order)">
                  <Printer aria-hidden="true" />Nochmal drucken<span class="sr-only"> {{ order.number }}</span>
                </Button>
                <span v-if="printState(order)" class="text-sm">{{ printState(order)!.label }}</span>
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
