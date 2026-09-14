/**
 * Israeli Companies Registry lookup via data.gov.il CKAN API.
 *
 * Source: https://data.gov.il/dataset/ica_companies (Ministry of Justice, updated daily)
 * This is an official open-data endpoint, not a scrape — no JS rendering needed.
 *
 * Design constraints (per spec):
 * - Must never block registration or approval on failure
 * - Reasonable timeout, no aggressive retry
 * - All failures return a clear "unavailable" result
 */

import { prisma } from "@/lib/prisma";

// The stable resource ID for the ICA companies dataset on data.gov.il
const RESOURCE_ID = "f004176c-b85f-4542-8901-7b3176f9a054";
const API_BASE = "https://data.gov.il/api/3/action/datastore_search";
const TIMEOUT_MS = 15_000;

// Hebrew field names in the dataset
const F_COMPANY_NUMBER = "מספר חברה";
const F_NAME_HE       = "שם חברה";
const F_NAME_EN       = "שם באנגלית";
const F_STATUS        = "סטטוס חברה";
const F_ENTITY_TYPE   = "סוג תאגיד";
const F_INCORPORATION = "תאריך התאגדות";

/** Active status in Hebrew — anything else is a flag */
const ACTIVE_STATUS_HE = "פעילה";

export interface RegistryLookupResult {
  found: boolean;
  registeredName: string | null;
  registeredNameEn: string | null;
  status: string | null;
  incorporationDate: string | null;
  entityType: string | null;
  /** true when the name the developer entered doesn't plausibly match the registry name */
  nameMismatch: boolean;
  /** true when the company exists but is not active (dissolved, struck off, etc.) */
  statusFlag: boolean;
  /** Human-readable flags for the admin */
  flags: string[];
}

const UNAVAILABLE: RegistryLookupResult = {
  found: false,
  registeredName: null,
  registeredNameEn: null,
  status: null,
  incorporationDate: null,
  entityType: null,
  nameMismatch: false,
  statusFlag: false,
  flags: ["Registry lookup unavailable"],
};

/**
 * Normalise a company name for loose comparison:
 * lowercase, strip legal suffixes ("ltd", "bv", "בעמ", "בע~מ", "בע\"מ"), collapse spaces.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bbv\b|\bltd\.?\b|\binc\.?\b|\bllc\.?\b/gi, "")
    .replace(/בעמ|בע~מ|בע"מ|בע\\מ/g, "")
    .replace(/[^a-z0-9\u05d0-\u05ea\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the two names plausibly refer to the same company.
 * Checks for substring match in both directions after normalization.
 */
function namesMatch(enteredName: string, registeredName: string): boolean {
  const a = normalizeName(enteredName);
  const b = normalizeName(registeredName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Look up a company by CRN (Israeli company number) in the data.gov.il registry.
 * Returns RegistryLookupResult — never throws.
 */
export async function lookupCompanyByCRN(
  crn: string,
  enteredCompanyName: string
): Promise<RegistryLookupResult> {
  const crnNum = Number(crn);
  if (!Number.isFinite(crnNum) || crnNum <= 0) {
    return {
      ...UNAVAILABLE,
      flags: [`CRN "${crn}" is not a valid numeric company number`],
    };
  }

  try {
    const url = new URL(API_BASE);
    url.searchParams.set("resource_id", RESOURCE_ID);
    url.searchParams.set("limit", "1");
    // Filter by exact company number
    url.searchParams.set("filters", JSON.stringify({ [F_COMPANY_NUMBER]: crnNum }));
    // Only fetch the fields we need
    url.searchParams.set(
      "fields",
      [F_COMPANY_NUMBER, F_NAME_HE, F_NAME_EN, F_STATUS, F_ENTITY_TYPE, F_INCORPORATION].join(",")
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "Haveniq/1.0 (developer-verification)" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn(`[registry] data.gov.il returned HTTP ${response.status}`);
      return UNAVAILABLE;
    }

    const json = await response.json() as {
      success: boolean;
      result: {
        total: number;
        records: Record<string, unknown>[];
      };
    };

    if (!json.success || !json.result) {
      console.warn("[registry] Unexpected API response shape");
      return UNAVAILABLE;
    }

    if (json.result.total === 0 || json.result.records.length === 0) {
      // CRN not found — definite flag
      return {
        found: false,
        registeredName: null,
        registeredNameEn: null,
        status: null,
        incorporationDate: null,
        entityType: null,
        nameMismatch: false,
        statusFlag: false,
        flags: [`CRN ${crn} not found in the companies registry`],
      };
    }

    const rec = json.result.records[0];
    const registeredName    = (rec[F_NAME_HE]       as string | null) ?? null;
    const registeredNameEn  = (rec[F_NAME_EN]       as string | null) || null;
    const status            = (rec[F_STATUS]         as string | null) ?? null;
    const incorporationDate = (rec[F_INCORPORATION] as string | null) ?? null;
    const entityType        = (rec[F_ENTITY_TYPE]   as string | null) ?? null;

    const flags: string[] = [];

    const statusFlag = !!status && status !== ACTIVE_STATUS_HE;
    if (statusFlag) {
      flags.push(`Company status is "${status}" (not active)`);
    }

    // Name mismatch: compare entered name against both Hebrew and English registered names
    const matchesHe = registeredName ? namesMatch(enteredCompanyName, registeredName) : false;
    const matchesEn = registeredNameEn ? namesMatch(enteredCompanyName, registeredNameEn) : false;
    const nameMismatch = !matchesHe && !matchesEn;
    if (nameMismatch) {
      const regDisplay = registeredNameEn || registeredName || "unknown";
      flags.push(
        `Company name entered ("${enteredCompanyName}") does not match registry ("${regDisplay}")`
      );
    }

    return {
      found: true,
      registeredName,
      registeredNameEn,
      status,
      incorporationDate,
      entityType,
      nameMismatch,
      statusFlag,
      flags,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[registry] Lookup failed:", msg);
    return UNAVAILABLE;
  }
}

/**
 * Look up company and store the result on DeveloperProfile.
 * Safe to call without await — all errors are caught internally.
 */
export async function performAndStoreRegistryLookup(
  developerUserId: string,
  crn: string,
  companyName: string
): Promise<void> {
  console.log(`[registry] Looking up CRN ${crn} for ${companyName}`);
  try {
    const result = await lookupCompanyByCRN(crn, companyName);
    await prisma.developerProfile.update({
      where: { userId: developerUserId },
      data: { registryLookupResult: JSON.stringify(result) },
    });
    console.log(`[registry] Stored result for ${companyName}: found=${result.found}, flags=${result.flags.length}`);
  } catch (err) {
    console.error("[registry] Failed to store registry lookup result:", err);
    try {
      await prisma.developerProfile.update({
        where: { userId: developerUserId },
        data: { registryLookupResult: JSON.stringify(UNAVAILABLE) },
      });
    } catch {
      // Nothing more we can do.
    }
  }
}
