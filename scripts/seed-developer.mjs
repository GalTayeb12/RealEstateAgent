/**
 * Seeds developer accounts, projects, unit types, mock offers, and leverage groups.
 * Run:  node scripts/seed-developer.mjs
 *
 * Creates:
 *   dev@buildco.com  / devpass123  — approved developer (BuildCo Development Ltd)
 *   dev@urbanfix.com / devpass123  — pending developer  (UrbanFix Properties)
 *
 *   BuildCo projects:
 *     "Riverside Towers"  → 3-room (available) + 4-room (available)
 *     "Central Park Studios" → Studio (in_negotiation)
 *     "Westside Villas Phase 2" → Family Home (sold)
 *
 *   Mock offers + leverage groups referencing unit types
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../dev.db");
const db = new Database(DB_PATH);

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function upsertUser(email, passwordHash, role) {
  const existing = db.prepare("SELECT * FROM User WHERE email = ?").get(email);
  if (existing) return existing;
  const id = cuid();
  db.prepare(
    "INSERT INTO User (id, email, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(id, email, passwordHash, role, new Date().toISOString());
  return db.prepare("SELECT * FROM User WHERE id = ?").get(id);
}

function upsertDeveloperProfile(userId, companyName, crn, contactName, phone, crnStatus) {
  const existing = db.prepare("SELECT * FROM DeveloperProfile WHERE userId = ?").get(userId);
  if (existing) return existing;
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO DeveloperProfile
      (id, userId, companyName, crn, contactName, phone, crnStatus, qualityScore, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 82, ?, ?)
  `).run(id, userId, companyName, crn, contactName, phone, crnStatus, now, now);
  return db.prepare("SELECT * FROM DeveloperProfile WHERE id = ?").get(id);
}

function upsertProject(developerId, name, location, description) {
  const existing = db.prepare("SELECT * FROM Project WHERE name = ? AND developerId = ?").get(name, developerId);
  if (existing) return existing;
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Project (id, developerId, name, location, description, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, developerId, name, location, description, now, now);
  return db.prepare("SELECT * FROM Project WHERE id = ?").get(id);
}

function upsertUnitType(projectId, sellerId, unitLabel, price, quantityTotal, quantityAvailable, description, eil, ail, aomStatus, attributes) {
  const existing = db.prepare("SELECT * FROM UnitType WHERE unitLabel = ? AND projectId = ?").get(unitLabel, projectId);
  if (existing) return existing;
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO UnitType
      (id, projectId, sellerId, unitLabel, price, quantityTotal, quantityAvailable,
       description, eil, ail, attributes, active, aomStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, projectId, sellerId, unitLabel, price, quantityTotal, quantityAvailable,
         description, eil, ail, JSON.stringify(attributes), aomStatus, now, now);
  return db.prepare("SELECT * FROM UnitType WHERE id = ?").get(id);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

console.log("Seeding developer data at:", DB_PATH, "\n");

const buyer = db.prepare("SELECT * FROM User WHERE email = ?").get("buyer@demo.com");
if (!buyer) {
  console.warn("  WARNING: buyer@demo.com not found — offers will have no buyer. Run `node scripts/seed.mjs` first.");
}

// ── Developer accounts ────────────────────────────────────────────────────────

const buildcoHash = await bcrypt.hash("devpass123", 12);
const buildco = upsertUser("dev@buildco.com", buildcoHash, "developer");
console.log(`Developer (approved): ${buildco.email} (id: ${buildco.id})`);

upsertDeveloperProfile(
  buildco.id,
  "BuildCo Development Ltd",
  "12345678",
  "Rachel Okonkwo",
  "+44 7700 900123",
  "approved"
);

const urbanfixHash = await bcrypt.hash("devpass123", 12);
const urbanfix = upsertUser("dev@urbanfix.com", urbanfixHash, "developer");
console.log(`Developer (pending):  ${urbanfix.email} (id: ${urbanfix.id})`);

upsertDeveloperProfile(
  urbanfix.id,
  "UrbanFix Properties",
  "87654321",
  "James Tran",
  "+44 7700 900456",
  "pending"
);

// ── Projects + Unit Types under BuildCo ───────────────────────────────────────

// Project 1: Riverside Towers — multi-unit showcase
await sleep(2); // keep cuid timestamps distinct
const riverside = upsertProject(
  buildco.id,
  "Riverside Towers",
  "Riverside Quarter, London E1W",
  "Contemporary riverside development with concierge, rooftop terrace, and underground parking"
);
console.log(`\n  Project: "${riverside.name}"`);

await sleep(2);
const riverside3r = upsertUnitType(
  riverside.id, buildco.id,
  "3-room",
  450000, 12, 8,
  "Spacious 3-room apartment with river views and open-plan living",
  55, 80, "available",
  { bedrooms: 2, bathrooms: 2, sqft: 1050, parking: true, floor: "2–6" }
);
console.log(`    Unit type: "${riverside3r.unitLabel}" — £${riverside3r.price.toLocaleString()} (${riverside3r.quantityAvailable}/${riverside3r.quantityTotal} available, eil=${riverside3r.eil}, ail=${riverside3r.ail})`);

await sleep(2);
const riverside4r = upsertUnitType(
  riverside.id, buildco.id,
  "4-room",
  550000, 6, 4,
  "Corner 4-room apartment, dual aspect, larger kitchen-diner",
  65, 88, "available",
  { bedrooms: 3, bathrooms: 2, sqft: 1280, parking: true, floor: "4–8" }
);
console.log(`    Unit type: "${riverside4r.unitLabel}" — £${riverside4r.price.toLocaleString()} (${riverside4r.quantityAvailable}/${riverside4r.quantityTotal} available, eil=${riverside4r.eil}, ail=${riverside4r.ail})`);

// Project 2: Central Park Studios
await sleep(2);
const centralPark = upsertProject(
  buildco.id,
  "Central Park Studios",
  "Victoria Park, London E9",
  "Premium studio apartments opposite Victoria Park, city views, gym included"
);
console.log(`\n  Project: "${centralPark.name}"`);

await sleep(2);
const studioUnit = upsertUnitType(
  centralPark.id, buildco.id,
  "Studio",
  320000, 6, 2,
  "1BR studio opposite the park, city views, on-site gym",
  65, 90, "in_negotiation",
  { bedrooms: 1, bathrooms: 1, sqft: 620, parking: false, floor: "3–7" }
);
console.log(`    Unit type: "${studioUnit.unitLabel}" — £${studioUnit.price.toLocaleString()} (${studioUnit.quantityAvailable}/${studioUnit.quantityTotal} available, eil=${studioUnit.eil}, ail=${studioUnit.ail})`);

// Project 3: Westside Villas Phase 2
await sleep(2);
const westside = upsertProject(
  buildco.id,
  "Westside Villas Phase 2",
  "Westside Park, London W3",
  "Detached family homes with gardens and double garages"
);
console.log(`\n  Project: "${westside.name}"`);

await sleep(2);
const familyHome = upsertUnitType(
  westside.id, buildco.id,
  "Family Home",
  750000, 5, 0,
  "4BR/3BA detached family home with south-facing garden and double garage",
  45, 72, "sold",
  { bedrooms: 4, bathrooms: 3, sqft: 2400, parking: true, garden: true }
);
console.log(`    Unit type: "${familyHome.unitLabel}" — £${familyHome.price.toLocaleString()} (sold)`);

// ── Mock offers ───────────────────────────────────────────────────────────────

function offerExists(unitTypeId, buyerId) {
  return db.prepare("SELECT id FROM Offer WHERE unitTypeId = ? AND buyerId = ?").get(unitTypeId, buyerId ?? "none");
}

if (buyer && riverside3r && !offerExists(riverside3r.id, buyer.id)) {
  await sleep(2);
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Offer
      (id, buyerId, unitTypeId, developerId, offeredPrice, matchScore, terms, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, buyer.id, riverside3r.id, buildco.id,
    432000, null,
    "Cash purchase, 30-day settlement, no conditions",
    "pending",
    now, now
  );
  console.log(`\n  Offer: buyer → Riverside Towers / 3-room (pending, £432,000)`);
}

if (buyer && studioUnit && !offerExists(studioUnit.id, buyer.id)) {
  await sleep(2);
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Offer
      (id, buyerId, unitTypeId, developerId, offeredPrice, matchScore, terms, status, counterPrice, counterTerms, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, buyer.id, studioUnit.id, buildco.id,
    305000, null,
    "Subject to finance approval, 60-day settlement",
    "countered",
    312000,
    "Counter: 45-day settlement and 10% deposit on exchange required. Finance pre-approval must be provided within 7 days.",
    now, now
  );
  console.log(`  Offer: buyer → Central Park Studios / Studio (countered, £305,000 → £312,000)`);
}

if (buyer && familyHome && !offerExists(familyHome.id, buyer.id)) {
  await sleep(2);
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Offer
      (id, buyerId, unitTypeId, developerId, offeredPrice, matchScore, terms, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, buyer.id, familyHome.id, buildco.id,
    728000, null,
    "Standard contract, 45-day settlement",
    "accepted",
    now, now
  );
  console.log(`  Offer: buyer → Westside Villas / Family Home (accepted, £728,000)`);
}

// ── Mock leverage groups ──────────────────────────────────────────────────────

function groupExists(unitTypeId) {
  return db.prepare("SELECT id FROM LeverageGroup WHERE unitTypeId = ?").get(unitTypeId);
}

if (riverside3r && !groupExists(riverside3r.id)) {
  await sleep(2);
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO LeverageGroup
      (id, unitTypeId, developerId, memberCount, requestedDiscountPercent, requestedTerms, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, riverside3r.id, buildco.id,
    6, 7.0,
    "Group of 6 buyers requesting 7% bulk discount on the 3-room units. All buyers pre-approved. Simultaneous settlement preferred.",
    "pending",
    now, now
  );
  console.log(`\n  Leverage Group: Riverside Towers / 3-room (6 members, 7%, pending)`);
}

if (studioUnit && !groupExists(studioUnit.id)) {
  await sleep(2);
  const id = cuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO LeverageGroup
      (id, unitTypeId, developerId, memberCount, requestedDiscountPercent, requestedTerms, status, counterDiscountPercent, counterTerms, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, studioUnit.id, buildco.id,
    4, 5.0,
    "4 buyers, all cash purchases. Request 5% group discount and flexible move-in dates.",
    "countered",
    2.5,
    "Maximum 2.5% group discount applies. Standard settlement terms only. Move-in dates subject to handover schedule.",
    now, now
  );
  console.log(`  Leverage Group: Central Park Studios / Studio (4 members, countered at 2.5%)`);
}

console.log("\n" + "─".repeat(60));
console.log("Developer credentials:");
console.log("  Approved: dev@buildco.com  / devpass123");
console.log("  Pending:  dev@urbanfix.com / devpass123");
console.log("\nAdmin approval page: http://localhost:3000/dev/admin/approvals");
console.log("─".repeat(60));

db.close();
