import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./locale";

/** Locale for server components and route handlers. Defaults to Hebrew. */
export async function getRequestLocale(): Promise<Locale> {
  const jar = await cookies();
  return parseLocale(jar.get(LOCALE_COOKIE)?.value);
}
