/**
 * Which repository the server uses.
 *   STUDIO_STORE=file    (default in development) JSON files through the Storage driver (.storage/)
 *   STUDIO_STORE=prisma  Postgres via lib/prisma (set DATABASE_URL to a DEV database first:
 *                        node scripts/studio/assert-dev-db.mjs)
 * Production must set STUDIO_STORE explicitly: the file store is not shared between server instances.
 */
import { getStorage } from "../../storage";
import { StorageKv } from "./kv";
import { KvDesignRepo } from "./kvRepo";
import type { DesignRepo } from "./types";

let cached: DesignRepo | null = null;

export async function getRepo(): Promise<DesignRepo> {
  if (cached) return cached;
  const store = process.env.STUDIO_STORE ?? (process.env.NODE_ENV === "production" ? "" : "file");
  if (store === "prisma") {
    const [{ prisma }, { PrismaDesignRepo }] = await Promise.all([import("@/lib/prisma"), import("./prismaRepo")]);
    cached = new PrismaDesignRepo(prisma);
  } else if (store === "file") {
    cached = new KvDesignRepo(new StorageKv(getStorage()));
  } else {
    throw new Error("STUDIO_STORE must be set to 'file' or 'prisma' in production");
  }
  return cached;
}
