/**
 * Israeli city names, Hebrew first. Listings and buyer interviews mix Hebrew,
 * English and short forms ("Sde Dov, North Tel Aviv", "תל-אביב-יפו", "ת״א"),
 * so the location filter compares canonical Hebrew city names instead of words.
 */

/** Canonical Hebrew name → spellings that refer to it (lower-case, after normalize()). */
const CITIES: Record<string, string[]> = {
  "תל אביב": ["תל אביב", "תל אביב יפו", "ת א", "תא", "יפו", "tel aviv", "tel aviv yafo", "tel aviv jaffa", "telaviv", "tlv", "jaffa", "yafo"],
  "ירושלים": ["ירושלים", "jerusalem", "yerushalayim"],
  "חיפה": ["חיפה", "haifa"],
  "רמת גן": ["רמת גן", "ramat gan"],
  "גבעתיים": ["גבעתיים", "givatayim", "givataim"],
  "בני ברק": ["בני ברק", "bnei brak", "bene beraq"],
  "הרצליה": ["הרצליה", "herzliya", "herzlia"],
  "רעננה": ["רעננה", "raanana", "ra anana"],
  "כפר סבא": ["כפר סבא", "kfar saba", "kfar sava"],
  "הוד השרון": ["הוד השרון", "hod hasharon"],
  "רמת השרון": ["רמת השרון", "ramat hasharon"],
  "פתח תקווה": ["פתח תקווה", "פתח תקוה", "פ ת", "petah tikva", "petach tikva", "petah tiqva"],
  "ראשון לציון": ["ראשון לציון", "ראשל צ", "ראשלצ", "rishon lezion", "rishon le zion", "rishon letsiyon"],
  "חולון": ["חולון", "holon"],
  "בת ים": ["בת ים", "bat yam"],
  "נתניה": ["נתניה", "netanya", "natanya"],
  "רחובות": ["רחובות", "rehovot", "rechovot"],
  "מודיעין": ["מודיעין", "מודיעין מכבים רעות", "modiin", "modi in"],
  "אשדוד": ["אשדוד", "ashdod"],
  "אשקלון": ["אשקלון", "ashkelon"],
  "באר שבע": ["באר שבע", "beer sheva", "be er sheva", "beersheba"],
};

/** Lower-case, drop quotes/gershayim/punctuation, collapse spaces. */
export function normalizeLocation(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'`׳״]/g, " ")
    .replace(/[-–—,./()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical Hebrew names of every known city mentioned in the text. */
export function citiesIn(text: string): Set<string> {
  const t = ` ${normalizeLocation(text)} `;
  const out = new Set<string>();
  for (const [city, names] of Object.entries(CITIES)) {
    if (names.some((n) => t.includes(` ${n} `))) out.add(city);
  }
  return out;
}

/**
 * Does the property location satisfy the buyer's location?
 * Known cities on both sides → they must share a city. Otherwise fall back
 * to word overlap (neighbourhoods, regions, unknown towns).
 */
export function locationMatches(buyer: string, property: string): boolean {
  const a = citiesIn(buyer);
  const b = citiesIn(property);
  if (a.size > 0 && b.size > 0) return [...a].some((c) => b.has(c));
  const bw = normalizeLocation(buyer).split(" ").filter((w) => w.length >= 3);
  const pw = normalizeLocation(property).split(" ").filter((w) => w.length >= 3);
  return bw.some((x) => pw.some((y) => y.includes(x) || x.includes(y)));
}
