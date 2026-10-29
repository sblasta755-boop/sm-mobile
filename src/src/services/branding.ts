import { useEffect, useMemo } from "react";
import { setBrandTheme } from "@/theme/themeStore";
import { useSmartClean } from "@/features/store";
import { fileUrl } from "@/api/client";
import { resolveBrandTheme, type BrandTheme } from "@/theme/brandTheme";
import type { TenantBranding } from "@/types/smartclean";

// The app's own identity - every screen falls back to this whenever
// neither a site nor the tenant has set their own branding yet, rather
// than rendering a blank name/logo/color. See useTenantBranding.
export const DEFAULT_BRAND_NAME = "Šoma360";
export const DEFAULT_BRAND_MARK = "S3";
export const DEFAULT_BRAND_COLOR = "#2563eb";

export interface ResolvedBranding {
  name: string;
  mark: string;
  logoUrl: string | null;
  primaryColor: string;
  /** Only the palette slots the org/site actually set. */
  theme: BrandTheme;
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_BRAND_MARK;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Resolves branding fields into ready-to-render values, falling back to
 * the app defaults field-by-field - a tenant/site that only set a logo
 * still gets the default name/color, not blanks. */
export function resolveBranding(branding: TenantBranding | undefined): ResolvedBranding {
  const name = branding?.displayName?.trim() || DEFAULT_BRAND_NAME;
  return {
    name,
    mark: branding?.displayName?.trim() ? initialsFor(name) : DEFAULT_BRAND_MARK,
    logoUrl: branding?.logoUrl ? (fileUrl(branding.logoUrl) ?? branding.logoUrl) : null,
    primaryColor: branding?.theme?.primary || branding?.primaryColor || DEFAULT_BRAND_COLOR,
    theme: resolveBrandTheme(branding?.theme, branding?.primaryColor),
  };
}

export function mergeBranding(
  site: TenantBranding | undefined,
  tenant: TenantBranding | undefined,
): TenantBranding {
  return {
    displayName: site?.displayName ?? tenant?.displayName,
    logoUrl: site?.logoUrl ?? tenant?.logoUrl,
    primaryColor: site?.primaryColor ?? tenant?.primaryColor,
    // Slot by slot - a site that only set one colour inherits the rest. A
    // site's legacy primaryColor still beats the tenant's theme.primary.
    theme: {
      ...tenant?.theme,
      ...(site?.primaryColor ? { primary: site.primaryColor } : {}),
      ...site?.theme,
    },
  };
}

/** Branding for the signed-in user's own site (per-site branding wins),
 * falling back to the tenant-wide default, falling back to the app
 * default. Every mobile user is a cleaner or supervisor working at one
 * site, so unlike the web app's useTenantBranding this doesn't need to
 * special-case operations_manager/org_admin (mobile has no setup
 * screens for them to use anyway - branding is read-only here). */
export function useTenantBranding(): ResolvedBranding {
  const { state, currentUser } = useSmartClean();
  return useMemo(() => {
    const ownSite = currentUser
      ? state.sites.find((site) => currentUser.siteIds.includes(site.id))
      : undefined;
    return resolveBranding(mergeBranding(ownSite?.branding, state.tenant?.branding));
  }, [state.sites, state.tenant, currentUser]);
}

/** Pushes the signed-in user's resolved palette into the theme store, and
 * clears it on sign-out so the login screen stays on the default look.
 * Mounted once inside SmartCleanProvider. */
export function useApplyBrandTheme(): void {
  const { currentUser } = useSmartClean();
  const branding = useTenantBranding();
  const theme = currentUser ? branding.theme : null;
  const signature = JSON.stringify(theme ?? {});
  useEffect(() => {
    setBrandTheme(theme ?? {});
    // `signature` stands in for `theme` (a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
