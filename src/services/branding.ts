import { useMemo } from "react";
import { useSmartClean } from "@/features/store";
import { fileUrl } from "@/api/client";

// The app's own identity — every screen falls back to this whenever a
// tenant hasn't set their own branding yet, rather than rendering a
// blank name/logo/color. See useTenantBranding.
export const DEFAULT_BRAND_NAME = "Šoma360";
export const DEFAULT_BRAND_MARK = "S3";
export const DEFAULT_BRAND_COLOR = "#2563eb";

export interface ResolvedBranding {
  name: string;
  mark: string;
  logoUrl: string | null;
  primaryColor: string;
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_BRAND_MARK;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Resolves a tenant's branding fields into ready-to-render values,
 * falling back to the app defaults field-by-field — a tenant that only
 * set a logo still gets the default name/color, not blanks. */
export function resolveBranding(
  branding: { displayName?: string; logoUrl?: string; primaryColor?: string } | undefined,
): ResolvedBranding {
  const name = branding?.displayName?.trim() || DEFAULT_BRAND_NAME;
  return {
    name,
    mark: branding?.displayName?.trim() ? initialsFor(name) : DEFAULT_BRAND_MARK,
    logoUrl: branding?.logoUrl ? (fileUrl(branding.logoUrl) ?? branding.logoUrl) : null,
    primaryColor: branding?.primaryColor || DEFAULT_BRAND_COLOR,
  };
}

export function useTenantBranding(): ResolvedBranding {
  const { state } = useSmartClean();
  return useMemo(() => resolveBranding(state.tenant?.branding), [state.tenant]);
}
