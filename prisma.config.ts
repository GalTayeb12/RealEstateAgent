import { config as dotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local overrides (mirrors Next.js precedence).
// This is needed because the Prisma CLI evaluates this file before its own
// dotenvx injection reaches process.env.
dotenv({ path: ".env" });
dotenv({ path: ".env.local", override: true });

const url = process.env["DATABASE_URL"];
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Add your Neon connection string to .env.local before running Prisma CLI commands."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: { url },
});
