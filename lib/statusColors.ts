/**
 * lib/statusColors.ts — single source of truth for unit status colors.
 *
 * Hex values here MUST match the CSS tokens in components/quiet/quiet.css:
 *   --qp-status-available, --qp-status-reserved, --qp-status-sold, --qp-status-service
 *
 * Use CSS vars (`var(--qp-status-*)`) in HTML/React inline styles.
 * Use this file (hex strings) only where CSS vars cannot reach — e.g. Three.js
 * material `color` props, canvas `fillStyle`, or PDF generators.
 */

export const STATUS_COLORS = {
  available: "#4A9099", // muted teal
  reserved:  "#B38B4D", // brand gold  (= --qp-accent)
  sold:      "#8A8F98", // cool gray
  service:   "#9C9890", // warm gray (lobby / service floors)
} as const;

/** Returns the hex color for a unit status string (Three.js / canvas use). */
export function statusHex(status: string): string {
  if (status === "sold")     return STATUS_COLORS.sold;
  if (status === "reserved") return STATUS_COLORS.reserved;
  return STATUS_COLORS.available;
}

/** Returns the CSS-var string for a unit status (HTML inline-style use). */
export function statusVar(status: string): string {
  if (status === "sold")     return "var(--qp-status-sold)";
  if (status === "reserved") return "var(--qp-status-reserved)";
  return "var(--qp-status-available)";
}
