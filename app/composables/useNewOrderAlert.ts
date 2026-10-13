/**
 * Makes a new order noticeable on the device that shows "Heute": a short chime and a vibration
 * when the number of new orders grows, the count in the tab title and on the app icon.
 * Sound is per device (localStorage) and needs one tap on the page before the browser allows
 * audio; until then `needsTap` is true and the page shows a hint.
 */
const KEY = "sb-order-sound";

export function useNewOrderAlert(newCount: Ref<number>) {
  const soundOn = ref(true);
  const needsTap = ref(false);
  let audio: AudioContext | null = null;
  let known: number | null = null;

  function chime() {
    if (!audio) return;
    // two rising notes, like a kitchen bell; nothing to download
    for (const [i, hz] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      const start = audio.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  }

  // browsers allow sound only after the person touched the page once
  function unlock() {
    if (!soundOn.value || audio) return;
    try {
      audio = new AudioContext();
      void audio.resume();
      needsTap.value = false;
    } catch {
      needsTap.value = false;
    }
  }

  function badge(count: number) {
    try {
      if (count > 0) void navigator.setAppBadge?.(count);
      else void navigator.clearAppBadge?.();
    } catch {
      // not installed as an app
    }
  }

  onMounted(() => {
    try {
      soundOn.value = localStorage.getItem(KEY) !== "0";
    } catch {
      soundOn.value = true;
    }
    needsTap.value = soundOn.value && "AudioContext" in window;
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
    void audio?.close();
    badge(0);
  });

  watch(soundOn, (on) => {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // private mode
    }
    if (on) {
      needsTap.value = !audio;
    } else {
      needsTap.value = false;
    }
  });

  watch(newCount, (count) => {
    badge(count);
    const grew = known !== null && count > known;
    known = count;
    if (!grew) return;
    if (soundOn.value) chime();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // no vibration motor
    }
  });

  return { soundOn, needsTap };
}
