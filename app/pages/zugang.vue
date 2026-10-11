<script setup lang="ts">
import { Fingerprint, Smartphone, Trash2 } from "@lucide/vue";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PasskeyList } from "#shared/types/backoffice";

useHead({ title: "Mein Zugang" });
const api = useBackofficeApi();
const session = useAuthState();
const auth = computed(() => (session.value?.loggedIn ? session.value : null));
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const pending = ref(false);

const { data, refresh } = await useAsyncData("passkeys", () => api<PasskeyList>("/api/passkeys"));

const supported = ref(true);
const deviceName = ref("");
onMounted(() => {
  supported.value = browserSupportsWebAuthn();
  deviceName.value = guessDeviceName(navigator.userAgent);
});

async function setUp() {
  error.value = null;
  saved.value = null;
  pending.value = true;
  try {
    const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/passkeys/options", {
      method: "POST",
    });
    const credential = await startRegistration({ optionsJSON });
    await api("/api/passkeys", { method: "POST", body: { name: deviceName.value, credential } });
    saved.value = `${deviceName.value} ist eingerichtet. Ab jetzt können Sie sich dort mit Fingerabdruck oder Face ID anmelden.`;
    await refresh();
  } catch (e) {
    error.value = passkeyErrorMessage(e);
  } finally {
    pending.value = false;
  }
}

async function remove(id: string, name: string) {
  if (!confirm(`${name} entfernen? Danach geht die Anmeldung dort nur noch mit Passwort.`)) return;
  error.value = null;
  try {
    await api(`/api/passkeys/${id}`, { method: "DELETE" });
    saved.value = `${name} entfernt.`;
    await refresh();
  } catch (e) {
    error.value = errorMessage(e);
  }
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
      <p v-if="auth" class="text-muted-foreground">{{ auth.name }} · Benutzername {{ auth.username }}</p>
    </div>

    <ErrorAlert :message="error" />
    <Alert v-if="saved" role="status"
      ><AlertDescription>{{ saved }}</AlertDescription></Alert
    >

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
      <form v-else class="flex flex-wrap items-end gap-2" @submit.prevent="setUp">
        <div class="grid min-w-48 flex-1 gap-2">
          <Label for="geraet">Name des Geräts</Label>
          <Input id="geraet" v-model="deviceName" required maxlength="100" />
        </div>
        <Button type="submit" :disabled="pending"><Fingerprint aria-hidden="true" />Dieses Gerät einrichten</Button>
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
          <Button variant="ghost" size="icon" @click="remove(passkey.id, passkey.name)">
            <Trash2 aria-hidden="true" /><span class="sr-only">{{ passkey.name }} entfernen</span>
          </Button>
        </li>
      </ul>
      <p v-else-if="data?.enabled" class="text-sm text-muted-foreground">Noch kein Gerät eingerichtet.</p>
    </FormSection>
  </div>
</template>
