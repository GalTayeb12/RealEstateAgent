/**
 * Concept C cinematic theme (`.cin`) is applied to every route except LIGHT_PREFIX (the internal
 * design-system reference page, which keeps the original "quiet perspective" look).
 * The cinematic theme has two palettes: dark (default) and light, chosen with the nav toggle
 * (cookie `hv-theme`, mirrored to <html data-theme>). See components/theme/cinematic-light.css.
 */
export type Theme = "dark" | "light";
export const THEME_COOKIE = "hv-theme";
export const DEFAULT_THEME: Theme = "dark";
export const parseTheme = (value: string | null | undefined): Theme =>
  value === "light" ? "light" : DEFAULT_THEME;

const LIGHT_PREFIX: string[] = ["/design-system"];
export const isCinematicPath = (pathname: string | null) =>
  !LIGHT_PREFIX.some((p) => pathname === p || (pathname ?? "").startsWith(p + "/"));
