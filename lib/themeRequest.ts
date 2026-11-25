import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, type Theme } from "./theme";

/** Theme for server components. Defaults to dark. */
export async function getRequestTheme(): Promise<Theme> {
  const jar = await cookies();
  return parseTheme(jar.get(THEME_COOKIE)?.value);
}
