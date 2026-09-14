/**
 * Seeds a realistic sample interview transcript for buyer@demo.com.
 * Run:  node scripts/seed-transcript.mjs
 *
 * The conversation is designed to produce approximately:
 *   ej ≈ 72  (solid suburban family home, no luxury needed)
 *   aj ≈ 62  (clear minimums: 3BR, parking, outdoor space)
 *
 * Against the seeded AOMs this should yield:
 *   Sunset Villa 4B       — valid   (zij ≈ 12)
 *   Suburban Family Home  — valid   (zij ≈ 8)
 *   Harbor View Penthouse — NOT FEASIBLE (eil=75 > ej≈72)
 */
import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../dev.db");
const db = new Database(DB_PATH);

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── Find buyer@demo.com ───────────────────────────────────────────────────────
const buyer = db.prepare("SELECT * FROM User WHERE email = ?").get("buyer@demo.com");
if (!buyer) {
  console.error("buyer@demo.com not found — run `node scripts/seed.mjs` first.");
  process.exit(1);
}

// ── Sample transcript ─────────────────────────────────────────────────────────
const lines = [
  {
    role: "agent",
    text: "Hello! I'm here to help you find your perfect property. Let's start with the basics — can you tell me a bit about yourself and what's bringing you to the market today?",
    ts: 1000,
  },
  {
    role: "user",
    text: "Hi! So my partner and I have been renting for about four years and we've decided it's time to buy. We want to put down roots, maybe start a family in the next couple of years, so we need something we can grow into.",
    ts: 6000,
  },
  {
    role: "agent",
    text: "That's exciting — starting a new chapter. What kind of property are you imagining? House, apartment, townhouse?",
    ts: 10000,
  },
  {
    role: "user",
    text: "Ideally a house, or at least a larger apartment. We need at minimum three bedrooms. My partner works from home two days a week so we need a proper study or a third room we can use as an office. Two-bedroom is completely off the table.",
    ts: 16000,
  },
  {
    role: "agent",
    text: "Three bedrooms minimum with dedicated workspace. What areas are you looking at?",
    ts: 21000,
  },
  {
    role: "user",
    text: "Mainly the suburbs. We're fine with a commute as long as it's under 45 minutes. The downtown stuff feels overpriced for what you get, and waterfront is completely out of our budget. We want a decent neighbourhood with good schools nearby, even if we don't need them yet.",
    ts: 28000,
  },
  {
    role: "agent",
    text: "Smart thinking ahead. Can you give me a sense of your budget?",
    ts: 33000,
  },
  {
    role: "user",
    text: "We've been pre-approved up to 650k but we'd rather stay closer to 550 to 580. We don't want to stretch ourselves too thin. We've seen what happens when people buy at the absolute top of their budget and then something goes wrong.",
    ts: 40000,
  },
  {
    role: "agent",
    text: "Very sensible. What are your absolute must-haves — things a property needs to have for you to even consider it?",
    ts: 45000,
  },
  {
    role: "user",
    text: "Three bedrooms, at least two bathrooms, off-street parking for two cars — my partner has a company car — some kind of outdoor space even if it's just a small yard or decent balcony. And it has to be move-in ready or close to it. We genuinely don't have the time or budget for a renovation project.",
    ts: 53000,
  },
  {
    role: "agent",
    text: "Got it. And dealbreakers — things that would make you walk away immediately?",
    ts: 58000,
  },
  {
    role: "user",
    text: "Anything under three bedrooms is out. No parking is an instant no. We won't touch anything in a flood zone or with structural issues. And very high strata fees are a dealbreaker too — we've seen places where fees add a thousand dollars a month on top of the mortgage.",
    ts: 65000,
  },
  {
    role: "agent",
    text: "All very reasonable. What's your timeline?",
    ts: 69000,
  },
  {
    role: "user",
    text: "Three to four months ideally. Our lease is up in five months so we have a bit of flexibility, but we don't want to be rushing at the end. We've been actively looking for about six weeks so we have a clear sense of the market.",
    ts: 76000,
  },
  {
    role: "agent",
    text: "You're well into the search then. What would make a property 'the one' — the thing that makes you say yes, this is it?",
    ts: 81000,
  },
  {
    role: "user",
    text: "A proper backyard — not a tiny courtyard, an actual lawn. A kitchen that doesn't feel cramped. Enough storage. A neighbourhood where you can walk to a coffee shop or a park. We're not looking for luxury at all, we're looking for somewhere we'll still love in ten years. Well-built, practical, doesn't need major work in five years.",
    ts: 89000,
  },
  {
    role: "agent",
    text: "That's a really clear picture — a well-built family home in a liveable suburb, space to grow, practical over flashy. Anything else before we look at matches?",
    ts: 94000,
  },
  {
    role: "user",
    text: "One more thing — we're not interested in anywhere overpriced just because of the postcode. We'd genuinely rather have a great home in a slightly less fashionable area than a mediocre place in a hot suburb. Value matters a lot to us.",
    ts: 100000,
  },
];

// ── Insert transcript ─────────────────────────────────────────────────────────
const id = cuid();
db.prepare(
  "INSERT INTO Transcript (id, buyerId, raw, createdAt) VALUES (?, ?, ?, ?)"
).run(id, buyer.id, JSON.stringify(lines), new Date().toISOString());

console.log("✓ Sample transcript seeded");
console.log("  Buyer:        ", buyer.email, `(id: ${buyer.id})`);
console.log("  Transcript ID:", id);
console.log("  Lines:        ", lines.length);
console.log("\nTo test Step 2c:");
console.log("  1. npm run dev");
console.log("  2. Log in as buyer@demo.com / buyer123");
console.log("  3. Navigate to /processing — click 'Use demo transcript'");

db.close();
