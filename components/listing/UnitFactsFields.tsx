"use client";

/**
 * Structured apartment facts for the developer and seller listing forms,
 * replacing the free-text "Attributes (JSON)" box. The values are written to
 * UnitType.attributes under fixed keys, the same keys matching and the Excel
 * import use (`rooms` is the Israeli room count and is required).
 */
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { roomsOf } from "@/lib/attributes";

export interface UnitFacts {
  rooms: string;
  area: string;
  balcony: string;
  bathrooms: string;
}

export const blankUnitFacts: UnitFacts = { rooms: "", area: "", balcony: "", bathrooms: "" };

/** Validates the facts and turns them into attribute keys. */
export function factsToAttributes(f: UnitFacts):
  | { ok: true; attributes: Record<string, number> }
  | { ok: false; error: string } {
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const rooms = num(f.rooms);
  if (rooms === null || !Number.isFinite(rooms) || rooms <= 0 || rooms > 20 || (rooms * 2) % 1 !== 0) {
    return { ok: false, error: "rooms" };
  }
  const attributes: Record<string, number> = { rooms };
  for (const [key, v] of [["area", f.area], ["balconySqm", f.balcony], ["bathrooms", f.bathrooms]] as const) {
    const n = num(v);
    if (n === null) continue;
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: key };
    attributes[key] = n;
  }
  return { ok: true, attributes };
}

const STR = {
  he: {
    rooms: "מספר חדרים *",
    roomsHint: "כולל סלון, כמו בשלט: 4 חדרים = סלון + 3 חדרי שינה",
    area: "שטח (מ״ר)",
    balcony: "מרפסת (מ״ר)",
    bathrooms: "חדרי רחצה",
    errors: {
      rooms: "צריך למלא מספר חדרים (למשל 3, 4 או 4.5)",
      area: "השטח צריך להיות מספר",
      balconySqm: "שטח המרפסת צריך להיות מספר",
      bathrooms: "מספר חדרי הרחצה צריך להיות מספר",
    } as Record<string, string>,
  },
  en: {
    rooms: "Rooms *",
    roomsHint: "Israeli count, living room included: 4 rooms = living room + 3 bedrooms",
    area: "Area (sqm)",
    balcony: "Balcony (sqm)",
    bathrooms: "Bathrooms",
    errors: {
      rooms: "Enter the number of rooms (e.g. 3, 4 or 4.5)",
      area: "Area must be a number",
      balconySqm: "Balcony area must be a number",
      bathrooms: "Bathrooms must be a number",
    } as Record<string, string>,
  },
};

/** Human message for a factsToAttributes() error key. */
export function unitFactsError(error: string, locale: string): string {
  const t = STR[locale === "he" ? "he" : "en"];
  return t.errors[error] ?? error;
}

export default function UnitFactsFields({
  facts,
  setFacts,
  inputStyle,
  Field,
}: {
  facts: UnitFacts;
  setFacts: (next: UnitFacts) => void;
  inputStyle: CSSProperties;
  Field: ComponentType<{ label: string; children: ReactNode }>;
}) {
  const { locale } = useI18n();
  const t = STR[locale === "he" ? "he" : "en"];
  const set = (k: keyof UnitFacts) => (e: React.ChangeEvent<HTMLInputElement>) => setFacts({ ...facts, [k]: e.target.value });

  return (
    <>
      <Field label={t.rooms}>
        <input
          id="unit-rooms"
          type="number"
          inputMode="decimal"
          min={1}
          step={0.5}
          required
          style={inputStyle}
          value={facts.rooms}
          onChange={set("rooms")}
          placeholder="4"
          title={t.roomsHint}
        />
      </Field>
      <Field label={t.area}>
        <input id="unit-area" type="number" inputMode="decimal" min={0} style={inputStyle} value={facts.area} onChange={set("area")} placeholder="110" />
      </Field>
      <Field label={t.balcony}>
        <input id="unit-balcony" type="number" inputMode="decimal" min={0} style={inputStyle} value={facts.balcony} onChange={set("balcony")} placeholder="12" />
      </Field>
      <Field label={t.bathrooms}>
        <input id="unit-bathrooms" type="number" inputMode="decimal" min={0} step={0.5} style={inputStyle} value={facts.bathrooms} onChange={set("bathrooms")} placeholder="2" />
      </Field>
      <p style={{ gridColumn: "1 / -1", margin: "-0.25rem 0 0", fontSize: "0.8125rem", color: "#526563" }}>{t.roomsHint}</p>
    </>
  );
}

/**
 * Short facts line for a listing row ("4 חדרים · 107 מ״ר · מרפסת 12 מ״ר"),
 * read from the same keys the form writes (legacy sqft is shown in m²).
 */
export function unitFactsSummary(
  attrs: Record<string, unknown>,
  unitLabel: string,
  t: { factsRooms: string; factsArea: string; factsBalcony: string },
): string {
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);
  const parts: string[] = [];
  const rooms = roomsOf(attrs, unitLabel);
  if (rooms !== null) parts.push(t.factsRooms.replace("{n}", String(rooms)));
  const area = n(attrs.area) > 0 ? n(attrs.area) : n(attrs.sqft) > 0 ? Math.round(n(attrs.sqft) * 0.0929) : NaN;
  if (area > 0) parts.push(t.factsArea.replace("{n}", String(area)));
  if (n(attrs.balconySqm) > 0) parts.push(t.factsBalcony.replace("{n}", String(n(attrs.balconySqm))));
  return parts.join(" · ");
}
