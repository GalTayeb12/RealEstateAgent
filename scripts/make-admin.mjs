/**
 * scripts/make-admin.mjs
 *
 * Elevates an existing user to the "admin" role.
 * Reads DATABASE_URL from .env / .env.local automatically.
 *
 * Usage:
 *   node scripts/make-admin.mjs <email>
 *
 * Example:
 *   node scripts/make-admin.mjs admin@example.com
 */
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local then .env (simple manual parse so we don't need dotenv as a dep)
for (const file of [".env.local", ".env"]) {
  try {
    const content = readFileSync(resolve(__dirname, "..", file), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)="?([^"]*)"?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch { /* file doesn't exist — skip */ }
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL is not set. Add it to .env.local");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

try {
  const { rows } = await client.query(
    `SELECT id, email, role FROM "User" WHERE email = $1`,
    [email]
  );

  if (rows.length === 0) {
    console.error(`Error: no user found with email "${email}"`);
    process.exit(1);
  }

  const user = rows[0];

  if (user.role === "admin") {
    console.log(`"${email}" is already an admin (id: ${user.id}). No change made.`);
    process.exit(0);
  }

  await client.query(
    `UPDATE "User" SET role = 'admin' WHERE id = $1`,
    [user.id]
  );

  const { rows: updated } = await client.query(
    `SELECT id, email, role FROM "User" WHERE id = $1`,
    [user.id]
  );

  console.log("Done.");
  console.log(`  id:    ${updated[0].id}`);
  console.log(`  email: ${updated[0].email}`);
  console.log(`  role:  ${updated[0].role}`);
} finally {
  await client.end();
}
