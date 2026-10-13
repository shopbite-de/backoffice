export type SaveState = { kind: "saving" | "saved" | "error"; message: string };

/**
 * Save feedback per row or button (key), shown where the person tapped (`SaveStatus`).
 * "Gespeichert" fades after a few seconds, an error stays until the next try.
 */
export function useSaveState() {
  const states = reactive(new Map<string, SaveState>());
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  onBeforeUnmount(() => timers.forEach(clearTimeout));

  function set(key: string, state: SaveState | null) {
    clearTimeout(timers.get(key));
    if (!state) {
      states.delete(key);
      return;
    }
    states.set(key, state);
    if (state.kind === "saved")
      timers.set(
        key,
        setTimeout(() => states.delete(key), 4_000),
      );
  }

  /** Runs a save; false when it failed (the error is shown at the key). */
  async function run(key: string, save: () => Promise<unknown>, done = "Gespeichert"): Promise<boolean> {
    set(key, { kind: "saving", message: "Speichert…" });
    try {
      await save();
      set(key, { kind: "saved", message: done });
      return true;
    } catch (e) {
      set(key, { kind: "error", message: errorMessage(e) });
      return false;
    }
  }

  return { state: (key: string) => states.get(key) ?? null, set, run };
}
