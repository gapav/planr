import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, parseThemePreference, readThemePreference, resolveTheme, saveThemePreference, THEME_EVENT, THEME_KEY, themeScript } from "./theme";

type Listener = (event: { matches: boolean }) => void;

/** A controllable `prefers-color-scheme: dark`, since jsdom has no matchMedia. */
function mockSystem(dark: boolean) {
  const listeners: Listener[] = [];
  const query = { matches: dark, addEventListener: (_: string, listener: Listener) => listeners.push(listener), removeEventListener: () => {} };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return { set(next: boolean) { query.matches = next; listeners.forEach((listener) => listener({ matches: next })); } };
}

const theme = () => document.documentElement.dataset.theme;
// The inline script is a string built for a page with no bundler; running it
// here is the only way to know it does what `applyTheme` does.
const runScript = () => new Function(themeScript)();

/**
 * Node 25 ships a global `localStorage` of its own that is inert without
 * `--localstorage-file`, and it shadows jsdom's. The code under test reaches
 * storage both as `window.localStorage` and, in the inline script, bare.
 */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, String(value)); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  if (window.localStorage !== localStorage) Object.defineProperty(window, "localStorage", { value: localStorage, configurable: true });
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("theme preference", () => {
  it("treats anything but light or dark as following the system", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
  });

  it("resolves system from the device and lets an explicit choice win", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("stores explicit choices, forgets system, and announces the change", () => {
    mockSystem(false);
    const heard = vi.fn();
    window.addEventListener(THEME_EVENT, heard);
    saveThemePreference("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(theme()).toBe("dark");
    saveThemePreference("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(readThemePreference()).toBe("system");
    expect(theme()).toBe("light");
    expect(heard).toHaveBeenCalledTimes(2);
    window.removeEventListener(THEME_EVENT, heard);
  });

  it("applies light when the browser has no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    applyTheme("system");
    expect(theme()).toBe("light");
  });
});

describe("the inline head script", () => {
  it("follows the device when nothing is stored, and keeps following it", () => {
    const system = mockSystem(true);
    runScript();
    expect(theme()).toBe("dark");
    system.set(false);
    expect(theme()).toBe("light");
  });

  it("lets a stored choice beat the device, including when the device changes", () => {
    localStorage.setItem(THEME_KEY, "light");
    const system = mockSystem(true);
    runScript();
    expect(theme()).toBe("light");
    system.set(true);
    expect(theme()).toBe("light");
  });

  it("agrees with applyTheme for every stored value and device setting", () => {
    for (const stored of [null, "light", "dark", "junk"]) {
      for (const dark of [true, false]) {
        if (stored === null) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, stored);
        mockSystem(dark);
        runScript();
        const fromScript = theme();
        applyTheme();
        expect(fromScript, `${stored} / ${dark ? "dark" : "light"} device`).toBe(theme());
      }
    }
  });

  it("picks up a choice made in another tab", () => {
    mockSystem(false);
    runScript();
    localStorage.setItem(THEME_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
    expect(theme()).toBe("dark");
  });
});
