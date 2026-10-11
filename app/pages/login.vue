<script setup lang="ts">
import { Fingerprint } from "@lucide/vue";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";

useHead({ title: "Anmelden" });
const session = useAuthState();
const username = ref("");
const password = ref("");
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;
  pending.value = true;
  try {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { username: username.value, password: password.value },
    });
    session.value = await $fetch<AuthState>("/api/auth/session");
    await navigateTo("/");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    pending.value = false;
  }
}

// fingerprint / face login (passkey), only where the browser can do it
const canUsePasskey = ref(false);
onMounted(() => (canUsePasskey.value = browserSupportsWebAuthn()));

async function loginWithPasskey() {
  error.value = null;
  pending.value = true;
  try {
    const optionsJSON = await $fetch<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
      "/api/auth/passkey/options",
      {
        method: "POST",
      },
    );
    const credential = await startAuthentication({ optionsJSON });
    await $fetch("/api/auth/passkey/login", { method: "POST", body: { credential } });
    session.value = await $fetch<AuthState>("/api/auth/session");
    await navigateTo("/");
  } catch (e) {
    error.value = passkeyErrorMessage(e);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto mt-[10vh] max-w-sm">
    <img
      src="/brand/shopbite-logo.svg"
      alt="ShopBite"
      width="324"
      height="103"
      class="mx-auto mb-8 h-10 w-auto dark:hidden"
    />
    <img
      src="/brand/shopbite-logo-white.svg"
      alt="ShopBite"
      width="324"
      height="103"
      class="mx-auto mb-8 hidden h-10 w-auto dark:block"
    />
    <div class="fixed top-3 right-3"><ColorModeButton /></div>
    <Card>
      <CardHeader>
        <CardTitle><h1 class="text-2xl font-semibold">Anmelden</h1></CardTitle>
        <CardDescription>Backoffice für Ihr Restaurant, mit Ihrem persönlichen Zugang.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-5" @submit.prevent="submit">
          <ErrorAlert :message="error" />
          <div class="grid gap-2">
            <Label for="username">Benutzername</Label>
            <Input
              id="username"
              v-model="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="password">Passwort</Label>
            <Input id="password" v-model="password" type="password" autocomplete="current-password" required />
          </div>
          <Button type="submit" class="w-full" :disabled="pending">Anmelden</Button>
          <template v-if="canUsePasskey">
            <div class="flex items-center gap-3 text-sm text-muted-foreground">
              <Separator class="flex-1" /><span>oder</span><Separator class="flex-1" />
            </div>
            <Button type="button" variant="outline" class="w-full" :disabled="pending" @click="loginWithPasskey">
              <Fingerprint aria-hidden="true" />Mit Fingerabdruck oder Face ID
            </Button>
          </template>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
