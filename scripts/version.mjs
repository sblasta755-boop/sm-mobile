import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

let version = "dev";

try {
  version = execSync("git describe --tags --always", {
    encoding: "utf8",
  }).trim();
} catch {
  console.warn("⚠ Git not available. Using fallback version.");
}

const output = `// Auto-generated file. Do not edit.

export const APP_VERSION = "${version}";
`;

// src/constants, not a top-level constants/ (this app's actual source
// lives under src/, matching tsconfig's own "@/*" -> "src/*" alias -
// see @/theme, @/features/store, etc. elsewhere in this codebase) -
// writing to a bare "constants/" directory that doesn't exist in this
// layout meant this script only ever failed with ENOENT, and had never
// actually been wired into any npm script that would have caught that
// (see package.json's generate-version, which didn't exist either
// until now).
mkdirSync("src/constants", { recursive: true });
writeFileSync("src/constants/version.ts", output);

console.log("✅ APP_VERSION:", version);