/**
 * Keeps the screen on while "Heute" is open (kitchen tablet): on by default on tablets, switchable.
 * Remembered per device; the browser releases the lock when the tab is hidden, so it is taken
 * again when the page becomes visible.
 */
const KEY = "sb-screen-awake";

export function useScreenAwake() {
  const supported = ref(false);
  const enabled = ref(false);
  let lock: WakeLockSentinel | null = null;

  async function acquire() {
    if (!enabled.value || document.visibilityState !== "visible" || lock) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } catch {
      // low battery or not allowed: the screen just turns off as usual
    }
  }

  function release() {
    void lock?.release();
    lock = null;
  }

  onMounted(() => {
    supported.value = "wakeLock" in navigator;
    // a tablet on the counter is the usual kitchen screen: on by default there, off on phones
    const tablet = matchMedia("(pointer: coarse) and (min-width: 768px)").matches;
    try {
      const stored = localStorage.getItem(KEY);
      enabled.value = supported.value && (stored === null ? tablet : stored === "1");
    } catch {
      enabled.value = supported.value && tablet;
    }
    document.addEventListener("visibilitychange", acquire);
    void acquire();
  });
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", acquire);
    release();
  });
  watch(enabled, (on) => {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // private mode
    }
    if (on) void acquire();
    else release();
  });

  return { supported, enabled };
}
