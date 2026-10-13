<script setup lang="ts">
import { Fingerprint, Smartphone, Trash2 } from "@lucide/vue";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PasskeyList } from "#shared/types/backoffice";

useHead({ title: "Mein Zugang" });
const api = useBackofficeApi();
const session = useAuthState();
const auth = computed(() => (session.value?.loggedIn ? session.value : null));
const saves = useSaveState();
const pending = ref(false);
const removing = ref<{ id: string; name: string } | null>(null);
const askRemove = ref(false);

const { data, refresh } = await useAsyncData("passkeys", () => api<PasskeyList>("/api/passkeys"));

const supported = ref(true);
const deviceName = ref("");
// iPhone/iPad have no install prompt; Safari adds the app via the share menu
const isIos = ref(false);
const installed = ref(false);
onMounted(() => {
  supported.value = browserSupportsWebAuthn();
  deviceName.value = guessDeviceName(navigator.userAgent);
  isIos.value = /iPhone|iPad|iPod/.test(navigator.userAgent);
  installed.value = window.matchMedia("(display-mode: standalone)").matches;
});

// the device is named from the browser (iPhone, Android, Windows): nobody has to type a name
async function setUp() {
  pending.value = true;
  saves.set("geraet", { kind: "saving", message: "Bitte am Gerät bestätigen…" });
  try {
    const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/passkeys/options", {
      method: "POST",
    });
    const credential = await startRegistration({ optionsJSON });
    await api("/api/passkeys", { method: "POST", body: { name: deviceName.value, credential } });
    saves.set("geraet", {
      kind: "saved",
      message: `${deviceName.value} ist eingerichtet. Ab jetzt geht die Anmeldung hier mit Fingerabdruck oder Face ID.`,
    });
    await refresh();
  } catch (e) {
    // null: the person cancelled at the device, nothing to report
    const message = passkeyErrorMessage(e);
    saves.set("geraet", message ? { kind: "error", message } : null);
  } finally {
    pending.value = false;
  }
}

function askToRemove(id: string, name: string) {
  removing.value = { id, name };
  askRemove.value = true;
}
async function confirmRemove() {
  const target = removing.value;
  if (!target) return;
  await saves.run("geraet", () => api(`/api/passkeys/${target.id}`, { method: "DELETE" }), `${target.name} entfernt`);
  await refresh();
}

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value + "Z"))
    : "noch nie";
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Mein Zugang</h1>
      <p v-if="auth" class="text-muted-foreground">{{ auth.name }} · Anmeldename {{ auth.username }}</p>
    </div>

    <FormSection
      title="Anmelden mit Fingerabdruck oder Face ID"
      hint="Auf jedem Gerät einmal einrichten, danach ohne Passwort anmelden. Ihr Fingerabdruck verlässt das Gerät nie."
    >
      <p v-if="data && !data.enabled" class="text-muted-foreground">
        Für dieses Restaurant noch nicht eingeschaltet. Bitte bei ShopBite melden.
      </p>
      <p v-else-if="!supported" class="text-muted-foreground">
        Dieser Browser kann das nicht. Auf dem Handy oder Tablet geht es mit Safari oder Chrome.
      </p>
      <form v-else class="flex flex-wrap items-center gap-3" @submit.prevent="setUp">
        <Button type="submit" size="lg" class="w-full sm:w-auto" :disabled="pending">
          <Fingerprint aria-hidden="true" />Dieses Gerät einrichten
        </Button>
        <p class="text-sm text-muted-foreground">Wird gespeichert als „{{ deviceName }}“.</p>
        <SaveStatus class="basis-full" :state="saves.state('geraet')" />
      </form>

      <ul v-if="data?.passkeys.length" class="divide-y rounded-lg border">
        <li v-for="passkey in data.passkeys" :key="passkey.id" class="flex flex-wrap items-center gap-3 px-3 py-2">
          <Smartphone class="size-4 text-muted-foreground" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ passkey.name }}</p>
            <p class="text-xs text-muted-foreground">
              Eingerichtet {{ date(passkey.createdAt) }} · zuletzt benutzt {{ date(passkey.lastUsedAt) }}
            </p>
          </div>
          <Button variant="ghost" size="icon" @click="askToRemove(passkey.id, passkey.name)">
            <Trash2 aria-hidden="true" /><span class="sr-only">{{ passkey.name }} entfernen</span>
          </Button>
        </li>
      </ul>
      <p v-else-if="data?.enabled" class="text-sm text-muted-foreground">
        Noch kein Gerät eingerichtet. Tippen Sie oben auf „Dieses Gerät einrichten“ und bestätigen Sie mit Fingerabdruck
        oder Gesicht.
      </p>
    </FormSection>

    <AlertDialog v-model:open="askRemove">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ removing?.name }} entfernen?</AlertDialogTitle>
          <AlertDialogDescription>Danach geht die Anmeldung dort nur noch mit Passwort.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Behalten</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmRemove">Entfernen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <FormSection
      title="Als App auf dem Gerät"
      hint="Mit eigenem Symbol auf dem Startbildschirm und ohne Browserleiste, gut für Handy und Küchentablet."
    >
      <p v-if="installed" class="text-muted-foreground">Läuft schon als App.</p>
      <template v-else-if="isIos">
        <p>So geht es auf iPhone und iPad (in Safari):</p>
        <ol class="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).</li>
          <li>„Zum Home-Bildschirm“ wählen und „Hinzufügen“ tippen.</li>
        </ol>
      </template>
      <div v-else class="flex flex-wrap items-center gap-3">
        <InstallAppButton />
        <p class="text-sm text-muted-foreground">
          Kein Knopf zu sehen? Im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.
        </p>
      </div>
    </FormSection>
  </div>
</template>
