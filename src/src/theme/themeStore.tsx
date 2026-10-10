import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { colors, darkPalette, lightPalette } from "./colors";
import { DARK_TONE_BORDERS, LIGHT_TONE_BORDERS, refreshStatus } from "./status";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "soma.theme";

// Plain preference, not a secret - SecureStore is used only because it has a
// synchronous read, so the saved theme is applied before the first screen
// renders instead of flashing light first.
function readPreference(): ThemePreference {
  try {
    const value = SecureStore.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return Appearance.getColorScheme() === "dark" ? "dark" : "light";
  return preference;
}

let version = 0;
let current: ResolvedTheme = "light";
const listeners = new Set<() => void>();

function apply(theme: ResolvedTheme) {
  Object.assign(colors, theme === "dark" ? darkPalette : lightPalette);
  refreshStatus(theme === "dark" ? DARK_TONE_BORDERS : LIGHT_TONE_BORDERS);
  current = theme;
  version += 1;
  listeners.forEach((l) => l());
}

let preferenceNow = readPreference();
apply(resolve(preferenceNow));

/**
 * `StyleSheet.create` evaluated once at import would freeze the colours of
 * whichever theme was active then. This keeps the same `styles.card` call
 * sites but rebuilds the sheet when the theme changes: the factory is re-run
 * lazily, on the first property read after a change.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>>(
  factory: () => T,
): T {
  let builtFor = -1;
  let sheet = {} as T;
  const ensure = () => {
    if (builtFor !== version) {
      sheet = factory();
      builtFor = version;
    }
    return sheet;
  };
  return new Proxy({} as T, {
    get: (_, key) => (ensure() as Record<PropertyKey, unknown>)[key],
    has: (_, key) => key in ensure(),
    ownKeys: () => Reflect.ownKeys(ensure()),
    getOwnPropertyDescriptor: (_, key) => {
      const value = (ensure() as Record<PropertyKey, unknown>)[key];
      return value === undefined ? undefined : { enumerable: true, configurable: true, value };
    },
  });
}

type ThemeContextValue = {
  preference: ThemePreference;
  theme: ResolvedTheme;
  version: number;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(preferenceNow);
  const [tick, setTick] = useState(version);

  useEffect(() => {
    const onChange = () => setTick(version);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // "System" follows the phone's own switch while the app is open.
  useEffect(() => {
    if (preference !== "system") return;
    const sub = Appearance.addChangeListener(() => {
      const next = resolve("system");
      if (next !== current) apply(next);
    });
    return () => sub.remove();
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    preferenceNow = next;
    setPreferenceState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
    const resolved = resolve(next);
    if (resolved !== current) apply(resolved);
  }, []);

  const value = useMemo(
    () => ({ preference, theme: current, version: tick, setPreference }),
     
    [preference, tick, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Subscribes a component to theme changes (re-renders it) without needing the value. */
export function useThemeVersion(): number {
  return useContext(ThemeContext)?.version ?? 0;
}
