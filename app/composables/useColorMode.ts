/**
 * Light, dark or the device setting. Stored per device (a convenience, so
 * localStorage is fine); the inline script in nuxt.config.ts applies it
 * before the first paint.
 */
export type ColorMode = "system" | "light" | "dark";

const KEY = "sb-color-mode";
const MODES: ColorMode[] = ["system", "light", "dark"];

function read(): ColorMode {
  try {
    const value = localStorage.getItem(KEY);
    return MODES.includes(value as ColorMode) ? (value as ColorMode) : "system";
  } catch {
    return "system";
  }
}

export function useColorMode() {
  const mode = useState<ColorMode>("color-mode", read);
  const media = import.meta.client ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function apply() {
    const dark = mode.value === "dark" || (mode.value === "system" && !!media?.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141414" : "#ffffff");
  }

  onMounted(() => {
    apply();
    media?.addEventListener("change", apply);
  });
  onBeforeUnmount(() => media?.removeEventListener("change", apply));
  watch(mode, (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // private mode: the choice lasts for this visit only
    }
    apply();
  });

  /** System → Hell → Dunkel → System */
  const next = () => (mode.value = MODES[(MODES.indexOf(mode.value) + 1) % MODES.length]!);
  const label = computed(() => ({ system: "wie Gerät", light: "Hell", dark: "Dunkel" })[mode.value]);
  return { mode, next, label };
}
