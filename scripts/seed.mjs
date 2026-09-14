/**
 * Seed script using better-sqlite3 directly (bypasses Prisma TS generator).
 * Run:  node scripts/seed.mjs
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../dev.db");
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production-use-a-long-random-string";

const db = new Database(DB_PATH);

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Seed ─────────────────────────────────────────────────────────────────────

console.log("Seeding database at:", DB_PATH, "\n");

const buyerHash = await bcrypt.hash("buyer123", 12);
const buyer = upsertUser("buyer@demo.com", buyerHash, "buyer");
console.log(`Buyer: ${buyer.email} (id: ${buyer.id})`);

const buyerToken = jwt.sign(
  { userId: buyer.id, email: buyer.email, role: buyer.role },
  JWT_SECRET,
  { expiresIn: "7d" }
);

console.log("\n" + "─".repeat(72));
console.log("MANUAL TESTS\n");
console.log("1. Start the server:  npm run dev\n");
console.log("2. Test /api/match with curl:\n");
console.log(`curl -s -X POST http://localhost:3000/api/match \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "Authorization: Bearer ${buyerToken}" \\`);
console.log(`  -d '{"buyerProfile":{"expectedScore":90,"minAcceptanceScore":55}}' \\`);
console.log(`  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"`);
console.log("\nUI login credentials:");
console.log("   Buyer: buyer@demo.com / buyer123");
console.log("─".repeat(72));

db.close();
