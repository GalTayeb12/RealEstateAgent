/**
 * Concept C cinematic (dark) theme is the site default. Only routes listed here keep the original
 * light "quiet perspective" theme (the internal design-system reference page).
 */
const LIGHT_PREFIX: string[] = ["/design-system"];
export const isCinematicPath = (pathname: string | null) =>
  !LIGHT_PREFIX.some((p) => pathname === p || (pathname ?? "").startsWith(p + "/"));
