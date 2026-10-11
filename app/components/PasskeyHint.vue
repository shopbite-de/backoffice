<script setup lang="ts">
import { Fingerprint, X } from "@lucide/vue";
import { platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import type { PasskeyList } from "#shared/types/backoffice";

/**
 * Suggests fingerprint / Face ID login once per device: only where the device has it,
 * passkeys are switched on and the person has none yet. "Später" is remembered per device.
 */
const KEY = "sb-passkey-hint-dismissed";
const show = ref(false);

onMounted(async () => {
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    // no storage: show the hint, it just comes back next time
  }
  if (!(await platformAuthenticatorIsAvailable())) return;
  try {
    const list = await $fetch<PasskeyList>("/api/passkeys");
    show.value = list.enabled && list.passkeys.length === 0;
  } catch {
    // not important enough for an error
  }
});

function dismiss() {
  show.value = false;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // private mode
  }
}
</script>

<template>
  <Card v-if="show" class="bg-accent text-accent-foreground ring-0">
    <CardContent class="flex flex-wrap items-center gap-3">
      <Fingerprint class="size-6 shrink-0" aria-hidden="true" />
      <p class="min-w-0 flex-1">Schneller anmelden: Fingerabdruck oder Face ID auf diesem Gerät einrichten.</p>
      <Button as-child><NuxtLink to="/zugang">Einrichten</NuxtLink></Button>
      <Button variant="ghost" size="icon" @click="dismiss">
        <X aria-hidden="true" /><span class="sr-only">Hinweis ausblenden</span>
      </Button>
    </CardContent>
  </Card>
</template>
