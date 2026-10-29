// Organisation fonts. The eight supported families are bundled with the app
// (so they work offline) and only the ones an organisation actually picked
// are loaded into memory. React Native has no global "font" setting and a
// custom font is a separate file per weight, so Text/TextInput are wrapped:
// the wrapper keeps the app's own styling and only swaps in the matching
// family for the text's size (heading vs body) and weight (regular vs bold).
// Text that already names a fontFamily (e.g. monospace) is left alone.

import { createElement, useSyncExternalStore } from "react";
import * as Font from "expo-font";
import * as ReactNative from "react-native";
import { StyleSheet, type TextInputProps, type TextProps } from "react-native";
import type { ThemeFonts } from "./brandTheme";

type FontFiles = { regular: number; bold: number };

const REGISTRY: Record<string, FontFiles> = {
  inter: {
    regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  },
  poppins: {
    regular: require("@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf"),
    bold: require("@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf"),
  },
  roboto: {
    regular: require("@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf"),
    bold: require("@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf"),
  },
  open_sans: {
    regular: require("@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf"),
    bold: require("@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf"),
  },
  montserrat: {
    regular: require("@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf"),
    bold: require("@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf"),
  },
  playfair_display: {
    regular: require("@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf"),
    bold: require("@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf"),
  },
  lora: {
    regular: require("@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf"),
    bold: require("@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf"),
  },
  merriweather: {
    regular: require("@expo-google-fonts/merriweather/400Regular/Merriweather_400Regular.ttf"),
    bold: require("@expo-google-fonts/merriweather/700Bold/Merriweather_700Bold.ttf"),
  },
};

const familyName = (id: string, bold: boolean) =>
  `brand_${id}_${bold ? "bold" : "regular"}`;

let active: ThemeFonts = {};
const loaded = new Set<string>();
const loading = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getVersion = () => version;

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

/** Selects the organisation's fonts (or {} for the app default) and loads
 * any that aren't in memory yet. Text switches over as soon as a font is
 * ready; until then it keeps the system font. */
export function setBrandFonts(next: ThemeFonts, onLoaded?: () => void) {
  active = next;
  for (const id of [next.heading, next.body]) {
    if (!id || loaded.has(id) || loading.has(id) || !REGISTRY[id]) continue;
    loading.add(id);
    Font.loadAsync({
      [familyName(id, false)]: REGISTRY[id].regular,
      [familyName(id, true)]: REGISTRY[id].bold,
    })
      .then(() => {
        loaded.add(id);
        onLoaded?.();
      })
      .catch(() => {})
      .finally(() => loading.delete(id));
  }
  bump();
}

/** Family for a text style, or null to keep the system font. */
export function familyFor(style: TextProps["style"]): string | null {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return null;
  const weight = flat.fontWeight;
  const bold = weight === "bold" || Number(weight) >= 600;
  const size = flat.fontSize ?? 14;
  const isHeading = size >= 18 || (bold && size >= 16);
  const id = isHeading ? (active.heading ?? active.body) : active.body;
  return id && loaded.has(id) ? familyName(id, bold) : null;
}

function brandStyle(style: TextProps["style"]) {
  const family = familyFor(style);
  // fontWeight "normal": the bold weight is its own file, so asking the
  // platform to embolden it as well would double up.
  return family
    ? [style, { fontFamily: family, fontWeight: "normal" as const }]
    : style;
}

let installed = false;

/** Wraps react-native's Text and TextInput once. Safe to call repeatedly;
 * any failure leaves the stock components in place (system font). */
export function installBrandFonts() {
  if (installed) return;
  installed = true;
  try {
    const Text = ReactNative.Text;
    const TextInput = ReactNative.TextInput;

    const BrandText = (props: TextProps) => {
      useSyncExternalStore(subscribe, getVersion);
      return createElement(Text, { ...props, style: brandStyle(props.style) });
    };
    BrandText.displayName = "Text";

    const BrandTextInput = (props: TextInputProps) => {
      useSyncExternalStore(subscribe, getVersion);
      return createElement(TextInput, {
        ...props,
        style: brandStyle(props.style),
      });
    };
    BrandTextInput.displayName = "TextInput";

    // Named imports read these properties at render time, so redefining
    // them on the module object swaps the component app-wide.
    Object.defineProperty(ReactNative, "Text", {
      configurable: true,
      get: () => BrandText,
    });
    Object.defineProperty(ReactNative, "TextInput", {
      configurable: true,
      get: () => BrandTextInput,
    });
  } catch {
    // Keep the system font.
  }
}
