/** Routes that render in the Concept C cinematic (dark) theme. Grows with each phase. */
const CINEMATIC_EXACT = new Set([
  "/login", "/register", "/dev/login", "/dev/register", "/dev/pending", "/dev/rejected",
  "/seller/register", "/forgot-password", "/reset-password", "/verify-email",
]);
export const isCinematicPath = (pathname: string | null) => !!pathname && CINEMATIC_EXACT.has(pathname);
